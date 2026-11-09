-- =====================================================================
-- Profil: tempat studi, domisili, bidang spesifik, username & bio,
-- keterlihatan profil (ADR-075, ADR-076, ADR-077)
--
-- 1. Kategori baru — 12 kategori awal tidak menampung banyak prodi/jurusan
--    (teknik sipil ≠ "Teknologi & IT", akuntansi ≠ "Bisnis & Kewirausahaan",
--    pertanian, bahasa, media, keagamaan, pariwisata tidak punya rumah).
--    Pipeline AI membaca daftar ini dari tabel, jadi ikut terpakai tanpa
--    perubahan kode pipeline.
-- 2. `users.study_fields` — bidang spesifik (mis. "kecerdasan-buatan") dari
--    taksonomi kode `src/lib/study-fields.ts`; induknya tetap kategori di
--    `interests`, yang dibaca skor rekomendasi. Slug dicek aplikasi; di sini
--    bentuk & jumlahnya saja.
-- 3. `users.institution_id/_name` — tempat studi dari direktori resmi
--    (NPSN/kode PT) atau diketik bebas. DIISI SENDIRI, bukan terverifikasi.
-- 4. `users.domicile_code` — kode Kemendagri sampai kecamatan. Kecamatan
--    tidak pernah keluar dari baris pemiliknya: RPC di bawah memotongnya ke
--    kab/kota.
-- 5. `users.username` (unik, huruf kecil) & `bio` — halaman `/u/[username]`.
-- 6. `users.profile_visibility` — MEMBERS (bawaan: semua anggota yang MASUK
--    boleh membuka profil, mengajak terhubung, dan memblokir) atau NETWORK
--    (aturan lama ADR-040: hanya bila bisa ditemukan / berkoneksi / satu
--    lobi). Tamu & mesin pencari tidak pernah: semua fungsi di bawah butuh
--    auth.uid(). "Bisa ditemukan" di direktori Koneksi TETAP opt-in.
-- 7. `public_profile_details(uuid[])` — yang boleh dilihat orang lain, dengan
--    aturan siapa-boleh-melihat yang sama dengan lencana publik (ADR-072).
--    `network_directory` SENGAJA tidak ditambah kolom (ADR-040/041).
--
-- Hanya CREATE OR REPLACE / ALTER / ADD (tanpa menghapus objek), jadi penerapannya
-- tidak meminta konfirmasi "perintah destruktif".
-- =====================================================================

INSERT INTO public.categories (name, slug) VALUES
  ('Teknik & Rekayasa',                'teknik'),
  ('Ekonomi, Keuangan & Akuntansi',    'ekonomi'),
  ('Pertanian, Peternakan & Kelautan', 'pertanian'),
  ('Bahasa & Sastra',                  'bahasa'),
  ('Komunikasi & Media',               'media'),
  ('Keagamaan',                        'agama'),
  ('Pariwisata & Kuliner',             'pariwisata')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.users
  ADD COLUMN study_fields     TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN institution_id   VARCHAR(12),
  ADD COLUMN institution_name VARCHAR(120),
  ADD COLUMN domicile_code    VARCHAR(8),
  -- 15 = STUDY_FIELD_LIMIT; slug berhuruf kecil-angka-strip (pola `interests`).
  ADD CONSTRAINT users_study_fields_shape CHECK (
    cardinality(study_fields) <= 15
    AND array_to_string(study_fields, ',') ~ '^([a-z0-9-]{1,60}(,|$))*$'
  ),
  ADD CONSTRAINT users_institution_id_shape CHECK (institution_id IS NULL OR institution_id ~ '^[0-9A-Z]{5,12}$'),
  ADD CONSTRAINT users_institution_name_length CHECK (institution_name IS NULL OR char_length(btrim(institution_name)) BETWEEN 2 AND 120),
  -- Id tanpa nama tidak bisa ditampilkan bila direktori suatu saat tidak memuatnya lagi.
  ADD CONSTRAINT users_institution_named CHECK (institution_id IS NULL OR institution_name IS NOT NULL),
  -- 'LN' = luar negeri (ABROAD_CODE di src/lib/wilayah.ts).
  ADD CONSTRAINT users_domicile_code_shape CHECK (domicile_code IS NULL OR domicile_code = 'LN' OR domicile_code ~ '^[0-9]{2}(\.[0-9]{2}(\.[0-9]{2})?)?$');

COMMENT ON COLUMN public.users.study_fields IS 'Bidang peminatan spesifik (slug src/lib/study-fields.ts), induknya di interests (ADR-075).';
COMMENT ON COLUMN public.users.institution_id IS 'NPSN / kode PT dari direktori tempat studi (ADR-076); diisi sendiri, tidak terverifikasi.';
COMMENT ON COLUMN public.users.domicile_code IS 'Kode wilayah Kemendagri sampai kecamatan; orang lain hanya melihat kab/kota (public_profile_details).';

ALTER TABLE public.users
  ADD COLUMN username           VARCHAR(30),
  ADD COLUMN bio                VARCHAR(280),
  ADD COLUMN profile_visibility VARCHAR(8) NOT NULL DEFAULT 'MEMBERS',
  -- Cermin USERNAME_PATTERN & RESERVED_USERNAMES di src/lib/profile-identity.ts (dikunci tes).
  ADD CONSTRAINT users_username_shape CHECK (
    username IS NULL OR (
      username ~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$'
      AND username !~ '[._]{2}'
      AND username NOT IN ('admin', 'administrator', 'moderator', 'studentfo', 'support', 'bantuan', 'api', 'root', 'system', 'official', 'resmi', 'help', 'null', 'undefined')
    )
  ),
  ADD CONSTRAINT users_bio_length CHECK (bio IS NULL OR char_length(btrim(bio)) BETWEEN 1 AND 280),
  ADD CONSTRAINT users_profile_visibility_values CHECK (profile_visibility IN ('MEMBERS', 'NETWORK'));

-- Unik tanpa membedakan huruf: aplikasi menyimpan huruf kecil, CHECK di atas menolak huruf besar.
CREATE UNIQUE INDEX users_username_key ON public.users (username) WHERE username IS NOT NULL;

COMMENT ON COLUMN public.users.username IS 'Nama pengguna unik untuk /u/[username] (ADR-077).';
COMMENT ON COLUMN public.users.profile_visibility IS 'MEMBERS = semua anggota yang masuk boleh membuka profil; NETWORK = aturan ADR-040.';

-- Hak UPDATE tabel ini PER KOLOM (migration 20260913100001, AGENTS §14).
GRANT UPDATE (study_fields, institution_id, institution_name, domicile_code, username, bio, profile_visibility) ON public.users TO authenticated;

-- ---------------------------------------------------------------------
-- Keterlihatan profil (ADR-077). Isi identik dengan 20261020100001,
-- ditambah klausa profil terbuka untuk anggota.
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
  ) OR EXISTS (
    SELECT 1 FROM public.users WHERE id = p_user AND profile_visibility = 'MEMBERS' AND suspended_at IS NULL
  );
$$;

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
        OR EXISTS (SELECT 1 FROM public.users WHERE id = p_user AND profile_visibility = 'MEMBERS' AND suspended_at IS NULL)
        OR EXISTS (
          SELECT 1 FROM public.connections c
          WHERE (c.requester_id = (select auth.uid()) AND c.addressee_id = p_user)
             OR (c.addressee_id = (select auth.uid()) AND c.requester_id = p_user)
        )
      )
    )
  );
$$;

-- /u/[username] → id, HANYA bila pembaca boleh melihat profilnya: username
-- yang tidak ada dan yang tidak boleh dilihat sama-sama null (404 yang sama),
-- supaya halaman ini bukan alat menebak siapa yang terdaftar.
CREATE OR REPLACE FUNCTION public.user_id_by_username(p_username TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id FROM public.users u
  WHERE u.username = lower(btrim(p_username))
    AND u.suspended_at IS NULL
    AND public.can_view_profile(u.id);
$$;

REVOKE ALL ON FUNCTION public.user_id_by_username(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_id_by_username(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_profile_details(p_users UUID[])
RETURNS TABLE (user_id UUID, institution_id VARCHAR, institution_name VARCHAR, region_code TEXT, study_fields TEXT[], username VARCHAR, bio VARCHAR)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.id,
    u.institution_id,
    u.institution_name,
    -- Kecamatan dipotong: cukup untuk "dari mana", tidak cukup untuk menemukan rumah.
    left(u.domicile_code, 5),
    u.study_fields,
    u.username,
    u.bio
  FROM public.users u
  WHERE u.id = ANY (p_users[1:100])
    AND u.suspended_at IS NULL
    AND (
      u.id = (select auth.uid())
      OR public.can_view_profile(u.id)
      OR (public.shares_lobby_with(u.id) AND NOT public.is_blocked((select auth.uid()), u.id))
    );
$$;

REVOKE ALL ON FUNCTION public.public_profile_details(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_profile_details(UUID[]) TO authenticated;
