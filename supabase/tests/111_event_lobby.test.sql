-- Lobi lomba (ADR-071): hanya yang sudah mendaftar bisa bergabung, daftar
-- anggota hanya terbaca sesama anggota, blokir menyembunyikan dua arah,
-- ajakan hanya ke koneksi, sekali per lomba, dan notifikasinya satu per orang.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f2a01', 'a@lobi', '{"full_name":"Ayu Lobi"}'),
  ('00000000-0000-4000-8000-0000000f2a02', 'b@lobi', '{"full_name":"Bima Lobi"}'),
  ('00000000-0000-4000-8000-0000000f2a03', 'c@lobi', '{"full_name":"Citra Lobi"}'),
  ('00000000-0000-4000-8000-0000000f2a04', 'd@lobi', '{"full_name":"Dodi Lobi"}');

INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at) VALUES
  ('00000000-0000-4000-8000-0000000f2e01', 'Lomba Lobi Uji', 'Panitia Lobi', 'LOMBA', 'https://daftar.example/lobi', 'https://sumber.example/lobi', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000f2e02', 'Beasiswa Lobi Uji', 'Yayasan Lobi', 'BEASISWA', 'https://daftar.example/beasiswa-lobi', 'https://sumber.example/beasiswa-lobi', 'APPROVED', now()),
  ('00000000-0000-4000-8000-0000000f2e03', 'Lomba Lobi Tutup', 'Panitia Tutup', 'LOMBA', 'https://daftar.example/tutup', 'https://sumber.example/tutup', 'APPROVED', now());
INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary) VALUES
  ('00000000-0000-4000-8000-0000000f2e01', 'registration', now() + interval '10 days', true),
  ('00000000-0000-4000-8000-0000000f2e02', 'registration', now() + interval '10 days', true),
  ('00000000-0000-4000-8000-0000000f2e03', 'registration', now() - interval '1 day', true);

-- A & D lewat Papan lamaran, B lewat formulir StudentFo, C belum mendaftar (SAVED saja).
INSERT INTO public.application_tracker (user_id, event_id, status) VALUES
  ('00000000-0000-4000-8000-0000000f2a01', '00000000-0000-4000-8000-0000000f2e01', 'APPLIED'),
  ('00000000-0000-4000-8000-0000000f2a01', '00000000-0000-4000-8000-0000000f2e02', 'APPLIED'),
  ('00000000-0000-4000-8000-0000000f2a01', '00000000-0000-4000-8000-0000000f2e03', 'APPLIED'),
  ('00000000-0000-4000-8000-0000000f2a03', '00000000-0000-4000-8000-0000000f2e01', 'SAVED'),
  ('00000000-0000-4000-8000-0000000f2a04', '00000000-0000-4000-8000-0000000f2e01', 'APPLIED');
INSERT INTO public.event_registrations (code, event_id, user_id, full_name, email, status) VALUES
  ('SF-0000F2B2', '00000000-0000-4000-8000-0000000f2e01', '00000000-0000-4000-8000-0000000f2a02', 'Bima Lobi', 'b@lobi', 'CONFIRMED');

SET LOCAL ROLE authenticated;

-- C (belum mendaftar) tidak bisa bergabung; A tidak bisa bergabung ke lobi beasiswa / lomba tutup.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a03';
DO $$
BEGIN
  BEGIN
    PERFORM public.join_lobby('00000000-0000-4000-8000-0000000f2e01', 'CARI_TIM', NULL);
    RAISE EXCEPTION 'yang belum mendaftar tidak boleh bergabung';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'lobby_forbidden' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.lobby_member_counts(ARRAY['00000000-0000-4000-8000-0000000f2e01']::uuid[])) THEN
    RAISE EXCEPTION 'yang belum mendaftar tidak boleh melihat jumlah anggota';
  END IF;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a01';
DO $$
BEGIN
  BEGIN
    PERFORM public.join_lobby('00000000-0000-4000-8000-0000000f2e02', 'CARI_TIM', NULL);
    RAISE EXCEPTION 'lobi hanya untuk lomba';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'lobby_forbidden' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.join_lobby('00000000-0000-4000-8000-0000000f2e03', 'CARI_TIM', NULL);
    RAISE EXCEPTION 'lomba yang pendaftarannya ditutup: lobi hanya bisa dibaca';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'lobby_closed' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.lobby_members (event_id, user_id, intent) VALUES ('00000000-0000-4000-8000-0000000f2e01', '00000000-0000-4000-8000-0000000f2a01', 'CARI_TIM');
    RAISE EXCEPTION 'tulis langsung ke tabel harus ditolak — hanya lewat join_lobby';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

SELECT public.join_lobby('00000000-0000-4000-8000-0000000f2e01', 'CARI_TIM', '  Bisa UI/UX, cari backend  ');
DO $$
BEGIN
  IF (SELECT note FROM public.lobby_members WHERE user_id = '00000000-0000-4000-8000-0000000f2a01') <> 'Bisa UI/UX, cari backend' THEN
    RAISE EXCEPTION 'catatan harus dirapikan';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lobby_roster('00000000-0000-4000-8000-0000000f2e01')) THEN
    RAISE EXCEPTION 'belum ada anggota lain';
  END IF;
END$$;
-- Bergabung ulang = memperbarui kartu, bukan baris ganda.
SELECT public.join_lobby('00000000-0000-4000-8000-0000000f2e01', 'CARI_ANGGOTA', '');

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a02';
SELECT public.join_lobby('00000000-0000-4000-8000-0000000f2e01', 'CARI_TIM', NULL);
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a04';
SELECT public.join_lobby('00000000-0000-4000-8000-0000000f2e01', 'SIAP', NULL);
RESET ROLE;

-- A memblokir D.
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000f2a01', '00000000-0000-4000-8000-0000000f2a04');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a01';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.lobby_members) <> 1 THEN
    RAISE EXCEPTION 'tabel hanya menampilkan baris sendiri';
  END IF;
  IF (SELECT intent FROM public.lobby_members) <> 'CARI_ANGGOTA' OR (SELECT note FROM public.lobby_members) IS NOT NULL THEN
    RAISE EXCEPTION 'bergabung ulang harus memperbarui kartu (catatan kosong = NULL)';
  END IF;
  IF (SELECT array_agg(full_name ORDER BY full_name) FROM public.lobby_roster('00000000-0000-4000-8000-0000000f2e01')) <> ARRAY['Bima Lobi'] THEN
    RAISE EXCEPTION 'roster A = B saja (D diblokir)';
  END IF;
  IF (SELECT relation FROM public.lobby_roster('00000000-0000-4000-8000-0000000f2e01')) <> 'none' THEN
    RAISE EXCEPTION 'A dan B belum terhubung';
  END IF;
  IF (SELECT member_count FROM public.lobby_member_counts(ARRAY['00000000-0000-4000-8000-0000000f2e01']::uuid[])) <> 3 THEN
    RAISE EXCEPTION 'jumlah anggota = 3';
  END IF;
END$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a04';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lobby_roster('00000000-0000-4000-8000-0000000f2e01') WHERE full_name = 'Ayu Lobi') THEN
    RAISE EXCEPTION 'blokir berlaku dua arah: D tidak melihat A';
  END IF;
END$$;

-- C belum anggota → roster kosong walau tahu id lombanya.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a03';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lobby_roster('00000000-0000-4000-8000-0000000f2e01')) THEN
    RAISE EXCEPTION 'bukan anggota tidak boleh membaca roster';
  END IF;
END$$;

-- Ajakan: hanya ke koneksi.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a01';
DO $$
BEGIN
  BEGIN
    PERFORM public.invite_to_lobby('00000000-0000-4000-8000-0000000f2e01', '00000000-0000-4000-8000-0000000f2a03');
    RAISE EXCEPTION 'mengajak orang yang bukan koneksi harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'lobby_invite_invalid' THEN RAISE; END IF;
  END;
END$$;
RESET ROLE;

-- Trigger koneksi memaksa baris baru PENDING: ajakan yang belum diterima belum cukup.
INSERT INTO public.connections (requester_id, addressee_id) VALUES
  ('00000000-0000-4000-8000-0000000f2a01', '00000000-0000-4000-8000-0000000f2a03'),
  ('00000000-0000-4000-8000-0000000f2a02', '00000000-0000-4000-8000-0000000f2a03');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a01';
DO $$
BEGIN
  BEGIN
    PERFORM public.invite_to_lobby('00000000-0000-4000-8000-0000000f2e01', '00000000-0000-4000-8000-0000000f2a03');
    RAISE EXCEPTION 'koneksi yang masih menunggu jawaban bukan koneksi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'lobby_invite_invalid' THEN RAISE; END IF;
  END;
END$$;
RESET ROLE;
UPDATE public.connections SET status = 'ACCEPTED' WHERE addressee_id = '00000000-0000-4000-8000-0000000f2a03';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a01';
DO $$
BEGIN
  IF NOT public.invite_to_lobby('00000000-0000-4000-8000-0000000f2e01', '00000000-0000-4000-8000-0000000f2a03') THEN
    RAISE EXCEPTION 'ajakan pertama harus tercatat';
  END IF;
  IF public.invite_to_lobby('00000000-0000-4000-8000-0000000f2e01', '00000000-0000-4000-8000-0000000f2a03') THEN
    RAISE EXCEPTION 'ajakan kedua ke orang yang sama = FALSE, bukan baris baru';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a02';
SELECT public.invite_to_lobby('00000000-0000-4000-8000-0000000f2e01', '00000000-0000-4000-8000-0000000f2a03');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.lobby_invites WHERE invitee_id = '00000000-0000-4000-8000-0000000f2a03') <> 2 THEN
    RAISE EXCEPTION 'dua pengajak = dua baris ajakan';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000f2a03' AND type = 'LOBBY_INVITE') <> 1 THEN
    RAISE EXCEPTION 'diajak dua teman = satu notifikasi per lomba';
  END IF;
  IF (SELECT message FROM public.notifications WHERE user_id = '00000000-0000-4000-8000-0000000f2a03' AND type = 'LOBBY_INVITE') NOT LIKE 'Ayu Lobi mengajakmu ikut Lomba Lobi Uji.%' THEN
    RAISE EXCEPTION 'notifikasi menyebut pengajak pertama dan lombanya';
  END IF;
END$$;

-- Sesama anggota lobi boleh saling mengajak terhubung walau tidak "bisa
-- ditemukan" di Koneksi; yang bukan anggota lobi yang sama tetap tidak.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a01';
INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000f2a01', '00000000-0000-4000-8000-0000000f2a02');
DO $$
BEGIN
  IF (SELECT relation FROM public.lobby_roster('00000000-0000-4000-8000-0000000f2e01') WHERE full_name = 'Bima Lobi') <> 'pending' THEN
    RAISE EXCEPTION 'ajakan dari lobi harus terlihat menunggu di roster';
  END IF;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a04';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000f2a04', '00000000-0000-4000-8000-0000000f2a01');
    RAISE EXCEPTION 'blokir tetap berlaku walau satu lobi';
  -- Ditolak RLS (is_blocked) atau trigger kunci pasangan (connection_blocked) — keduanya menolak.
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM <> 'connection_blocked' THEN RAISE; END IF;
  END;
END$$;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a03';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000f2a03', '00000000-0000-4000-8000-0000000f2a04');
    RAISE EXCEPTION 'bukan anggota lobi yang sama & tidak bisa ditemukan → tidak boleh diajak';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- Keluar lobi: hanya baris sendiri.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000f2a01';
DELETE FROM public.lobby_members WHERE user_id = '00000000-0000-4000-8000-0000000f2a02';
DELETE FROM public.lobby_members WHERE user_id = '00000000-0000-4000-8000-0000000f2a01';
RESET ROLE;
DO $$
BEGIN
  IF (SELECT array_agg(user_id::text ORDER BY user_id) FROM public.lobby_members) <> ARRAY['00000000-0000-4000-8000-0000000f2a02', '00000000-0000-4000-8000-0000000f2a04'] THEN
    RAISE EXCEPTION 'A keluar, baris B tidak boleh terhapus oleh A';
  END IF;
END$$;
ROLLBACK;
