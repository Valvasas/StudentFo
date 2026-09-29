-- Portofolio & riwayat (ADR-046): portofolio lahir dari tracker APPLIED+,
-- hanya pemilik yang bisa menulis hasilnya, orang lain melihatnya dengan
-- aturan jaringan (bisa ditemukan / berkoneksi, tidak diblokir), beasiswa &
-- magang privat secara bawaan, "Ditolak" tidak pernah tampil. Riwayat
-- penyelenggara hanya berisi acara yang ia kelola, sudah tutup, dan hanya
-- selama ia masih terverifikasi.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f0a01', 'pemilik@porto', '{"full_name":"Pemilik Porto"}'),
  ('00000000-0000-4000-8000-0000000f0a02', 'teman@porto', '{"full_name":"Teman Porto"}'),
  ('00000000-0000-4000-8000-0000000f0a03', 'asing@porto', '{"full_name":"Orang Asing"}'),
  ('00000000-0000-4000-8000-0000000f0a04', 'org@porto', '{"full_name":"Panitia Porto"}');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-0000000f0e01', 'Lomba Porto Selesai', 'Himpunan Porto', 'LOMBA', 'https://d.example/1', 'https://s.example/1', 'EXPIRED', now()),
  ('00000000-0000-4000-8000-0000000f0e02', 'Beasiswa Porto', 'Yayasan Porto', 'BEASISWA', 'https://d.example/2', 'https://s.example/2', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000f0e03', 'Lomba Porto Ditolak', 'Himpunan Porto', 'LOMBA', 'https://d.example/3', 'https://s.example/3', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000f0e04', 'Lomba Porto Disimpan', 'Himpunan Porto', 'LOMBA', 'https://d.example/4', 'https://s.example/4', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000f0e05', 'Lomba Porto Berjalan', 'Himpunan Porto', 'LOMBA', 'https://d.example/5', 'https://s.example/5', 'APPROVED', now());
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-4000-8000-0000000f0e01', 'registration', now() - interval '60 days', true),
  ('00000000-0000-4000-8000-0000000f0e02', 'registration', now() + interval '20 days', true),
  ('00000000-0000-4000-8000-0000000f0e03', 'registration', now() + interval '20 days', true),
  ('00000000-0000-4000-8000-0000000f0e04', 'registration', now() + interval '20 days', true),
  ('00000000-0000-4000-8000-0000000f0e05', 'registration', now() + interval '20 days', true);

INSERT INTO public.application_tracker (user_id, event_id, status) VALUES
  ('00000000-0000-4000-8000-0000000f0a01', '00000000-0000-4000-8000-0000000f0e01', 'ACCEPTED'),
  ('00000000-0000-4000-8000-0000000f0a01', '00000000-0000-4000-8000-0000000f0e02', 'APPLIED'),
  ('00000000-0000-4000-8000-0000000f0a01', '00000000-0000-4000-8000-0000000f0e03', 'REJECTED'),
  ('00000000-0000-4000-8000-0000000f0a01', '00000000-0000-4000-8000-0000000f0e04', 'SAVED'),
  ('00000000-0000-4000-8000-0000000f0a01', '00000000-0000-4000-8000-0000000f0e05', 'APPLIED');

INSERT INTO public.organizer_profiles (user_id, org_name, evidence)
VALUES ('00000000-0000-4000-8000-0000000f0a04', 'Himpunan Porto', 'Ketua himpunan, lihat https://himpunan.example');
SELECT public.review_organizer('00000000-0000-4000-8000-0000000f0a04', 'VERIFIED', NULL, NULL);
INSERT INTO public.event_managers (event_id, user_id, source) VALUES
  ('00000000-0000-4000-8000-0000000f0e01', '00000000-0000-4000-8000-0000000f0a04', 'ADMIN'),
  ('00000000-0000-4000-8000-0000000f0e05', '00000000-0000-4000-8000-0000000f0a04', 'ADMIN');

SET LOCAL ROLE authenticated;

-- 1. Pemilik mengisi hasil acara yang SUDAH selesai (EXPIRED tetap boleh).
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a01';
UPDATE public.application_tracker
SET achievement = 'JUARA_2', achievement_note = 'Kategori UI/UX', proof_url = 'https://sertifikat.example/porto'
WHERE event_id = '00000000-0000-4000-8000-0000000f0e01';
DO $$
BEGIN
  IF (SELECT achievement FROM public.application_tracker WHERE event_id = '00000000-0000-4000-8000-0000000f0e01') IS DISTINCT FROM 'JUARA_2' THEN
    RAISE EXCEPTION 'pemilik harus bisa mengisi hasil acara yang sudah selesai';
  END IF;
  BEGIN
    UPDATE public.application_tracker SET achievement = 'JUARA_0' WHERE event_id = '00000000-0000-4000-8000-0000000f0e05';
    RAISE EXCEPTION 'hasil di luar daftar harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.application_tracker SET proof_url = 'javascript:alert(1)' WHERE event_id = '00000000-0000-4000-8000-0000000f0e05';
    RAISE EXCEPTION 'tautan bukti non-https harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

-- 2. Orang asing tidak bisa menulis hasil orang lain (tracker_own).
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a03';
UPDATE public.application_tracker SET achievement = 'JUARA_1' WHERE user_id = '00000000-0000-4000-8000-0000000f0a01';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.application_tracker) THEN
    RAISE EXCEPTION 'tracker orang lain tidak boleh terbaca';
  END IF;
  -- 3. Pemilik tidak bisa ditemukan & tidak berkoneksi: profil & portofolio tertutup.
  IF EXISTS (SELECT 1 FROM public.public_profile('00000000-0000-4000-8000-0000000f0a01'))
     OR EXISTS (SELECT 1 FROM public.public_portfolio('00000000-0000-4000-8000-0000000f0a01')) THEN
    RAISE EXCEPTION 'profil orang yang tidak bisa ditemukan harus tertutup bagi orang asing';
  END IF;
END$$;

-- 4. Pemilik memilih bisa ditemukan → orang asing melihat subset publik.
RESET ROLE;
INSERT INTO public.network_profiles (user_id, is_discoverable, headline)
VALUES ('00000000-0000-4000-8000-0000000f0a01', true, 'Suka lomba desain');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a03';
DO $$
DECLARE
  titles TEXT[];
BEGIN
  SELECT array_agg(title ORDER BY title) INTO titles FROM public.public_portfolio('00000000-0000-4000-8000-0000000f0a01');
  -- Beasiswa (privat bawaan), Ditolak, dan Disimpan tidak boleh tampil.
  IF titles IS DISTINCT FROM ARRAY['Lomba Porto Berjalan', 'Lomba Porto Selesai'] THEN
    RAISE EXCEPTION 'portofolio publik salah: %', titles;
  END IF;
  IF (SELECT achievement FROM public.public_portfolio('00000000-0000-4000-8000-0000000f0a01') WHERE title = 'Lomba Porto Selesai') <> 'JUARA_2' THEN
    RAISE EXCEPTION 'hasil harus ikut tampil';
  END IF;
  IF (SELECT relation FROM public.public_profile('00000000-0000-4000-8000-0000000f0a01')) IS NOT NULL THEN
    RAISE EXCEPTION 'orang asing tidak punya hubungan apa pun';
  END IF;
END$$;

-- 5. Pemilik menampilkan beasiswanya secara eksplisit, dan menyembunyikan satu lomba.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a01';
UPDATE public.application_tracker SET portfolio_visible = true WHERE event_id = '00000000-0000-4000-8000-0000000f0e02';
UPDATE public.application_tracker SET portfolio_visible = false WHERE event_id = '00000000-0000-4000-8000-0000000f0e05';
DO $$
BEGIN
  -- Pemilik melihat pratinjau publiknya sendiri lewat fungsi yang sama.
  IF (SELECT array_agg(title ORDER BY title) FROM public.public_portfolio('00000000-0000-4000-8000-0000000f0a01'))
     IS DISTINCT FROM ARRAY['Beasiswa Porto', 'Lomba Porto Selesai'] THEN
    RAISE EXCEPTION 'pilihan visibilitas per entri harus dihormati';
  END IF;
  IF (SELECT relation FROM public.public_profile('00000000-0000-4000-8000-0000000f0a01')) <> 'self' THEN
    RAISE EXCEPTION 'pemilik = self';
  END IF;
END$$;

-- 6. Kembali tersembunyi dari direktori: teman yang berkoneksi tetap melihat,
--    orang asing tidak.
RESET ROLE;
UPDATE public.network_profiles SET is_discoverable = false WHERE user_id = '00000000-0000-4000-8000-0000000f0a01';
INSERT INTO public.connections (requester_id, addressee_id) VALUES
  ('00000000-0000-4000-8000-0000000f0a02', '00000000-0000-4000-8000-0000000f0a01');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a02';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.public_portfolio('00000000-0000-4000-8000-0000000f0a01')) <> 2 THEN
    RAISE EXCEPTION 'pihak dalam ajakan harus bisa melihat portofolio';
  END IF;
  IF (SELECT relation FROM public.public_profile('00000000-0000-4000-8000-0000000f0a01')) <> 'outgoing' THEN
    RAISE EXCEPTION 'teman yang mengajak = outgoing, dapat: %', (SELECT relation FROM public.public_profile('00000000-0000-4000-8000-0000000f0a01'));
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a03';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_portfolio('00000000-0000-4000-8000-0000000f0a01')) THEN
    RAISE EXCEPTION 'orang asing tidak boleh melihat setelah pemilik bersembunyi';
  END IF;
END$$;

-- 7. Blokir menutup profil walau pemiliknya BISA DITEMUKAN — tanpa ini
--    uji lolos karena alasan lain (blokir juga memutus ajakan).
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a01';
INSERT INTO public.connection_blocks (blocker_id, blocked_id)
VALUES ('00000000-0000-4000-8000-0000000f0a01', '00000000-0000-4000-8000-0000000f0a02');
RESET ROLE;
UPDATE public.network_profiles SET is_discoverable = true WHERE user_id = '00000000-0000-4000-8000-0000000f0a01';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a03';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.public_profile('00000000-0000-4000-8000-0000000f0a01')) THEN
    RAISE EXCEPTION 'prasyarat: pemilik bisa ditemukan orang yang tidak diblokir';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a02';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_profile('00000000-0000-4000-8000-0000000f0a01'))
     OR EXISTS (SELECT 1 FROM public.public_portfolio('00000000-0000-4000-8000-0000000f0a01')) THEN
    RAISE EXCEPTION 'yang diblokir tidak boleh melihat profil maupun portofolio';
  END IF;
END$$;

-- 8. Riwayat penyelenggara: hanya acara kelolaannya yang sudah tutup.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a04';
DO $$
BEGIN
  IF (SELECT array_agg(title) FROM public.organizer_event_history()) IS DISTINCT FROM ARRAY['Lomba Porto Selesai'] THEN
    RAISE EXCEPTION 'riwayat hanya acara kelolaan yang sudah tutup: %', (SELECT array_agg(title) FROM public.organizer_event_history());
  END IF;
  IF (SELECT applied FROM public.organizer_event_history()) <> 1 THEN
    RAISE EXCEPTION 'jumlah pendaftar tercatat salah';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a03';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizer_event_history()) THEN
    RAISE EXCEPTION 'bukan penyelenggara = riwayat kosong';
  END IF;
END$$;
RESET ROLE;
SELECT public.review_organizer('00000000-0000-4000-8000-0000000f0a04', 'REVOKED', NULL, 'uji');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f0a04';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizer_event_history()) THEN
    RAISE EXCEPTION 'verifikasi dicabut = riwayat tertutup';
  END IF;
END$$;

-- 9. Tamu tidak bisa memanggil fungsi apa pun; fungsi internal tertutup.
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.public_portfolio('00000000-0000-4000-8000-0000000f0a01');
    RAISE EXCEPTION 'anon tidak boleh memanggil public_portfolio';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.can_view_profile('00000000-0000-4000-8000-0000000f0a01');
    RAISE EXCEPTION 'can_view_profile tidak boleh dipanggil klien';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
ROLLBACK;
