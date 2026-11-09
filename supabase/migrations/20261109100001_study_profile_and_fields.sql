-- =====================================================================
-- Tempat studi, domisili & bidang peminatan spesifik (ADR-075, ADR-076)
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
-- 5. `public_study_profiles(uuid[])` — yang boleh dilihat orang lain, dengan
--    aturan siapa-boleh-melihat yang sama dengan lencana publik (ADR-072).
--    `network_directory` SENGAJA tidak ditambah kolom (ADR-040/041).
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
  ADD CONSTRAINT users_domicile_code_shape CHECK (domicile_code IS NULL OR domicile_code ~ '^[0-9]{2}(\.[0-9]{2}(\.[0-9]{2})?)?$');

COMMENT ON COLUMN public.users.study_fields IS 'Bidang peminatan spesifik (slug src/lib/study-fields.ts), induknya di interests (ADR-075).';
COMMENT ON COLUMN public.users.institution_id IS 'NPSN / kode PT dari direktori tempat studi (ADR-076); diisi sendiri, tidak terverifikasi.';
COMMENT ON COLUMN public.users.domicile_code IS 'Kode wilayah Kemendagri sampai kecamatan; orang lain hanya melihat kab/kota (public_study_profiles).';

-- Hak UPDATE tabel ini PER KOLOM (migration 20260913100001, AGENTS §14).
GRANT UPDATE (study_fields, institution_id, institution_name, domicile_code) ON public.users TO authenticated;

CREATE OR REPLACE FUNCTION public.public_study_profiles(p_users UUID[])
RETURNS TABLE (user_id UUID, institution_id VARCHAR, institution_name VARCHAR, region_code TEXT, study_fields TEXT[])
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
    u.study_fields
  FROM public.users u
  WHERE u.id = ANY (p_users[1:100])
    AND u.suspended_at IS NULL
    AND (
      u.id = (select auth.uid())
      OR public.can_view_profile(u.id)
      OR (public.shares_lobby_with(u.id) AND NOT public.is_blocked((select auth.uid()), u.id))
    );
$$;

REVOKE ALL ON FUNCTION public.public_study_profiles(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_study_profiles(UUID[]) TO authenticated;
