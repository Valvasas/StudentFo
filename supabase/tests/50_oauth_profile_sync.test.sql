-- Sisi database alur "Masuk dengan Google": baris auth.users yang dibuat
-- GoTrue dari identitas Google harus menghasilkan profil publik yang benar,
-- dan tidak boleh pernah membatalkan pendaftaran.
-- Bentuk raw_user_meta_data di bawah disalin dari yang GoTrue tulis untuk
-- provider google (klaim OIDC + alias full_name/avatar_url).
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000b001', 'dinda@gmail.com',
   '{"iss":"https://accounts.google.com","sub":"1122334455","name":"Dinda Pratiwi","full_name":"Dinda Pratiwi","email":"dinda@gmail.com","email_verified":true,"picture":"https://lh3.googleusercontent.com/a/x","avatar_url":"https://lh3.googleusercontent.com/a/x","provider_id":"1122334455"}'),
  -- Sebagian penyedia hanya mengisi `name`.
  ('00000000-0000-4000-8000-00000000b002', 'raka@gmail.com',
   '{"iss":"https://accounts.google.com","name":"  Raka Aditya  ","email_verified":true}'),
  -- Tanpa nama sama sekali → bagian lokal email.
  ('00000000-0000-4000-8000-00000000b003', 'tanpa.nama@gmail.com', '{"iss":"https://accounts.google.com"}');

DO $$
BEGIN
  IF (SELECT full_name FROM public.users WHERE id = '00000000-0000-4000-8000-00000000b001') <> 'Dinda Pratiwi' THEN
    RAISE EXCEPTION 'profil Google: full_name harus dari klaim full_name';
  END IF;
  IF (SELECT full_name FROM public.users WHERE id = '00000000-0000-4000-8000-00000000b002') <> 'Raka Aditya' THEN
    RAISE EXCEPTION 'profil Google: fallback ke klaim name (di-trim)';
  END IF;
  IF (SELECT full_name FROM public.users WHERE id = '00000000-0000-4000-8000-00000000b003') <> 'tanpa.nama' THEN
    RAISE EXCEPTION 'profil Google: fallback ke bagian lokal email';
  END IF;
  -- Peran tidak pernah diambil dari metadata yang dikendalikan pengguna.
  IF EXISTS (SELECT 1 FROM public.users WHERE id::text LIKE '00000000-0000-4000-8000-00000000b00%' AND role <> 'USER') THEN
    RAISE EXCEPTION 'profil baru harus berperan USER';
  END IF;
END$$;

-- Identitas email & Google belum tertaut → GoTrue bisa membuat baris
-- auth.users KEDUA dengan email yang sama. Pendaftaran tidak boleh gagal.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000b004', 'dinda@gmail.com', '{"full_name":"Dinda (akun kedua)"}');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '00000000-0000-4000-8000-00000000b004') THEN
    RAISE EXCEPTION 'email kembar tidak boleh membatalkan INSERT auth.users';
  END IF;
  IF (SELECT count(*) FROM public.users WHERE email = 'dinda@gmail.com') <> 1 THEN
    RAISE EXCEPTION 'email kembar tidak boleh menggandakan profil';
  END IF;
END$$;

-- Klaim `role` di metadata diabaikan (penyerang mengendalikan metadata signup).
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000b005', 'nakal@gmail.com', '{"full_name":"Nakal","role":"ADMIN"}');
DO $$
BEGIN
  IF (SELECT role FROM public.users WHERE id = '00000000-0000-4000-8000-00000000b005') <> 'USER' THEN
    RAISE EXCEPTION 'klaim role dari metadata tidak boleh dipakai';
  END IF;
END$$;

ROLLBACK;
