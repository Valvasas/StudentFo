-- =====================================================================
-- StudentFo — Pencocokan tim/partner (ADR-057)
--
-- Satu tabel baru:
--   * team_seekers — "kartu pemain": kota, keahlian yang dibawa, keahlian yang
--     dicari, kesediaan kerja daring, satu kalimat pengantar. BAWAAN TERTUTUP:
--     tidak ada yang dicocokkan tanpa memilihnya sendiri (pola ADR-040).
--
-- Satu fungsi baca:
--   * list_team_candidates() — kandidat yang kartunya terbuka, tanpa email,
--     tanpa yang memblokir/diblokir pemanggil, plus ringkasan portofolio
--     PUBLIK (aturan visibilitas sama dengan public_portfolio()).
--
-- Dua perubahan sadar atas fungsi yang sudah ada:
--   * is_discoverable() dan can_view_profile() ikut menghitung kartu yang
--     terbuka. Tanpa ini tombol "Ajak jadi partner" selalu ditolak policy
--     `connections` untuk orang yang membuka kartu tetapi tidak membuka
--     direktori Koneksi. Konsekuensinya DIUMUMKAN di form: membuka kartu =
--     profil (tanpa email) bisa dilihat dan orang bisa mengajak terhubung.
--     Direktori Koneksi sendiri (network_directory) TIDAK berubah.
--
-- Yang disimpan hanya NAMA KOTA. Jarak dihitung di aplikasi dari titik pusat
-- kota (src/lib/geo.ts); koordinat rumah tidak pernah ada di database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Daftar keahlian — satu-satunya sumber di SQL. HARUS sama dengan
--    TEAM_SKILLS di src/types/domain.ts (uji paritas matchmaking.test.ts).
--    Menambah slug = migration baru yang mengganti fungsi ini.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.team_skill_slugs()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    'web-aplikasi', 'data-ai', 'iot-elektronika',
    'ui-ux', 'grafis', 'video',
    'manajemen-proyek', 'pemasaran', 'kewirausahaan',
    'riset-kualitatif', 'statistik', 'penulisan-ilmiah',
    'presentasi', 'penulisan-kreatif', 'debat',
    'sains-lab', 'kesehatan-lingkungan', 'hukum-kebijakan'
  ]::TEXT[];
$$;

REVOKE ALL ON FUNCTION public.team_skill_slugs() FROM PUBLIC, anon, authenticated;
-- CHECK dievaluasi dengan hak pemanggil INSERT: tanpa EXECUTE untuk
-- `authenticated`, setiap tulis gagal dengan insufficient_privilege.
GRANT EXECUTE ON FUNCTION public.team_skill_slugs() TO authenticated;

-- ---------------------------------------------------------------------
-- 2. team_seekers
-- ---------------------------------------------------------------------
CREATE TABLE public.team_seekers (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  is_open    BOOLEAN NOT NULL DEFAULT FALSE,
  city       VARCHAR(60)
             CHECK (city IS NULL OR char_length(btrim(city)) BETWEEN 2 AND 60),
  skills     VARCHAR(24)[] NOT NULL DEFAULT '{}'
             CHECK (cardinality(skills) <= 6 AND skills::TEXT[] <@ public.team_skill_slugs()),
  seeking    VARCHAR(24)[] NOT NULL DEFAULT '{}'
             CHECK (cardinality(seeking) <= 6 AND seeking::TEXT[] <@ public.team_skill_slugs()),
  remote_ok  BOOLEAN NOT NULL DEFAULT TRUE,
  pitch      VARCHAR(140)
             CHECK (pitch IS NULL OR char_length(btrim(pitch)) BETWEEN 1 AND 140),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Kartu terbuka harus berguna dan terjangkau: ada keahlian, dan ada kota
  -- atau kesediaan daring. Form sudah menegakkannya; ini penjaga untuk klien lain.
  CONSTRAINT team_seekers_open_is_usable
    CHECK (NOT is_open OR (cardinality(skills) >= 1 AND (city IS NOT NULL OR remote_ok)))
);

CREATE TRIGGER trg_team_seekers_touch
  BEFORE UPDATE ON public.team_seekers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Daftar kandidat memindai hanya kartu terbuka, yang paling baru aktif dulu.
CREATE INDEX idx_team_seekers_open ON public.team_seekers (updated_at DESC, user_id) WHERE is_open;

ALTER TABLE public.team_seekers ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_seekers_select_own ON public.team_seekers
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY team_seekers_insert_own ON public.team_seekers
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY team_seekers_update_own ON public.team_seekers
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY team_seekers_delete_own ON public.team_seekers
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- Hak per kolom (AGENTS.md §14/§15): cabut hak tabel dulu, baru beri kolomnya.
REVOKE ALL ON public.team_seekers FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.team_seekers TO authenticated;
GRANT INSERT (user_id, is_open, city, skills, seeking, remote_ok, pitch) ON public.team_seekers TO authenticated;
GRANT UPDATE (is_open, city, skills, seeking, remote_ok, pitch) ON public.team_seekers TO authenticated;

COMMENT ON TABLE public.team_seekers IS
  'Kartu pemain untuk pencocokan tim (ADR-057). Bawaan tertutup. Hanya nama kota yang disimpan; jarak dihitung di aplikasi.';

-- ---------------------------------------------------------------------
-- 3. Kartu terbuka = bisa dilihat dan diajak
--
-- Sama persis dengan versi 20260927100001 / 20260929100001 ditambah satu
-- EXISTS. Tanpa ini policy INSERT `connections` menolak mengajak orang yang
-- hanya membuka kartu, dan profil publiknya 404.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_discoverable(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.network_profiles WHERE user_id = p_user AND is_discoverable
  ) OR EXISTS (
    SELECT 1 FROM public.team_seekers WHERE user_id = p_user AND is_open
  );
$$;

REVOKE ALL ON FUNCTION public.is_discoverable(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_discoverable(UUID) TO authenticated;

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
        OR EXISTS (SELECT 1 FROM public.team_seekers WHERE user_id = p_user AND is_open)
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
-- 4. list_team_candidates — jendela kandidat untuk pemeringkat di aplikasi
--
-- Dua penjaga yang disengaja:
--   * TIMBAL-BALIK: pemanggil harus punya kartu terbuka sendiri. Orang tidak
--     bisa menelusuri kartu orang lain tanpa menjadi bagian dari yang
--     ditelusuri — mempersulit pemanenan lewat akun yang tidak pernah muncul.
--   * Dibatasi 400 baris per panggilan (di bawah max_rows PostgREST = 1000).
--
-- Portofolio: hanya entri PUBLIK, aturan yang sama dengan public_portfolio()
-- (status tracker APPLIED+, acara tayang/selesai, visibilitas per jenis).
-- 'NONE' = ikut serta tanpa hasil yang dilaporkan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_team_candidates(p_limit INT DEFAULT 200)
RETURNS TABLE (
  user_id                UUID,
  full_name              TEXT,
  headline               TEXT,
  education_level        education_level,
  major                  TEXT,
  interests              TEXT[],
  city                   TEXT,
  skills                 TEXT[],
  seeking                TEXT[],
  remote_ok              BOOLEAN,
  pitch                  TEXT,
  portfolio_count        INT,
  portfolio_achievements TEXT[],
  relation               TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT s.user_id AS uid
    FROM public.team_seekers s
    WHERE s.user_id = (select auth.uid()) AND s.is_open
  )
  SELECT
    u.id,
    u.full_name::TEXT,
    np.headline::TEXT,
    u.education_level,
    u.major::TEXT,
    u.interests::TEXT[],
    s.city::TEXT,
    s.skills::TEXT[],
    s.seeking::TEXT[],
    s.remote_ok,
    s.pitch::TEXT,
    COALESCE(pf.entry_count, 0),
    COALESCE(pf.achievements, ARRAY[]::TEXT[]),
    CASE
      WHEN c.status = 'ACCEPTED' THEN 'connected'
      WHEN c.requester_id = u.id THEN 'incoming'
      WHEN c.addressee_id = u.id THEN 'outgoing'
    END
  FROM me
  JOIN public.team_seekers s ON s.is_open AND s.user_id <> me.uid
  JOIN public.users u ON u.id = s.user_id
  LEFT JOIN public.network_profiles np ON np.user_id = u.id
  LEFT JOIN public.connections c
    ON (c.requester_id = me.uid AND c.addressee_id = u.id)
    OR (c.addressee_id = me.uid AND c.requester_id = u.id)
  LEFT JOIN LATERAL (
    SELECT
      count(*)::INT AS entry_count,
      (array_agg(COALESCE(v.achievement, 'NONE') ORDER BY v.sort_key DESC))[1:10] AS achievements
    FROM (
      SELECT t.achievement::TEXT AS achievement, COALESCE(d.deadline_at, t.updated_at) AS sort_key
      FROM public.application_tracker t
      JOIN public.events e ON e.id = t.event_id
      LEFT JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
      WHERE t.user_id = u.id
        AND t.status IN ('APPLIED', 'INTERVIEW', 'ACCEPTED')
        AND e.status IN ('APPROVED', 'EXPIRED')
        AND COALESCE(t.portfolio_visible, public.portfolio_default_visible(e.event_type))
    ) v
  ) pf ON TRUE
  WHERE NOT EXISTS (
          SELECT 1 FROM public.connection_blocks b
          WHERE b.blocker_id = me.uid AND b.blocked_id = u.id
        )
    AND NOT EXISTS (
          SELECT 1 FROM public.connection_blocks b
          WHERE b.blocked_id = me.uid AND b.blocker_id = u.id
        )
  ORDER BY s.updated_at DESC, u.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 400);
$$;

REVOKE ALL ON FUNCTION public.list_team_candidates(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_team_candidates(INT) TO authenticated;

COMMENT ON FUNCTION public.list_team_candidates(INT) IS
  'Kandidat pencocokan tim: kartu terbuka, tanpa email, tanpa pemblokir/yang diblokir, portofolio publik saja. Pemanggil wajib membuka kartunya sendiri (ADR-057).';
