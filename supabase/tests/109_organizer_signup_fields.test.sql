-- Data lembaga dari form daftar penyelenggara (ADR-069, migration 20261108100001):
-- pemilik bisa menulis jenis lembaga & jabatan, nilai di luar daftar ditolak,
-- dan mengubah keduanya setelah terverifikasi = kembali ke antrean.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f0a01', 'panitia@uji', '{"full_name":"Panitia Baru"}'),
  ('00000000-0000-4000-8000-0000000f0a02', 'admin2@uji', '{"full_name":"Admin"}');
UPDATE public.users SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-0000000f0a02';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a01';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.organizer_profiles (user_id, org_name, evidence, org_type, contact_role)
    VALUES ('00000000-0000-4000-8000-0000000f0a01', 'Himpunan Baru', 'Saya ketua, lihat https://himpunan.example/pengurus', 'ADMIN', 'Ketua');
    RAISE EXCEPTION 'jenis lembaga di luar daftar harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.organizer_profiles (user_id, org_name, evidence, org_type, contact_role)
    VALUES ('00000000-0000-4000-8000-0000000f0a01', 'Himpunan Baru', 'Saya ketua, lihat https://himpunan.example/pengurus', 'ORMAWA', ' ');
    RAISE EXCEPTION 'jabatan kosong harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;
INSERT INTO public.organizer_profiles (user_id, org_name, evidence, org_type, contact_role)
VALUES ('00000000-0000-4000-8000-0000000f0a01', 'Himpunan Baru', 'Saya ketua, lihat https://himpunan.example/pengurus', 'ORMAWA', 'Ketua Himpunan');
RESET ROLE;

SELECT public.review_organizer('00000000-0000-4000-8000-0000000f0a01', 'VERIFIED', '00000000-0000-4000-8000-0000000f0a02', NULL);

-- Penanggung jawab berganti = klaim "siapa yang mewakili" berubah → verifikasi ulang.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a01';
UPDATE public.organizer_profiles SET contact_role = 'Humas' WHERE user_id = '00000000-0000-4000-8000-0000000f0a01';
DO $$
BEGIN
  IF (SELECT status FROM public.organizer_profiles WHERE user_id = '00000000-0000-4000-8000-0000000f0a01') <> 'PENDING' THEN
    RAISE EXCEPTION 'mengganti jabatan setelah terverifikasi harus kembali PENDING';
  END IF;
END$$;
RESET ROLE;

SELECT public.review_organizer('00000000-0000-4000-8000-0000000f0a01', 'VERIFIED', '00000000-0000-4000-8000-0000000f0a02', NULL);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a01';
UPDATE public.organizer_profiles SET org_type = 'KOMUNITAS' WHERE user_id = '00000000-0000-4000-8000-0000000f0a01';
DO $$
BEGIN
  IF (SELECT status FROM public.organizer_profiles WHERE user_id = '00000000-0000-4000-8000-0000000f0a01') <> 'PENDING' THEN
    RAISE EXCEPTION 'mengganti jenis lembaga setelah terverifikasi harus kembali PENDING';
  END IF;
END$$;
RESET ROLE;
ROLLBACK;
