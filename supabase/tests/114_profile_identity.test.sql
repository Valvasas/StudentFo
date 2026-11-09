-- Username, bio, keterlihatan profil (ADR-077): bentuk & keunikan username
-- dijaga database, profil MEMBERS terbuka untuk anggota yang MASUK (bukan
-- tamu), NETWORK kembali ke aturan lama, blokir menutup, dan
-- user_id_by_username tidak membedakan "tidak ada" dari "tidak boleh".
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f5a01', 'terbuka@profil', '{"full_name":"Profil Terbuka"}'),
  ('00000000-0000-4000-8000-0000000f5a02', 'tertutup@profil', '{"full_name":"Profil Tertutup"}'),
  ('00000000-0000-4000-8000-0000000f5a03', 'pembaca@profil', '{"full_name":"Pembaca"}');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f5a01';
UPDATE public.users SET username = 'profil.terbuka', bio = 'Halo, aku suka lomba data.' WHERE id = '00000000-0000-4000-8000-0000000f5a01';
DO $$
BEGIN
  IF (SELECT profile_visibility FROM public.users WHERE id = '00000000-0000-4000-8000-0000000f5a01') <> 'MEMBERS' THEN
    RAISE EXCEPTION 'bawaan keterlihatan harus MEMBERS';
  END IF;
  BEGIN
    UPDATE public.users SET username = 'Huruf.Besar' WHERE id = '00000000-0000-4000-8000-0000000f5a01';
    RAISE EXCEPTION 'username berhuruf besar harus ditolak (aplikasi menyimpan huruf kecil)';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.users SET username = 'admin' WHERE id = '00000000-0000-4000-8000-0000000f5a01';
    RAISE EXCEPTION 'username terlarang harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.users SET username = 'ra..ni' WHERE id = '00000000-0000-4000-8000-0000000f5a01';
    RAISE EXCEPTION 'tanda baca berurutan harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.users SET bio = repeat('x', 281) WHERE id = '00000000-0000-4000-8000-0000000f5a01';
    RAISE EXCEPTION 'bio > 280 harus ditolak';
  EXCEPTION WHEN check_violation OR string_data_right_truncation THEN NULL;
  END;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f5a02';
UPDATE public.users SET username = 'profil.tertutup', profile_visibility = 'NETWORK' WHERE id = '00000000-0000-4000-8000-0000000f5a02';
DO $$
BEGIN
  BEGIN
    UPDATE public.users SET username = 'profil.terbuka' WHERE id = '00000000-0000-4000-8000-0000000f5a02';
    RAISE EXCEPTION 'username ganda harus ditolak';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END$$;

-- Pembaca (bukan koneksi, tidak satu lobi, keduanya tidak "bisa ditemukan").
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f5a03';
DO $$
DECLARE v RECORD;
BEGIN
  IF public.user_id_by_username('Profil.Terbuka') IS DISTINCT FROM '00000000-0000-4000-8000-0000000f5a01' THEN
    RAISE EXCEPTION 'profil MEMBERS harus terbuka untuk anggota, tanpa membedakan huruf';
  END IF;
  IF public.user_id_by_username('profil.tertutup') IS NOT NULL OR public.user_id_by_username('tidak.ada') IS NOT NULL THEN
    RAISE EXCEPTION 'NETWORK & tidak ada sama-sama null';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.public_profile('00000000-0000-4000-8000-0000000f5a01')) THEN
    RAISE EXCEPTION 'public_profile harus mengembalikan profil MEMBERS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.public_profile('00000000-0000-4000-8000-0000000f5a02')) THEN
    RAISE EXCEPTION 'public_profile tidak boleh mengembalikan profil NETWORK tanpa hubungan';
  END IF;
  SELECT * INTO v FROM public.public_profile_details(ARRAY['00000000-0000-4000-8000-0000000f5a01']::uuid[]);
  IF v.username IS DISTINCT FROM 'profil.terbuka' OR v.bio IS NULL THEN
    RAISE EXCEPTION 'detail publik memuat username & bio';
  END IF;
END$$;

-- Profil MEMBERS boleh diajak terhubung walau tidak "bisa ditemukan"; NETWORK tidak.
INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000f5a03', '00000000-0000-4000-8000-0000000f5a01');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000f5a03', '00000000-0000-4000-8000-0000000f5a02');
    RAISE EXCEPTION 'profil NETWORK tidak boleh diajak tanpa jalur lain';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
END$$;
RESET ROLE;

-- Blokir menutup profil MEMBERS.
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000f5a01', '00000000-0000-4000-8000-0000000f5a03');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f5a03';
DO $$
BEGIN
  IF public.user_id_by_username('profil.terbuka') IS NOT NULL THEN
    RAISE EXCEPTION 'yang diblokir tidak bisa membuka profil';
  END IF;
END$$;
RESET ROLE;

-- Tamu tidak pernah.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.user_id_by_username('profil.terbuka');
    RAISE EXCEPTION 'anon tidak boleh memanggil user_id_by_username';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;
ROLLBACK;
