-- =====================================================================
-- StudentFo — Migration 0008: pengerasan keamanan & integritas (audit 2026-09-23)
--
-- Hasil audit menyeluruh atas migration 0001–0007. Setiap bagian menutup
-- satu temuan konkret; alasannya ditulis di bagian masing-masing. Lihat juga
-- DECISION.md ADR-019 dan ADR-020.
--
-- PELAJARAN UTAMA (sudah masuk AGENTS.md): Supabase memasang
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON TABLES / EXECUTE ON FUNCTIONS TO anon, authenticated;
-- Artinya setiap tabel, VIEW, dan fungsi baru LANGSUNG bisa dipakai `anon`
-- — hak itu diberikan ke role-nya secara eksplisit, BUKAN lewat PUBLIC.
-- `REVOKE ... FROM PUBLIC` saja tidak mencabutnya.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hak EXECUTE fungsi SECURITY DEFINER.
--
-- Migration 0002 hanya mencabut dari PUBLIC. `anon` dan `authenticated`
-- tetap memegang EXECUTE dari default privileges, sehingga siapa pun dengan
-- anon key (yang memang dikirim ke browser) bisa memanggil
-- `rpc('expire_past_events')` dan memicu penulisan massal ke `events`.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.expire_past_events() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_past_events() TO service_role;

-- is_admin() tetap perlu bagi `authenticated` (dievaluasi di dalam policy),
-- tapi tidak ada policy untuk `anon` yang memakainya.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

-- ---------------------------------------------------------------------
-- 2. View `team_member_profiles` terbaca tamu.
--
-- Migration 0007 bermaksud membatasinya ke `authenticated` (ADR-018), tapi
-- hanya mencabut dari PUBLIC — `anon` masih memegang ALL dari default
-- privileges. Satu request anonim ke /rest/v1/team_member_profiles
-- mengembalikan nama seluruh anggota tim.
-- ---------------------------------------------------------------------
REVOKE ALL ON public.team_member_profiles FROM anon, authenticated;
GRANT SELECT ON public.team_member_profiles TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Jumlah anggota tim untuk tamu.
--
-- Tamu boleh melihat daftar tim (`teams_public_read`) tapi tidak boleh
-- membaca `team_members` maupun nama anggota. Akibatnya setiap tim tampil
-- "0 dari N anggota" bagi tamu. View ini hanya membuka JUMLAH — tidak ada
-- identitas siapa pun di dalamnya. security_invoker = off (bawaan) disengaja,
-- dengan alasan yang sama seperti team_member_profiles.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.team_member_counts AS
SELECT team_id, COUNT(*)::INT AS member_count
FROM public.team_members
GROUP BY team_id;

REVOKE ALL ON public.team_member_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_member_counts TO anon, authenticated;

COMMENT ON VIEW public.team_member_counts IS
  'Jumlah anggota per tim, terbaca publik. Sengaja hanya team_id + jumlah; jangan tambah kolom identitas.';

-- ---------------------------------------------------------------------
-- 4. `team_members`: peran & kapasitas.
--
-- (a) Policy `team_members_self_join` hanya memeriksa `auth.uid() = user_id`.
--     Siapa pun bisa menyisipkan dirinya sendiri dengan role = 'leader' ke
--     tim ORANG LAIN lewat PostgREST, dan tampil sebagai "Ketua".
-- (b) Batas `slots_needed` hanya ditegakkan di aplikasi. Insert langsung
--     lewat PostgREST melewatinya, dan dua orang yang menekan "gabung"
--     bersamaan untuk slot terakhir bisa lolos keduanya.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS team_members_self_join ON public.team_members;
CREATE POLICY team_members_self_join ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      role = 'member'
      OR (
        role = 'leader'
        AND EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = team_members.team_id AND t.created_by = auth.uid()
        )
      )
    )
  );

-- SECURITY DEFINER karena `SELECT ... FOR UPDATE` atas `teams` butuh hak
-- UPDATE dan lolos policy UPDATE — yang hanya dimiliki ketua. Dijalankan
-- sebagai pemanggil, baris tim tidak terlihat bagi calon anggota dan
-- pemeriksaannya diam-diam terlewati.
CREATE OR REPLACE FUNCTION public.enforce_team_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  capacity      INT;
  current_count INT;
BEGIN
  -- Kunci baris tim: insert bersamaan ke tim yang sama antre di sini,
  -- sehingga hitungan di bawah selalu melihat anggota yang sudah masuk.
  SELECT slots_needed INTO capacity FROM public.teams WHERE id = NEW.team_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW; -- FK team_id yang akan menolak.
  END IF;

  SELECT COUNT(*) INTO current_count FROM public.team_members WHERE team_id = NEW.team_id;
  IF current_count >= capacity THEN
    -- Teks 'team_full' dibaca SupabaseEventRepository.joinTeam().
    RAISE EXCEPTION 'team_full' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_team_capacity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_team_members_capacity ON public.team_members;
CREATE TRIGGER trg_team_members_capacity
  BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_capacity();

-- ---------------------------------------------------------------------
-- 5. `teams`: tim hanya untuk event yang tayang.
--
-- `teams_owner_write` (FOR ALL) mengizinkan membuat tim untuk event PENDING
-- asal id-nya diketahui — jalan memutar untuk menandai antrean moderasi.
-- Mode seed sudah menolaknya (MemoryEventRepository.createTeam); di sini
-- produksi disamakan. Dipecah per perintah supaya syarat event hanya
-- berlaku saat INSERT: ketua tetap bisa membubarkan tim setelah event-nya
-- EXPIRED.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS teams_owner_write ON public.teams;

CREATE POLICY teams_owner_insert ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      auth.uid() = created_by
      AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = teams.event_id AND e.status = 'APPROVED')
    )
  );

CREATE POLICY teams_owner_update ON public.teams
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin())
  WITH CHECK (auth.uid() = created_by OR public.is_admin());

CREATE POLICY teams_owner_delete ON public.teams
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin());

-- ---------------------------------------------------------------------
-- 6. `saved_events` & `application_tracker`: hanya event yang terlihat.
--
-- Sebelumnya pengguna bisa menyimpan event PENDING/REJECTED asal tahu
-- id-nya. Trigger `sync_saved_count` (SECURITY DEFINER) lalu menaikkan
-- `saved_count` event yang belum tayang, dan produsen notifikasi ikut
-- memproses baris sampah. Syaratnya cermin `events_public_read`.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS saved_events_own ON public.saved_events;
CREATE POLICY saved_events_own ON public.saved_events
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = saved_events.event_id AND e.status IN ('APPROVED', 'EXPIRED')
    )
  );

DROP POLICY IF EXISTS tracker_own ON public.application_tracker;
CREATE POLICY tracker_own ON public.application_tracker
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = application_tracker.event_id AND e.status IN ('APPROVED', 'EXPIRED')
    )
  );

-- ---------------------------------------------------------------------
-- 7. Hak kolom (pola AGENTS.md §14: cabut hak tabel dulu, baru beri kolom).
-- ---------------------------------------------------------------------

-- notifications: pemilik hanya boleh menandai dibaca. Tanpa ini ia bisa
-- menulis ulang `message`/`type`/`event_id` notifikasinya sendiri.
REVOKE UPDATE ON public.notifications FROM anon, authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;

-- ugc_submissions: publik hanya mengisi email + payload. `status`, `id`,
-- dan `created_at` bukan milik pengirim.
REVOKE INSERT, UPDATE, DELETE ON public.ugc_submissions FROM anon, authenticated;
GRANT INSERT (submitted_by_email, payload) ON public.ugc_submissions TO anon, authenticated;
-- Admin mengelola kiriman lewat service_role (bypass RLS); `ugc_admin_read`
-- (FOR ALL) tetap berlaku untuk admin yang masuk lewat klien biasa.
GRANT SELECT, UPDATE (status) ON public.ugc_submissions TO authenticated;

-- ---------------------------------------------------------------------
-- 8. Batas ukuran untuk kolom yang bisa ditulis langsung dari browser.
--
-- Validasi Zod di aplikasi tidak berlaku untuk request PostgREST langsung.
-- Tanpa batas, satu skrip bisa mengisi `ugc_submissions` (terbuka untuk
-- anon!) dengan payload bermegabyte. NOT VALID: baris lama tidak diperiksa
-- ulang, baris baru wajib patuh.
-- ---------------------------------------------------------------------
ALTER TABLE public.ugc_submissions
  ADD CONSTRAINT ugc_submissions_email_shape
    CHECK (char_length(submitted_by_email) BETWEEN 3 AND 254 AND submitted_by_email LIKE '%_@_%') NOT VALID,
  ADD CONSTRAINT ugc_submissions_payload_shape
    CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 16384) NOT VALID;

ALTER TABLE public.application_tracker
  ADD CONSTRAINT application_tracker_notes_length CHECK (char_length(notes) <= 500) NOT VALID;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_description_length CHECK (char_length(description) <= 1000) NOT VALID;

-- ---------------------------------------------------------------------
-- 9. Persetujuan kiriman komunitas — atomik.
--
-- Menyalin kiriman ke `events` menyentuh empat tabel. Dirangkai dari
-- aplikasi sebagai request terpisah, kegagalan di tengah meninggalkan event
-- tayang tanpa tenggat, atau kiriman yang tetap PENDING padahal eventnya
-- sudah ada. Di sini semuanya satu transaksi.
--
-- Payload dibaca dari JSONB sebagai data TIDAK dipercaya: cast enum yang
-- gagal, URL yang tidak lolos CHECK `^https?://`, atau duplikat dedup_hash
-- membatalkan seluruh transaksi dengan SQLSTATE yang dipetakan aplikasi
-- (lihat SupabaseEventRepository.reviewSubmission).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_submission(p_submission_id UUID, p_reviewer_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  submission   public.ugc_submissions%ROWTYPE;
  p            JSONB;
  new_event_id UUID;
BEGIN
  SELECT * INTO submission FROM public.ugc_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR submission.status <> 'PENDING' THEN
    RAISE EXCEPTION 'submission_not_found' USING ERRCODE = 'P0002';
  END IF;
  p := submission.payload;

  -- slug & dedup_hash diisi trigger events_fill_derived().
  INSERT INTO public.events (
    title, organizer, description, event_type, registration_link, source_url,
    education_levels, location, is_online, status, reviewed_by, reviewed_at
  )
  VALUES (
    btrim(p ->> 'title'),
    btrim(p ->> 'organizer'),
    NULLIF(btrim(p ->> 'description'), ''),
    (p ->> 'event_type')::event_type,
    p ->> 'registration_link',
    COALESCE(NULLIF(p ->> 'source_url', ''), p ->> 'registration_link'),
    ARRAY(
      SELECT value::education_level
      FROM jsonb_array_elements_text(COALESCE(p -> 'education_levels', '[]'::JSONB)) AS value
    ),
    NULLIF(btrim(p ->> 'location'), ''),
    COALESCE((p ->> 'is_online')::BOOLEAN, FALSE),
    'APPROVED',
    p_reviewer_id,
    NOW()
  )
  RETURNING id INTO new_event_id;

  INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
  VALUES (new_event_id, 'registration', (p ->> 'deadline_at')::TIMESTAMPTZ, TRUE);

  -- Slug kategori yang tidak dikenal diabaikan, bukan menggagalkan persetujuan.
  INSERT INTO public.event_categories (event_id, category_id)
  SELECT new_event_id, c.id
  FROM public.categories c
  WHERE c.slug IN (
    SELECT jsonb_array_elements_text(COALESCE(p -> 'category_slugs', '[]'::JSONB))
  );

  UPDATE public.ugc_submissions SET status = 'APPROVED' WHERE id = p_submission_id;

  RETURN new_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_submission(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_submission(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.approve_submission(UUID, UUID) IS
  'Salin kiriman ugc_submissions ke events (APPROVED) + tenggat + kategori dalam satu transaksi. Hanya service_role.';

-- ---------------------------------------------------------------------
-- 10. Index untuk pola query yang sudah ada di aplikasi.
-- ---------------------------------------------------------------------

-- Menu lonceng: "notifikasi terbaru milik user X", dibaca vs belum.
-- idx_notifications_unread (0001) hanya menutup yang BELUM dibaca.
CREATE INDEX IF NOT EXISTS idx_notifications_user_sent
  ON public.notifications (user_id, sent_at DESC);

-- Papan /tracker: "entri milik user X, terbaru diubah dulu".
CREATE INDEX IF NOT EXISTS idx_tracker_user_updated
  ON public.application_tracker (user_id, updated_at DESC);

-- Antrean moderasi kiriman: "PENDING, terlama dulu".
CREATE INDEX IF NOT EXISTS idx_ugc_submissions_status_created
  ON public.ugc_submissions (status, created_at);
