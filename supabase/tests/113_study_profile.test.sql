-- Tempat studi, domisili & bidang spesifik (ADR-075/076): kategori baru ada,
-- pemilik bisa menulis kolomnya sendiri saja, bentuk nilai dijaga CHECK, dan
-- public_study_profiles() memakai aturan siapa-boleh-melihat yang sama dengan
-- lencana — kecamatan tidak pernah keluar.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f4a01', 'pemilik@studi', '{"full_name":"Pemilik Studi"}'),
  ('00000000-0000-4000-8000-0000000f4a02', 'pembaca@studi', '{"full_name":"Pembaca Studi"}'),
  ('00000000-0000-4000-8000-0000000f4a03', 'asing@studi', '{"full_name":"Orang Asing"}');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.categories WHERE slug IN ('teknik', 'ekonomi', 'pertanian', 'bahasa', 'media', 'agama', 'pariwisata')) <> 7 THEN
    RAISE EXCEPTION 'tujuh kategori baru harus ada';
  END IF;
END$$;

SET LOCAL ROLE authenticated;

-- 1. Pemilik menulis kolomnya sendiri; orang lain tidak bisa.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f4a01';
UPDATE public.users
  SET institution_id = '001002', institution_name = 'Universitas Indonesia', domicile_code = '32.76.03', study_fields = ARRAY['ui-ux', 'pengembangan-web']
  WHERE id = '00000000-0000-4000-8000-0000000f4a01';
DO $$
BEGIN
  IF (SELECT institution_id FROM public.users WHERE id = '00000000-0000-4000-8000-0000000f4a01') IS DISTINCT FROM '001002' THEN
    RAISE EXCEPTION 'pemilik harus bisa menyimpan tempat studinya';
  END IF;
  UPDATE public.users SET domicile_code = 'LN' WHERE id = '00000000-0000-4000-8000-0000000f4a01';
  UPDATE public.users SET domicile_code = '32.76.03' WHERE id = '00000000-0000-4000-8000-0000000f4a01';
  BEGIN
    UPDATE public.users SET domicile_code = 'XX' WHERE id = '00000000-0000-4000-8000-0000000f4a01';
    RAISE EXCEPTION 'kode selain wilayah & LN harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.users SET domicile_code = '32.76.03.1001' WHERE id = '00000000-0000-4000-8000-0000000f4a01';
    RAISE EXCEPTION 'kode desa/kelurahan tidak disimpan — paling dalam kecamatan';
  EXCEPTION WHEN check_violation OR string_data_right_truncation THEN NULL;
  END;
  BEGIN
    UPDATE public.users SET institution_id = '001002', institution_name = NULL WHERE id = '00000000-0000-4000-8000-0000000f4a01';
    RAISE EXCEPTION 'id tanpa nama harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.users SET study_fields = ARRAY['Bukan Slug!'] WHERE id = '00000000-0000-4000-8000-0000000f4a01';
    RAISE EXCEPTION 'slug bidang berbentuk salah harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.users SET study_fields = (SELECT array_agg('bidang-' || n) FROM generate_series(1, 16) n) WHERE id = '00000000-0000-4000-8000-0000000f4a01';
    RAISE EXCEPTION 'lebih dari 15 bidang harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f4a02';
UPDATE public.users SET institution_name = 'Dibajak' WHERE id = '00000000-0000-4000-8000-0000000f4a01';
DO $$
BEGIN
  IF (SELECT institution_name FROM public.public_study_profiles(ARRAY['00000000-0000-4000-8000-0000000f4a01']::uuid[])) IS NOT NULL THEN
    RAISE EXCEPTION 'profil tersembunyi: pembaca tanpa hubungan tidak menerima tempat studi';
  END IF;
END$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT institution_name FROM public.users WHERE id = '00000000-0000-4000-8000-0000000f4a01') <> 'Universitas Indonesia' THEN
    RAISE EXCEPTION 'orang lain tidak boleh mengubah tempat studi pemilik';
  END IF;
END$$;

-- 2. Boleh melihat profil (bisa ditemukan) = menerima; kecamatan terpotong ke kab/kota.
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000f4a01', true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f4a02';
DO $$
DECLARE v RECORD;
BEGIN
  SELECT * INTO v FROM public.public_study_profiles(ARRAY['00000000-0000-4000-8000-0000000f4a01']::uuid[]);
  IF v.institution_id IS DISTINCT FROM '001002' OR v.region_code IS DISTINCT FROM '32.76' THEN
    RAISE EXCEPTION 'pembaca yang boleh melihat menerima tempat studi & kab/kota (bukan kecamatan), dapat %', row_to_json(v);
  END IF;
  IF v.study_fields IS DISTINCT FROM ARRAY['ui-ux', 'pengembangan-web'] THEN
    RAISE EXCEPTION 'bidang spesifik ikut terlihat';
  END IF;
END$$;
RESET ROLE;

-- 3. Blokir & penangguhan menutup.
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000f4a01', '00000000-0000-4000-8000-0000000f4a02');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f4a02';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_study_profiles(ARRAY['00000000-0000-4000-8000-0000000f4a01']::uuid[])) THEN
    RAISE EXCEPTION 'yang diblokir tidak menerima tempat studi';
  END IF;
END$$;
RESET ROLE;

UPDATE public.users SET suspended_at = now() WHERE id = '00000000-0000-4000-8000-0000000f4a01';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f4a03';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_study_profiles(ARRAY['00000000-0000-4000-8000-0000000f4a01']::uuid[])) THEN
    RAISE EXCEPTION 'akun ditangguhkan tidak tampil';
  END IF;
END$$;
RESET ROLE;

-- 4. Anon tidak bisa memanggil RPC.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.public_study_profiles(ARRAY['00000000-0000-4000-8000-0000000f4a01']::uuid[]);
    RAISE EXCEPTION 'anon tidak boleh memanggil public_study_profiles';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;
ROLLBACK;
