-- Foto profil & banner (ADR-083): menulis hanya milik sendiri lewat RPC,
-- siapa-melihat = aturan detail profil (ADR-077), blokir & penangguhan
-- menutup, admin ber-MFA boleh membuka untuk moderasi, dan pencabutan oleh
-- moderator tercatat tanpa mengubah status akun.
-- Cermin: src/lib/data/profile-media.test.ts.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000fe001', 'pemilik@profil', '{"full_name":"Pemilik Foto"}'),
  ('00000000-0000-4000-8000-0000000fe002', 'pembaca@profil', '{"full_name":"Pembaca"}'),
  ('00000000-0000-4000-8000-0000000fe003', 'asing@profil', '{"full_name":"Orang Asing"}'),
  ('00000000-0000-4000-8000-0000000fe004', 'admin@profil', '{"full_name":"Admin Uji"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000fe004';
-- Pemilik "hanya koneksi" tetapi bisa ditemukan di Koneksi → profilnya boleh dilihat anggota.
UPDATE public.users SET profile_visibility = 'NETWORK' WHERE id = '00000000-0000-4000-8000-0000000fe001';
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000fe001', true);

-- 1. Tamu tidak bisa memanggil apa pun.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.set_profile_media('avatar', '00000000-0000-4000-8000-0000000feaa1', 'image/png');
    RAISE EXCEPTION 'anon tidak boleh memasang foto';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.public_profile_media(ARRAY['00000000-0000-4000-8000-0000000fe001']::uuid[]);
    RAISE EXCEPTION 'anon tidak boleh membaca gambar profil';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.profile_media_file('00000000-0000-4000-8000-0000000feaa1');
    RAISE EXCEPTION 'anon tidak boleh membuka berkas profil';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- 2. Pemilik memasang, mengganti, dan memilih banner bawaan.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe001';
DO $$
DECLARE v_old TEXT;
BEGIN
  v_old := public.set_profile_media('avatar', '00000000-0000-4000-8000-0000000feaa1', 'image/png');
  IF v_old IS NOT NULL THEN RAISE EXCEPTION 'foto pertama tidak punya berkas lama, dapat %', v_old; END IF;

  v_old := public.set_profile_media('avatar', '00000000-0000-4000-8000-0000000feaa2', 'image/jpeg');
  IF v_old IS DISTINCT FROM '00000000-0000-4000-8000-0000000fe001/00000000-0000-4000-8000-0000000feaa1.png' THEN
    RAISE EXCEPTION 'mengganti foto harus mengembalikan path berkas lama, dapat %', v_old;
  END IF;

  v_old := public.set_profile_media('banner', '00000000-0000-4000-8000-0000000febb1', 'image/webp');
  IF v_old IS NOT NULL THEN RAISE EXCEPTION 'banner pertama tidak punya berkas lama'; END IF;

  -- Jenis & tipe berkas dari daftar tertutup.
  BEGIN
    PERFORM public.set_profile_media('poster', '00000000-0000-4000-8000-0000000feaa3', 'image/png');
    RAISE EXCEPTION 'jenis di luar daftar harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.set_profile_media('avatar', '00000000-0000-4000-8000-0000000feaa3', 'image/svg+xml');
    RAISE EXCEPTION 'SVG harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Kolom id TIDAK bisa ditulis langsung; banner bawaan bisa, dan hanya dari daftar.
  BEGIN
    UPDATE public.users SET avatar_id = '00000000-0000-4000-8000-0000000feaa9', avatar_type = 'image/png'
    WHERE id = '00000000-0000-4000-8000-0000000fe001';
    RAISE EXCEPTION 'klien tidak boleh menulis avatar_id langsung';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.users SET banner_preset = 'ombak' WHERE id = '00000000-0000-4000-8000-0000000fe001';
  BEGIN
    UPDATE public.users SET banner_preset = 'pelangi' WHERE id = '00000000-0000-4000-8000-0000000fe001';
    RAISE EXCEPTION 'banner bawaan di luar daftar harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '00000000-0000-4000-8000-0000000fe001'
      AND avatar_id = '00000000-0000-4000-8000-0000000feaa2' AND avatar_type = 'image/jpeg'
      AND banner_id = '00000000-0000-4000-8000-0000000febb1' AND banner_type = 'image/webp'
      AND banner_preset = 'ombak'
  ) THEN
    RAISE EXCEPTION 'foto, banner, dan banner bawaan harus tersimpan';
  END IF;
END$$;

-- 3. Id berkas orang lain tidak bisa dipinjam (silang foto ↔ banner sekalipun),
--    dan banner bawaan orang lain tidak bisa diubah.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe003';
DO $$
BEGIN
  BEGIN
    PERFORM public.set_profile_media('banner', '00000000-0000-4000-8000-0000000feaa2', 'image/jpeg');
    RAISE EXCEPTION 'id foto orang lain tidak boleh dipasang sebagai banner';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.set_profile_media('avatar', '00000000-0000-4000-8000-0000000febb1', 'image/webp');
    RAISE EXCEPTION 'id banner orang lain tidak boleh dipasang sebagai foto';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.users SET banner_preset = 'daun' WHERE id = '00000000-0000-4000-8000-0000000fe001';
  IF FOUND THEN RAISE EXCEPTION 'tidak boleh mengubah banner bawaan orang lain'; END IF;
END$$;
RESET ROLE;

-- 4. Siapa yang melihat: pemilik; anggota yang boleh melihat profilnya.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe001';
DO $$
DECLARE v_path TEXT; v_type TEXT;
BEGIN
  SELECT path, content_type INTO v_path, v_type FROM public.profile_media_file('00000000-0000-4000-8000-0000000febb1');
  IF v_path IS DISTINCT FROM '00000000-0000-4000-8000-0000000fe001/00000000-0000-4000-8000-0000000febb1.webp' OR v_type <> 'image/webp' THEN
    RAISE EXCEPTION 'pemilik harus mendapat path & jenis bannernya, dapat % / %', v_path, v_type;
  END IF;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe002';
DO $$
DECLARE v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM public.public_profile_media(ARRAY['00000000-0000-4000-8000-0000000fe001', '00000000-0000-4000-8000-0000000fe003']::uuid[]);
  IF v_row.user_id IS DISTINCT FROM '00000000-0000-4000-8000-0000000fe001'
     OR v_row.avatar_id IS DISTINCT FROM '00000000-0000-4000-8000-0000000feaa2'
     OR v_row.banner_preset IS DISTINCT FROM 'ombak' THEN
    RAISE EXCEPTION 'pembaca yang boleh melihat profil menerima foto & banner pemilik';
  END IF;
  IF (SELECT count(*) FROM public.public_profile_media(ARRAY['00000000-0000-4000-8000-0000000fe001', '00000000-0000-4000-8000-0000000fe003']::uuid[])) <> 1 THEN
    RAISE EXCEPTION 'orang tanpa gambar tidak punya baris';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profile_media_file('00000000-0000-4000-8000-0000000feaa2')) THEN
    RAISE EXCEPTION 'pembaca yang boleh melihat profil boleh membuka berkasnya';
  END IF;
  -- Berkas lama (sudah diganti) tidak lagi menunjuk siapa pun.
  IF EXISTS (SELECT 1 FROM public.profile_media_file('00000000-0000-4000-8000-0000000feaa1')) THEN
    RAISE EXCEPTION 'id berkas lama tidak boleh terbuka lagi';
  END IF;
END$$;
RESET ROLE;

-- 5. Profil "hanya koneksi" yang tidak bisa ditemukan: tertutup bagi orang asing.
UPDATE public.network_profiles SET is_discoverable = false WHERE user_id = '00000000-0000-4000-8000-0000000fe001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe003';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_profile_media(ARRAY['00000000-0000-4000-8000-0000000fe001']::uuid[])) THEN
    RAISE EXCEPTION 'orang asing tidak menerima gambar profil tersembunyi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profile_media_file('00000000-0000-4000-8000-0000000feaa2')) THEN
    RAISE EXCEPTION 'orang asing tidak boleh membuka berkas profil tersembunyi';
  END IF;
END$$;
RESET ROLE;

-- 6. Blokir menutup, walau profilnya bisa ditemukan.
UPDATE public.network_profiles SET is_discoverable = true WHERE user_id = '00000000-0000-4000-8000-0000000fe001';
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000fe001', '00000000-0000-4000-8000-0000000fe002');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe002';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_profile_media(ARRAY['00000000-0000-4000-8000-0000000fe001']::uuid[]))
     OR EXISTS (SELECT 1 FROM public.profile_media_file('00000000-0000-4000-8000-0000000feaa2')) THEN
    RAISE EXCEPTION 'yang diblokir tidak melihat gambar profil';
  END IF;
END$$;
RESET ROLE;
DELETE FROM public.connection_blocks WHERE blocker_id = '00000000-0000-4000-8000-0000000fe001';

-- 7. Penangguhan menutup bagi anggota; admin ber-MFA tetap bisa membuka, admin aal1 tidak.
UPDATE public.users SET suspended_at = now(), suspension_reason = 'Uji penangguhan' WHERE id = '00000000-0000-4000-8000-0000000fe001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe002';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_profile_media(ARRAY['00000000-0000-4000-8000-0000000fe001']::uuid[]))
     OR EXISTS (SELECT 1 FROM public.profile_media_file('00000000-0000-4000-8000-0000000feaa2')) THEN
    RAISE EXCEPTION 'gambar akun yang ditangguhkan tidak tampil';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe001';
DO $$
BEGIN
  BEGIN
    PERFORM public.set_profile_media('avatar', '00000000-0000-4000-8000-0000000feaa4', 'image/png');
    RAISE EXCEPTION 'akun yang ditangguhkan tidak boleh memasang foto';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe004';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profile_media_file('00000000-0000-4000-8000-0000000feaa2')) THEN
    RAISE EXCEPTION 'admin tanpa MFA (aal1) tidak boleh membuka berkas orang yang ditangguhkan';
  END IF;
END$$;
SET LOCAL request.jwt.claims = '{"aal":"aal2"}';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profile_media_file('00000000-0000-4000-8000-0000000feaa2')) THEN
    RAISE EXCEPTION 'admin ber-MFA harus bisa membuka berkas untuk moderasi';
  END IF;
  -- Moderasi hanya lewat service_role (setelah checkAdminAccess() di server).
  BEGIN
    PERFORM * FROM public.admin_clear_profile_media('00000000-0000-4000-8000-0000000fe001', '00000000-0000-4000-8000-0000000fe004', 'Foto orang lain');
    RAISE EXCEPTION 'authenticated tidak boleh memanggil admin_clear_profile_media';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET request.jwt.claims;
RESET ROLE;

-- 8. Hapus akun: path berkas profil ikut dikembalikan untuk dihapus dari Storage.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.account_storage_paths('00000000-0000-4000-8000-0000000fe001') WHERE bucket = 'profile-media') <> 2 THEN
    RAISE EXCEPTION 'hapus akun harus mengembalikan dua berkas profil';
  END IF;
END$$;

-- 9. Moderator mencabut: alasan wajib, dua path kembali, banner bawaan tetap, tercatat.
DO $$
DECLARE v_paths TEXT[];
BEGIN
  BEGIN
    PERFORM * FROM public.admin_clear_profile_media('00000000-0000-4000-8000-0000000fe001', '00000000-0000-4000-8000-0000000fe004', ' abc ');
    RAISE EXCEPTION 'alasan terlalu pendek harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.admin_clear_profile_media('00000000-0000-4000-8000-0000000fe0ff', '00000000-0000-4000-8000-0000000fe004', 'Foto orang lain');
    RAISE EXCEPTION 'akun yang tidak ada harus ditolak';
  EXCEPTION WHEN no_data_found THEN
    IF SQLERRM <> 'user_not_found' THEN RAISE; END IF;
  END;

  SELECT array_agg(path ORDER BY path) INTO v_paths
  FROM public.admin_clear_profile_media('00000000-0000-4000-8000-0000000fe001', '00000000-0000-4000-8000-0000000fe004', '  Foto orang lain  ');
  IF v_paths IS DISTINCT FROM ARRAY[
    '00000000-0000-4000-8000-0000000fe001/00000000-0000-4000-8000-0000000feaa2.jpg',
    '00000000-0000-4000-8000-0000000fe001/00000000-0000-4000-8000-0000000febb1.webp'
  ] THEN
    RAISE EXCEPTION 'pencabutan harus mengembalikan kedua path, dapat %', v_paths;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '00000000-0000-4000-8000-0000000fe001'
      AND avatar_id IS NULL AND avatar_type IS NULL AND banner_id IS NULL AND banner_type IS NULL
      AND banner_preset = 'ombak' AND suspended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'unggahan dikosongkan; banner bawaan & status akun tidak disentuh';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_log
    WHERE subject_type = 'user' AND subject_id = '00000000-0000-4000-8000-0000000fe001'
      AND title = 'Foto & banner dicabut — Pemilik Foto'
      AND from_status IS NULL AND to_status = 'SUSPENDED'
      AND actor_id = '00000000-0000-4000-8000-0000000fe004' AND reason = 'Foto orang lain'
  ) THEN
    RAISE EXCEPTION 'pencabutan harus tercatat di riwayat dengan status akun saat ini';
  END IF;

  BEGIN
    PERFORM * FROM public.admin_clear_profile_media('00000000-0000-4000-8000-0000000fe001', '00000000-0000-4000-8000-0000000fe004', 'Sudah kosong');
    RAISE EXCEPTION 'mencabut yang sudah kosong harus ditolak';
  EXCEPTION WHEN no_data_found THEN
    IF SQLERRM <> 'profile_media_empty' THEN RAISE; END IF;
  END;
END$$;

-- 10. Melepas sendiri mengembalikan path; yang sudah kosong bukan kegagalan.
UPDATE public.users SET suspended_at = NULL, suspension_reason = NULL WHERE id = '00000000-0000-4000-8000-0000000fe001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000fe001';
DO $$
DECLARE v_old TEXT;
BEGIN
  PERFORM public.set_profile_media('avatar', '00000000-0000-4000-8000-0000000feaa5', 'image/png');
  v_old := public.clear_profile_media('avatar');
  IF v_old IS DISTINCT FROM '00000000-0000-4000-8000-0000000fe001/00000000-0000-4000-8000-0000000feaa5.png' THEN
    RAISE EXCEPTION 'melepas foto harus mengembalikan path berkasnya, dapat %', v_old;
  END IF;
  IF public.clear_profile_media('avatar') IS NOT NULL OR public.clear_profile_media('banner') IS NOT NULL THEN
    RAISE EXCEPTION 'melepas yang kosong mengembalikan NULL';
  END IF;
  BEGIN
    PERFORM public.clear_profile_media('poster');
    RAISE EXCEPTION 'jenis di luar daftar harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

-- 11. Batas laju: 20 pemasangan per hari per akun (4 sudah terpakai di atas).
DO $$
BEGIN
  FOR i IN 1..16 LOOP
    PERFORM public.set_profile_media('banner', gen_random_uuid(), 'image/png');
  END LOOP;
  BEGIN
    PERFORM public.set_profile_media('banner', gen_random_uuid(), 'image/png');
    RAISE EXCEPTION 'pemasangan ke-21 harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'profile_media_rate_limited' THEN RAISE; END IF;
  END;
END$$;
RESET ROLE;
ROLLBACK;
