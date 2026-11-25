-- =====================================================================
-- Prestasi terverifikasi, peringkat kampus & mahasiswa, portofolio publik
-- (ADR-098). Port desain cabang usang `ccr-a2058300-u92ao5`
-- (`20260929110001_result_verification`, TIDAK di-merge — lihat CHANGELOG)
-- dengan pemeriksa = moderator.
--
-- Prinsip yang dipertahankan dari ADR-046/068:
--   * Hasil di portofolio tetap DILAPORKAN SENDIRI. Yang baru: pemiliknya
--     boleh MEMINTA moderator memeriksa buktinya. Hanya baris VERIFIED yang
--     dihitung peringkat — klaim tanpa saksi tidak pernah menaikkan skor.
--   * Yang diverifikasi adalah isi SAAT ITU (hasil + bukti + kampus). Hasil
--     atau bukti berubah, atau entri keluar dari portofolio → verifikasi
--     gugur (trigger). Mengganti kampus di profil TIDAK memindahkan prestasi
--     lama: kampus disalin saat pengajuan.
--   * Tabel tanpa hak tulis klien; pemilik hanya membaca barisnya sendiri.
--   * Peringkat mahasiswa hanya memuat yang menyalakan portofolio publik
--     (`users.portfolio_public`, bawaan MATI). Skor kampus adalah agregat
--     tanpa nama — disebut terang di form pengajuan.
-- Tanpa DROP.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Portofolio publik (opt-in, bawaan privat).
-- ---------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN portfolio_public BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.users.portfolio_public IS
  'TRUE = profil prestasi (nama, kampus, portofolio yang ditampilkan) terbuka di /u/<username> untuk siapa saja & masuk peringkat mahasiswa. Bawaan FALSE. ADR-098.';
GRANT UPDATE (portfolio_public) ON public.users TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Tabel verifikasi.
-- ---------------------------------------------------------------------
CREATE TABLE public.achievement_verifications (
  user_id          UUID NOT NULL,
  event_id         UUID NOT NULL,
  -- Hanya hasil kompetitif; cermin LEADERBOARD_RESULTS (src/types/domain.ts).
  result           VARCHAR(20) NOT NULL
    CONSTRAINT achievement_verifications_result_known
      CHECK (result IN ('JUARA_1', 'JUARA_2', 'JUARA_3', 'JUARA_HARAPAN', 'FINALIS')),
  proof_url        TEXT NOT NULL
    CONSTRAINT achievement_verifications_proof_shape CHECK (proof_url ~* '^https://[^\s]+$' AND char_length(proof_url) <= 500),
  -- Salinan saat pengajuan (bukan FK ke profil): prestasi milik kampus tempat ia diraih.
  institution_id   VARCHAR(20),
  institution_name VARCHAR(120),
  status           VARCHAR(10) NOT NULL DEFAULT 'PENDING'
    CONSTRAINT achievement_verifications_status_known CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  -- Presisi milidetik: dipakai sebagai token versi oleh review_achievement_verification().
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
  reviewed_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  review_note      VARCHAR(300)
    CONSTRAINT achievement_verifications_note_length CHECK (review_note IS NULL OR char_length(btrim(review_note)) BETWEEN 1 AND 300),
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (user_id, event_id) REFERENCES public.application_tracker (user_id, event_id) ON DELETE CASCADE,
  CONSTRAINT achievement_verifications_review_consistent CHECK (
    (status = 'PENDING' AND reviewed_at IS NULL)
    OR (status <> 'PENDING' AND reviewed_at IS NOT NULL)
  ),
  -- Penolakan selalu membawa alasan untuk pemiliknya.
  CONSTRAINT achievement_verifications_rejection_reason CHECK (status <> 'REJECTED' OR review_note IS NOT NULL)
);

-- Antrean moderator: tertua dulu.
CREATE INDEX idx_achievement_verifications_pending
  ON public.achievement_verifications (requested_at) WHERE status = 'PENDING';
-- Peringkat hanya membaca baris terverifikasi, dikelompokkan per kampus.
CREATE INDEX idx_achievement_verifications_verified
  ON public.achievement_verifications (institution_id) WHERE status = 'VERIFIED';
-- reviewed_by: FK tanpa index membuat hapus akun moderator memindai seluruh tabel.
CREATE INDEX idx_achievement_verifications_reviewer
  ON public.achievement_verifications (reviewed_by) WHERE reviewed_by IS NOT NULL;

ALTER TABLE public.achievement_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.achievement_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.achievement_verifications TO authenticated;

CREATE POLICY achievement_verifications_own_read ON public.achievement_verifications
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Verifikasi gugur saat isi yang diperiksa berubah.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_achievement_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Catatan hasil (achievement_note) bukan bagian yang diperiksa: mengubahnya tidak menggugurkan.
  IF NEW.achievement IS DISTINCT FROM OLD.achievement
     OR NEW.proof_url IS DISTINCT FROM OLD.proof_url
     OR NEW.status NOT IN ('APPLIED', 'INTERVIEW', 'ACCEPTED') THEN
    DELETE FROM public.achievement_verifications WHERE user_id = NEW.user_id AND event_id = NEW.event_id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_achievement_verification() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tracker_reset_achievement_verification
  AFTER UPDATE OF achievement, proof_url, status ON public.application_tracker
  FOR EACH ROW EXECUTE FUNCTION public.reset_achievement_verification();

-- ---------------------------------------------------------------------
-- 4. Bobot skor — SATU-SATUNYA salinan di SQL; cermin LEADERBOARD_WEIGHTS
--    di src/lib/leaderboard.ts (dikunci leaderboard.test.ts).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leaderboard_weight(p_result TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_result
    WHEN 'JUARA_1' THEN 10
    WHEN 'JUARA_2' THEN 8
    WHEN 'JUARA_3' THEN 6
    WHEN 'JUARA_HARAPAN' THEN 4
    WHEN 'FINALIS' THEN 2
    ELSE 0
  END;
$$;

REVOKE ALL ON FUNCTION public.leaderboard_weight(TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Pemilik: ajukan & batalkan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_achievement_verification(p_event UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid   UUID := (select auth.uid());
  entry RECORD;
BEGIN
  IF uid IS NULL OR EXISTS (SELECT 1 FROM public.users WHERE id = uid AND suspended_at IS NOT NULL) THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT t.status AS tracker_status, t.achievement, t.proof_url, e.event_type, e.status AS event_status, e.is_demo,
         (SELECT d.deadline_at FROM public.event_deadlines d WHERE d.event_id = e.id AND d.is_primary) AS primary_deadline
  INTO entry
  FROM public.application_tracker t
  JOIN public.events e ON e.id = t.event_id
  WHERE t.user_id = uid AND t.event_id = p_event;

  IF NOT FOUND
     OR entry.event_type <> 'LOMBA'
     OR entry.event_status NOT IN ('APPROVED', 'EXPIRED')
     OR entry.is_demo
     OR entry.tracker_status NOT IN ('APPLIED', 'INTERVIEW', 'ACCEPTED')
     OR entry.achievement IS NULL
     OR entry.achievement NOT IN ('JUARA_1', 'JUARA_2', 'JUARA_3', 'JUARA_HARAPAN', 'FINALIS') THEN
    RAISE EXCEPTION 'verification_not_eligible' USING ERRCODE = 'P0001';
  END IF;
  IF entry.proof_url IS NULL THEN
    RAISE EXCEPTION 'verification_needs_proof' USING ERRCODE = 'P0001';
  END IF;
  -- Hasil belum mungkin ada selama pendaftaran masih dibuka.
  IF entry.event_status = 'APPROVED' AND entry.primary_deadline IS NOT NULL AND entry.primary_deadline > now() THEN
    RAISE EXCEPTION 'verification_too_early' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.achievement_verifications WHERE user_id = uid AND event_id = p_event) THEN
    RAISE EXCEPTION 'verification_exists' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.achievement_verifications WHERE user_id = uid AND requested_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'verification_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.achievement_verifications (user_id, event_id, result, proof_url, institution_id, institution_name)
  SELECT uid, p_event, entry.achievement, entry.proof_url, u.institution_id, u.institution_name
  FROM public.users u WHERE u.id = uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_achievement_verification(p_event UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.achievement_verifications
  WHERE user_id = (select auth.uid()) AND event_id = p_event AND status = 'PENDING';
$$;

REVOKE ALL ON FUNCTION public.request_achievement_verification(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_achievement_verification(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_achievement_verification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_achievement_verification(UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Moderator: putuskan (service_role; pelaku diperiksa ulang di sini).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_achievement_verification(
  p_actor UUID, p_user UUID, p_event UUID, p_decision TEXT, p_note TEXT, p_requested_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_   public.achievement_verifications%ROWTYPE;
  note   TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  title  TEXT;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor AND role = 'ADMIN' AND suspended_at IS NULL) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;
  IF p_actor = p_user THEN
    RAISE EXCEPTION 'verification_self' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('VERIFIED', 'REJECTED') THEN
    RAISE EXCEPTION 'invalid_decision' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'REJECTED' AND (note IS NULL OR char_length(note) < 5) THEN
    RAISE EXCEPTION 'verification_note_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO row_ FROM public.achievement_verifications WHERE user_id = p_user AND event_id = p_event FOR UPDATE;
  IF NOT FOUND OR row_.status <> 'PENDING' THEN
    RAISE EXCEPTION 'verification_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Pemilik mengubah hasil/bukti lalu mengajukan ulang sejak kartu antrean dibuka.
  IF p_requested_at IS NULL OR date_trunc('milliseconds', p_requested_at) <> row_.requested_at THEN
    RAISE EXCEPTION 'verification_changed' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.achievement_verifications
  SET status = p_decision, reviewed_by = p_actor, reviewed_at = now(), review_note = left(note, 300)
  WHERE user_id = p_user AND event_id = p_event;

  SELECT left(e.title, 120) INTO title FROM public.events e WHERE e.id = p_event;
  INSERT INTO public.notifications (user_id, event_id, type, message)
  VALUES (
    p_user,
    p_event,
    'ACHIEVEMENT_' || p_decision,
    CASE p_decision
      WHEN 'VERIFIED' THEN format('Prestasimu di %s terverifikasi moderator dan kini dihitung di Peringkat.', title)
      ELSE format('Prestasimu di %s belum bisa diverifikasi: %s', title, left(note, 200))
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_achievement_verification(UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_achievement_verification(UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- ---------------------------------------------------------------------
-- 7. Peringkat (anon & anggota). Agregat; nama hanya untuk yang opt-in.
--    Tanggal prestasi = tahap terakhir lomba (biasanya pengumuman pemenang).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verified_achievements(p_since TIMESTAMPTZ, p_until TIMESTAMPTZ, p_category TEXT)
RETURNS TABLE (user_id UUID, result TEXT, institution_id TEXT, institution_name TEXT, achieved_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.user_id, v.result::text, v.institution_id::text, v.institution_name::text, a.achieved_at
  FROM public.achievement_verifications v
  JOIN public.events e ON e.id = v.event_id
  JOIN public.users u ON u.id = v.user_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(max(d.deadline_at), e.created_at) AS achieved_at
    FROM public.event_deadlines d WHERE d.event_id = e.id
  ) a
  WHERE v.status = 'VERIFIED'
    AND e.status IN ('APPROVED', 'EXPIRED')
    AND NOT e.is_demo
    AND u.suspended_at IS NULL
    AND (p_category IS NULL OR p_category = ANY (e.category_slugs))
    AND (p_since IS NULL OR a.achieved_at >= p_since)
    AND (p_until IS NULL OR a.achieved_at < p_until);
$$;

REVOKE ALL ON FUNCTION public.verified_achievements(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campus_leaderboard(p_since TIMESTAMPTZ, p_until TIMESTAMPTZ, p_category TEXT, p_limit INTEGER)
RETURNS TABLE (
  institution_id TEXT, institution_name TEXT, score INTEGER,
  juara_1 INTEGER, juara_2 INTEGER, juara_3 INTEGER, juara_harapan INTEGER, finalis INTEGER, people INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    v.institution_id,
    -- Nama salinan terbanyak untuk kampus itu (ejaan bisa berbeda antarpengajuan).
    mode() WITHIN GROUP (ORDER BY v.institution_name),
    sum(public.leaderboard_weight(v.result))::int,
    (count(*) FILTER (WHERE v.result = 'JUARA_1'))::int,
    (count(*) FILTER (WHERE v.result = 'JUARA_2'))::int,
    (count(*) FILTER (WHERE v.result = 'JUARA_3'))::int,
    (count(*) FILTER (WHERE v.result = 'JUARA_HARAPAN'))::int,
    (count(*) FILTER (WHERE v.result = 'FINALIS'))::int,
    (count(DISTINCT v.user_id))::int
  FROM public.verified_achievements(p_since, p_until, p_category) v
  WHERE v.institution_id IS NOT NULL
  GROUP BY v.institution_id
  ORDER BY 3 DESC, 4 DESC, 9 DESC, 1
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.people_leaderboard(p_since TIMESTAMPTZ, p_until TIMESTAMPTZ, p_category TEXT, p_limit INTEGER)
RETURNS TABLE (
  username TEXT, full_name TEXT, institution_name TEXT, score INTEGER,
  juara_1 INTEGER, juara_2 INTEGER, juara_3 INTEGER, juara_harapan INTEGER, finalis INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.username::text,
    u.full_name::text,
    -- Kampus pada prestasi terbaru, bukan profil sekarang (prestasi milik kampus tempat ia diraih).
    (array_agg(v.institution_name ORDER BY v.achieved_at DESC) FILTER (WHERE v.institution_name IS NOT NULL))[1],
    sum(public.leaderboard_weight(v.result))::int,
    (count(*) FILTER (WHERE v.result = 'JUARA_1'))::int,
    (count(*) FILTER (WHERE v.result = 'JUARA_2'))::int,
    (count(*) FILTER (WHERE v.result = 'JUARA_3'))::int,
    (count(*) FILTER (WHERE v.result = 'JUARA_HARAPAN'))::int,
    (count(*) FILTER (WHERE v.result = 'FINALIS'))::int
  FROM public.verified_achievements(p_since, p_until, p_category) v
  JOIN public.users u ON u.id = v.user_id
  WHERE u.portfolio_public
  GROUP BY u.id, u.username, u.full_name
  ORDER BY 4 DESC, 5 DESC, 2
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.campus_leaderboard(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.people_leaderboard(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campus_leaderboard(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_leaderboard(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Portofolio publik (anon & anggota) — hanya bila pemiliknya opt-in.
--    Isi = aturan `public_portfolio()` (status APPLIED+, visibilitas per
--    entri, REJECTED tidak pernah) + status verifikasi. Tanpa email,
--    domisili, atau kontak apa pun.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_portfolio_page(p_username TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'full_name', u.full_name,
    'username', u.username,
    'bio', u.bio,
    'education_level', u.education_level,
    'major', u.major,
    'institution_id', u.institution_id,
    'institution_name', u.institution_name,
    'study_fields', COALESCE(to_jsonb(u.study_fields), '[]'::jsonb),
    'skills', COALESCE((SELECT to_jsonb(s.skills) FROM public.team_seekers s WHERE s.user_id = u.id AND s.is_open), '[]'::jsonb),
    'entries', COALESCE((
      SELECT jsonb_agg(entry ORDER BY entry ->> 'deadline_at' DESC NULLS LAST)
      FROM (
        SELECT jsonb_build_object(
          'event_id', e.id, 'slug', e.slug, 'title', e.title, 'organizer', e.organizer, 'event_type', e.event_type,
          'status', t.status, 'achievement', t.achievement, 'achievement_note', t.achievement_note, 'proof_url', t.proof_url,
          'deadline_at', (SELECT d.deadline_at FROM public.event_deadlines d WHERE d.event_id = e.id AND d.is_primary),
          'verification', v.status
        ) AS entry
        FROM public.application_tracker t
        JOIN public.events e ON e.id = t.event_id
        LEFT JOIN public.achievement_verifications v ON v.user_id = t.user_id AND v.event_id = t.event_id
        WHERE t.user_id = u.id
          AND t.status IN ('APPLIED', 'INTERVIEW', 'ACCEPTED')
          AND COALESCE(t.portfolio_visible, public.portfolio_default_visible(e.event_type))
          AND e.status IN ('APPROVED', 'EXPIRED')
          AND NOT e.is_demo
        LIMIT 100
      ) entries
    ), '[]'::jsonb)
  )
  FROM public.users u
  WHERE u.username = lower(btrim(p_username))
    AND u.portfolio_public
    AND u.suspended_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.public_portfolio_page(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_portfolio_page(TEXT) TO anon, authenticated;
