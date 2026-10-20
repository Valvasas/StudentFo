-- Pencocokan tim (ADR-057): kartu pemain bawaan tertutup dan milik sendiri,
-- batas isi (CHECK), pencarian hanya untuk yang kartunya terbuka (timbal-
-- balik), kandidat tanpa pemblokir/diblokir dan tanpa email, portofolio
-- PUBLIK saja, kartu terbuka bisa diajak (tapi kartu tertutup tidak), dan
-- jendela kandidat dibatasi 400.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000d0a01', 'a@tim', '{"full_name":"Ana Pencari"}'),
  ('00000000-0000-4000-8000-0000000d0a02', 'b@tim', '{"full_name":"Budi Juara"}'),
  ('00000000-0000-4000-8000-0000000d0a03', 'c@tim', '{"full_name":"Cici Tertutup"}'),
  ('00000000-0000-4000-8000-0000000d0a04', 'd@tim', '{"full_name":"Dodi Diblokir"}'),
  ('00000000-0000-4000-8000-0000000d0a05', 'e@tim', '{"full_name":"Eka Pemblokir"}'),
  ('00000000-0000-4000-8000-0000000d0a06', 'f@tim', '{"full_name":"Feri Baru"}'),
  ('00000000-0000-4000-8000-0000000d0a07', 'g@tim', '{"full_name":"Gita Tanpa Kartu"}');

-- Portofolio Budi: dua entri publik (juara 1 sudah selesai + ikut serta tanpa
-- hasil), satu beasiswa (privat bawaan), satu hanya disimpan, satu ditolak,
-- satu acara yang belum tayang.
INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-0000000d0e01', 'Lomba Selesai', 'Himpunan', 'LOMBA', 'https://d.example/1', 'https://s.example/1', 'EXPIRED', now()),
  ('00000000-0000-4000-8000-0000000d0e02', 'Beasiswa Tim', 'Yayasan', 'BEASISWA', 'https://d.example/2', 'https://s.example/2', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000d0e03', 'Lomba Berjalan', 'Himpunan', 'LOMBA', 'https://d.example/3', 'https://s.example/3', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000d0e04', 'Lomba Disimpan', 'Himpunan', 'LOMBA', 'https://d.example/4', 'https://s.example/4', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000d0e05', 'Lomba Ditolak', 'Himpunan', 'LOMBA', 'https://d.example/5', 'https://s.example/5', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000d0e06', 'Lomba Belum Tayang', 'Himpunan', 'LOMBA', 'https://d.example/6', 'https://s.example/6', 'PENDING', NULL);
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-4000-8000-0000000d0e01', 'registration', now() - interval '40 days', true),
  ('00000000-0000-4000-8000-0000000d0e03', 'registration', now() + interval '20 days', true);
INSERT INTO public.application_tracker (user_id, event_id, status, achievement) VALUES
  ('00000000-0000-4000-8000-0000000d0a02', '00000000-0000-4000-8000-0000000d0e01', 'ACCEPTED', 'JUARA_1'),
  ('00000000-0000-4000-8000-0000000d0a02', '00000000-0000-4000-8000-0000000d0e02', 'APPLIED', 'PENERIMA'),
  ('00000000-0000-4000-8000-0000000d0a02', '00000000-0000-4000-8000-0000000d0e03', 'APPLIED', NULL),
  ('00000000-0000-4000-8000-0000000d0a02', '00000000-0000-4000-8000-0000000d0e04', 'SAVED', NULL),
  ('00000000-0000-4000-8000-0000000d0a02', '00000000-0000-4000-8000-0000000d0e05', 'REJECTED', NULL),
  ('00000000-0000-4000-8000-0000000d0a02', '00000000-0000-4000-8000-0000000d0e06', 'APPLIED', NULL);

SET LOCAL ROLE authenticated;

-- 1. Ana membuka kartunya; tidak bisa membuat kartu atas nama orang lain.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
INSERT INTO public.team_seekers (user_id, is_open, city, skills, seeking, remote_ok, pitch)
VALUES ('00000000-0000-4000-8000-0000000d0a01', true, 'Bandung', '{web-aplikasi}', '{ui-ux}', true, 'Cari desainer');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.team_seekers (user_id, is_open, skills) VALUES ('00000000-0000-4000-8000-0000000d0a07', false, '{}');
    RAISE EXCEPTION 'kartu atas nama orang lain harus ditolak';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Batas isi.
  BEGIN
    UPDATE public.team_seekers SET skills = '{web-aplikasi,peretasan}' WHERE user_id = '00000000-0000-4000-8000-0000000d0a01';
    RAISE EXCEPTION 'keahlian di luar katalog harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.team_seekers
    SET seeking = '{web-aplikasi,data-ai,iot-elektronika,ui-ux,grafis,video,manajemen-proyek}'
    WHERE user_id = '00000000-0000-4000-8000-0000000d0a01';
    RAISE EXCEPTION 'lebih dari 6 keahlian harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.team_seekers SET pitch = repeat('x', 141) WHERE user_id = '00000000-0000-4000-8000-0000000d0a01';
    RAISE EXCEPTION 'pengantar > 140 karakter harus ditolak';
  EXCEPTION WHEN string_data_right_truncation THEN NULL;
  END;
  BEGIN
    UPDATE public.team_seekers SET pitch = '   ' WHERE user_id = '00000000-0000-4000-8000-0000000d0a01';
    RAISE EXCEPTION 'pengantar kosong-spasi harus ditolak (NULL untuk tanpa pengantar)';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.team_seekers SET skills = '{}' WHERE user_id = '00000000-0000-4000-8000-0000000d0a01';
    RAISE EXCEPTION 'kartu terbuka tanpa keahlian harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.team_seekers SET city = NULL, remote_ok = false WHERE user_id = '00000000-0000-4000-8000-0000000d0a01';
    RAISE EXCEPTION 'kartu terbuka tanpa kota dan tanpa kesediaan daring harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Kolom yang diisi server tidak bisa diubah klien.
  BEGIN
    UPDATE public.team_seekers SET created_at = now() - interval '1 year' WHERE user_id = '00000000-0000-4000-8000-0000000d0a01';
    RAISE EXCEPTION 'created_at tidak boleh diubah klien';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

-- 2. Kartu orang lain: Budi & Feri & Dodi & Eka terbuka, Cici tertutup.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a02';
INSERT INTO public.team_seekers (user_id, is_open, city, skills, seeking, remote_ok, pitch)
VALUES ('00000000-0000-4000-8000-0000000d0a02', true, 'Jakarta Pusat', '{ui-ux,grafis}', '{web-aplikasi}', true, 'Desainer juara');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a03';
INSERT INTO public.team_seekers (user_id, is_open, city, skills) VALUES ('00000000-0000-4000-8000-0000000d0a03', false, 'Medan', '{statistik}');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a04';
INSERT INTO public.team_seekers (user_id, is_open, city, skills) VALUES ('00000000-0000-4000-8000-0000000d0a04', true, 'Bandung', '{video}');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a05';
INSERT INTO public.team_seekers (user_id, is_open, city, skills) VALUES ('00000000-0000-4000-8000-0000000d0a05', true, 'Bandung', '{debat}');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a06';
INSERT INTO public.team_seekers (user_id, is_open, skills, remote_ok) VALUES ('00000000-0000-4000-8000-0000000d0a06', true, '{pemasaran}', true);

-- Ana memblokir Dodi; Eka memblokir Ana.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000d0a01', '00000000-0000-4000-8000-0000000d0a04');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a05';
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000d0a05', '00000000-0000-4000-8000-0000000d0a01');

-- 3. Kartu bersifat milik sendiri: Cici hanya melihat kartunya.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a03';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.team_seekers) <> 1 THEN
    RAISE EXCEPTION 'tabel kartu hanya boleh terbaca pemiliknya';
  END IF;
  -- Pemilik kartu tertutup tidak boleh mencari (timbal-balik).
  IF EXISTS (SELECT 1 FROM public.list_team_candidates(50)) THEN
    RAISE EXCEPTION 'pencarian butuh kartu terbuka milik sendiri';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a07';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_team_candidates(50)) THEN
    RAISE EXCEPTION 'tanpa kartu sama sekali tidak boleh mencari';
  END IF;
END$$;

-- 4. Ana mencari: hanya Budi & Feri (bukan dirinya, Cici tertutup, Dodi
--    diblokir Ana, Eka memblokir Ana), tanpa email, portofolio publik saja.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
DO $$
DECLARE
  v_ids UUID[];
  b RECORD;
BEGIN
  SELECT array_agg(user_id ORDER BY user_id) INTO v_ids FROM public.list_team_candidates(50);
  IF v_ids IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-0000000d0a02', '00000000-0000-4000-8000-0000000d0a06']::UUID[] THEN
    RAISE EXCEPTION 'kandidat Ana harus tepat Budi & Feri, dapat: %', v_ids;
  END IF;

  SELECT * INTO b FROM public.list_team_candidates(50) WHERE user_id = '00000000-0000-4000-8000-0000000d0a02';
  IF b.portfolio_count <> 2 OR b.portfolio_achievements IS DISTINCT FROM ARRAY['NONE', 'JUARA_1']::TEXT[] THEN
    RAISE EXCEPTION 'portofolio publik Budi harus 2 entri (terbaru dulu): %, %', b.portfolio_count, b.portfolio_achievements;
  END IF;
  IF b.city <> 'Jakarta Pusat' OR b.skills IS DISTINCT FROM ARRAY['ui-ux', 'grafis']::TEXT[] OR b.pitch <> 'Desainer juara' OR b.relation IS NOT NULL THEN
    RAISE EXCEPTION 'isi kartu Budi tidak sesuai: %', b;
  END IF;

  IF pg_get_function_result('public.list_team_candidates(int)'::regprocedure) ~* 'email' THEN
    RAISE EXCEPTION 'kandidat tidak boleh memuat email';
  END IF;
END$$;

-- 5. Kartu terbuka bisa diajak walau tanpa profil jaringan; kartu tertutup tidak.
INSERT INTO public.connections (requester_id, addressee_id, message)
VALUES ('00000000-0000-4000-8000-0000000d0a01', '00000000-0000-4000-8000-0000000d0a02', 'Ayo satu tim');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000d0a01', '00000000-0000-4000-8000-0000000d0a03');
    RAISE EXCEPTION 'mengajak kartu tertutup harus ditolak';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000d0a01', '00000000-0000-4000-8000-0000000d0a04');
    RAISE EXCEPTION 'mengajak yang diblokir harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    -- Trigger enforce_connection_insert menolak lebih dulu daripada RLS (96_connection_blocks).
    IF SQLERRM <> 'connection_blocked' THEN RAISE; END IF;
  END;
  IF (SELECT relation FROM public.list_team_candidates(50) WHERE user_id = '00000000-0000-4000-8000-0000000d0a02') IS DISTINCT FROM 'outgoing' THEN
    RAISE EXCEPTION 'ajakan yang Ana kirim harus tampil sebagai outgoing';
  END IF;
  -- Feri belum berhubungan dengan Ana: terbacanya HANYA karena kartunya terbuka.
  IF NOT EXISTS (SELECT 1 FROM public.public_profile('00000000-0000-4000-8000-0000000d0a06')) THEN
    RAISE EXCEPTION 'profil publik pemilik kartu terbuka harus terbaca';
  END IF;
  IF EXISTS (SELECT 1 FROM public.public_profile('00000000-0000-4000-8000-0000000d0a03')) THEN
    RAISE EXCEPTION 'profil pemilik kartu tertutup tidak boleh terbaca';
  END IF;
END$$;

-- 6. Sisi Budi: ajakan masuk; menerima membuat keduanya 'connected'.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a02';
DO $$
BEGIN
  IF (SELECT relation FROM public.list_team_candidates(50) WHERE user_id = '00000000-0000-4000-8000-0000000d0a01') IS DISTINCT FROM 'incoming' THEN
    RAISE EXCEPTION 'ajakan masuk harus tampil sebagai incoming';
  END IF;
END$$;
UPDATE public.connections SET status = 'ACCEPTED'
WHERE addressee_id = '00000000-0000-4000-8000-0000000d0a02' AND requester_id = '00000000-0000-4000-8000-0000000d0a01';
DO $$
BEGIN
  IF (SELECT relation FROM public.list_team_candidates(50) WHERE user_id = '00000000-0000-4000-8000-0000000d0a01') IS DISTINCT FROM 'connected' THEN
    RAISE EXCEPTION 'setelah diterima keduanya harus connected';
  END IF;
END$$;

-- 7. Budi menampilkan beasiswanya: ikut terhitung di sisi Ana.
UPDATE public.application_tracker SET portfolio_visible = true WHERE event_id = '00000000-0000-4000-8000-0000000d0e02';
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
DO $$
BEGIN
  IF (SELECT portfolio_count FROM public.list_team_candidates(50) WHERE user_id = '00000000-0000-4000-8000-0000000d0a02') <> 3 THEN
    RAISE EXCEPTION 'beasiswa yang dipilih tampil harus ikut terhitung';
  END IF;
END$$;

-- 8. Anonim tidak punya akses apa pun.
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.team_seekers;
    RAISE EXCEPTION 'anon tidak boleh membaca kartu';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.list_team_candidates(10);
    RAISE EXCEPTION 'anon tidak boleh mencari kandidat';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- 9. Jendela kandidat dibatasi 400 (dan paling sedikit 1) berapa pun yang diminta.
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT ('00000000-0000-4000-8001-' || lpad(to_hex(n), 12, '0'))::uuid, 'bulk' || n || '@tim', '{"full_name":"Bulk"}'::jsonb
FROM generate_series(1, 405) AS n;
INSERT INTO public.team_seekers (user_id, is_open, city, skills)
SELECT ('00000000-0000-4000-8001-' || lpad(to_hex(n), 12, '0'))::uuid, true, 'Bandung', '{web-aplikasi}'
FROM generate_series(1, 405) AS n;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.list_team_candidates(100000)) <> 400 THEN
    RAISE EXCEPTION 'jendela kandidat harus dibatasi 400';
  END IF;
  IF (SELECT count(*) FROM public.list_team_candidates()) <> 200 THEN
    RAISE EXCEPTION 'batas bawaan harus 200';
  END IF;
  IF (SELECT count(*) FROM public.list_team_candidates(0)) <> 1 THEN
    RAISE EXCEPTION 'batas minimum harus 1';
  END IF;
  IF (SELECT count(*) FROM public.list_team_candidates(NULL)) <> 200 THEN
    RAISE EXCEPTION 'batas NULL harus jatuh ke bawaan 200';
  END IF;
END$$;

-- 10. Pemilik boleh menghapus kartunya; sesudahnya ia tak lagi bisa dilihat.
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a02';
DELETE FROM public.team_seekers WHERE user_id = '00000000-0000-4000-8000-0000000d0a02';
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000d0a01';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_team_candidates(500) WHERE user_id = '00000000-0000-4000-8000-0000000d0a02') THEN
    RAISE EXCEPTION 'kartu yang dihapus tidak boleh muncul lagi';
  END IF;
END$$;
RESET ROLE;
ROLLBACK;
