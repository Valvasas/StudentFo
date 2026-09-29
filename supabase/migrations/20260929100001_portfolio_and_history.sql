-- =====================================================================
-- Portofolio pengguna, profil publik, riwayat acara penyelenggara
-- (ADR-046).
--
--   * Portofolio BUKAN tabel baru: ia pandangan atas baris
--     application_tracker yang sudah "Sudah daftar" atau lebih jauh
--     (APPLIED/INTERVIEW/ACCEPTED). Tidak ada salinan yang harus
--     disinkronkan — status berubah, portofolio ikut berubah.
--   * Hasil (juara, finalis, …) DILAPORKAN SENDIRI oleh pemiliknya; aplikasi
--     menandainya begitu di tampilan publik.
--   * Tampil ke orang lain hanya lewat fungsi di bawah, dengan aturan
--     kelihatan yang SAMA dengan jaringan (ADR-040/041): bisa ditemukan ATAU
--     punya koneksi/ajakan dengan pembaca, dan tidak saling memblokir.
--     Beasiswa & magang privat secara bawaan; "Ditolak" tidak pernah tampil.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kolom portofolio di tracker. Hak baca/tulisnya ikut policy
--    tracker_own (pemilik saja); orang lain membaca lewat fungsi §3.
-- ---------------------------------------------------------------------
ALTER TABLE public.application_tracker
  ADD COLUMN achievement VARCHAR(20)
    CONSTRAINT application_tracker_achievement_known CHECK (
      achievement IN ('PESERTA', 'FINALIS', 'JUARA_HARAPAN', 'JUARA_3', 'JUARA_2', 'JUARA_1', 'PENERIMA', 'BERSERTIFIKAT')
    ),
  ADD COLUMN achievement_note VARCHAR(120)
    CONSTRAINT application_tracker_achievement_note_length
      CHECK (achievement_note IS NULL OR char_length(btrim(achievement_note)) BETWEEN 1 AND 120),
  -- Hanya https: tautan ini dibuka orang lain dari profil publik.
  ADD COLUMN proof_url VARCHAR(500)
    CONSTRAINT application_tracker_proof_https CHECK (proof_url IS NULL OR proof_url ~ '^https://[^[:space:]]+$'),
  -- NULL = ikut aturan bawaan per jenis (portfolio_default_visible).
  ADD COLUMN portfolio_visible BOOLEAN;

-- Beasiswa & magang menyangkut kondisi ekonomi dan lamaran kerja: privat
-- sampai pemiliknya sendiri memilih menampilkannya. HARUS sama dengan
-- `defaultPortfolioVisible()` di src/lib/portfolio.ts.
CREATE OR REPLACE FUNCTION public.portfolio_default_visible(p_type event_type)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_type NOT IN ('BEASISWA', 'MAGANG');
$$;

REVOKE ALL ON FUNCTION public.portfolio_default_visible(event_type) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Siapa boleh melihat profil siapa — satu tempat untuk §3 dan §4.
--    Hanya dipanggil fungsi SECURITY DEFINER di bawah; tidak diberikan ke
--    klien supaya tidak jadi orakel "apakah orang ini ada".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_profile(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (select auth.uid()) IS NOT NULL AND (
    (select auth.uid()) = p_user
    OR (
      NOT public.is_blocked((select auth.uid()), p_user)
      AND (
        EXISTS (SELECT 1 FROM public.network_profiles WHERE user_id = p_user AND is_discoverable)
        OR EXISTS (
          SELECT 1 FROM public.connections c
          WHERE (c.requester_id = (select auth.uid()) AND c.addressee_id = p_user)
             OR (c.addressee_id = (select auth.uid()) AND c.requester_id = p_user)
        )
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_profile(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Profil publik: kolom yang SAMA dengan network_directory (tanpa email)
--    + hubungan dengan pembaca. Nol baris = tidak boleh dilihat / tidak ada
--    (sengaja tidak dibedakan).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_profile(p_user UUID)
RETURNS TABLE (
  user_id         UUID,
  full_name       TEXT,
  headline        TEXT,
  education_level education_level,
  major           TEXT,
  interests       TEXT[],
  relation        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.id,
    u.full_name::TEXT,
    np.headline::TEXT,
    u.education_level,
    u.major::TEXT,
    u.interests::TEXT[],
    CASE
      WHEN u.id = (select auth.uid()) THEN 'self'
      WHEN c.status = 'ACCEPTED' THEN 'connected'
      WHEN c.requester_id = u.id THEN 'incoming'
      WHEN c.addressee_id = u.id THEN 'outgoing'
    END
  FROM public.users u
  LEFT JOIN public.network_profiles np ON np.user_id = u.id
  LEFT JOIN public.connections c
    ON (c.requester_id = (select auth.uid()) AND c.addressee_id = u.id)
    OR (c.addressee_id = (select auth.uid()) AND c.requester_id = u.id)
  WHERE u.id = p_user AND public.can_view_profile(p_user);
$$;

REVOKE ALL ON FUNCTION public.public_profile(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_profile(UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Portofolio publik. Pemilik yang memanggil untuk dirinya sendiri
--    mendapat subset PUBLIK yang sama — itulah pratinjau "Lihat sebagai
--    publik". Daftar lengkap (termasuk privat & ditolak) dibaca pemilik
--    langsung dari application_tracker lewat tracker_own.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_portfolio(p_user UUID)
RETURNS TABLE (
  event_id         UUID,
  slug             TEXT,
  title            TEXT,
  organizer        TEXT,
  event_type       event_type,
  tracker_status   tracker_status,
  achievement      TEXT,
  achievement_note TEXT,
  proof_url        TEXT,
  deadline_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id,
    e.slug::TEXT,
    e.title::TEXT,
    e.organizer::TEXT,
    e.event_type,
    t.status,
    t.achievement::TEXT,
    t.achievement_note::TEXT,
    t.proof_url::TEXT,
    d.deadline_at,
    t.updated_at
  FROM public.application_tracker t
  JOIN public.events e ON e.id = t.event_id
  LEFT JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
  WHERE t.user_id = p_user
    AND public.can_view_profile(p_user)
    AND t.status IN ('APPLIED', 'INTERVIEW', 'ACCEPTED')
    AND e.status IN ('APPROVED', 'EXPIRED')
    AND COALESCE(t.portfolio_visible, public.portfolio_default_visible(e.event_type))
  ORDER BY COALESCE(d.deadline_at, t.updated_at) DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.public_portfolio(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_portfolio(UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Riwayat acara penyelenggara: acara yang dikelola dan sudah TUTUP,
--    dengan angka akhir seumur acara. Berbeda dari analitik per acara
--    (jendela 7–90 hari, audiens): ini rekap untuk membandingkan edisi.
--    Hak kelola hanya berlaku selama VERIFIED (sama dengan manages_event).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organizer_event_history()
RETURNS TABLE (
  event_id   UUID,
  slug       TEXT,
  title      TEXT,
  event_type event_type,
  status     event_status,
  closed_at  TIMESTAMPTZ,
  views      BIGINT,
  visitors   BIGINT,
  saves      BIGINT,
  clicks     BIGINT,
  applied    BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id,
    e.slug::TEXT,
    e.title::TEXT,
    e.event_type,
    e.status,
    d.deadline_at,
    COALESCE((SELECT sum(s.views) FROM public.event_daily_stats s WHERE s.event_id = e.id), 0)::BIGINT,
    COALESCE((SELECT sum(s.visitors) FROM public.event_daily_stats s WHERE s.event_id = e.id), 0)::BIGINT,
    (SELECT count(*) FROM public.saved_events se WHERE se.event_id = e.id),
    (SELECT count(*) FROM public.recommendation_signals r WHERE r.event_id = e.id AND r.kind = 'register_click'),
    (SELECT count(*) FROM public.application_tracker t WHERE t.event_id = e.id AND t.status IN ('APPLIED', 'INTERVIEW', 'ACCEPTED'))
  FROM public.event_managers m
  JOIN public.organizer_profiles o ON o.user_id = m.user_id AND o.status = 'VERIFIED'
  JOIN public.events e ON e.id = m.event_id
  LEFT JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
  WHERE m.user_id = (select auth.uid())
    AND (e.status = 'EXPIRED' OR (e.status = 'APPROVED' AND d.deadline_at < now()))
  ORDER BY d.deadline_at DESC NULLS LAST
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.organizer_event_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organizer_event_history() TO authenticated;

COMMENT ON FUNCTION public.public_portfolio(UUID) IS
  'Portofolio yang boleh dilihat pemanggil (ADR-046): APPLIED+ pada acara tayang/selesai, visibilitas per entri (bawaan: beasiswa & magang privat), aturan kelihatan = jaringan. Hasil dilaporkan sendiri.';
COMMENT ON FUNCTION public.organizer_event_history() IS
  'Rekap acara yang dikelola pemanggil (penyelenggara VERIFIED) dan sudah tutup, angka seumur acara (ADR-046).';
