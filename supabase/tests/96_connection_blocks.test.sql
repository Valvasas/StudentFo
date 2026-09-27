-- Blokir (ADR-041): dua arah, memutus koneksi yang ada, mencegah ajakan
-- baru dari kedua sisi, daftar blokir privat.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000b0a01', 'a@blk', '{"full_name":"Ana Blokir"}'),
  ('00000000-0000-4000-8000-0000000b0a02', 'b@blk', '{"full_name":"Budi Blokir"}'),
  ('00000000-0000-4000-8000-0000000b0a03', 'c@blk', '{"full_name":"Cici Blokir"}');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a01';
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000b0a01', true);
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a02';
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000b0a02', true);

-- Ana mengajak Budi, Budi menerima — koneksi ACCEPTED terbentuk dulu.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a01';
INSERT INTO public.connections (requester_id, addressee_id) VALUES
  ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a02';
UPDATE public.connections SET status = 'ACCEPTED'
WHERE requester_id = '00000000-0000-4000-8000-0000000b0a01' AND addressee_id = '00000000-0000-4000-8000-0000000b0a02';

DO $$
BEGIN
  IF (SELECT status FROM public.connections WHERE requester_id = '00000000-0000-4000-8000-0000000b0a01') <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'prasyarat: koneksi Ana-Budi harus ACCEPTED sebelum diblokir';
  END IF;
  -- Tidak bisa membuat baris blokir atas nama orang lain.
  BEGIN
    INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a03');
    RAISE EXCEPTION 'harus gagal — dijalankan sebagai Budi, bukan Ana';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000b0a02', '00000000-0000-4000-8000-0000000b0a02');
    RAISE EXCEPTION 'tidak boleh memblokir diri sendiri';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

-- Budi memblokir Ana.
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000b0a02', '00000000-0000-4000-8000-0000000b0a01');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.connections WHERE requester_id = '00000000-0000-4000-8000-0000000b0a01' OR addressee_id = '00000000-0000-4000-8000-0000000b0a01') THEN
    RAISE EXCEPTION 'blokir harus memutus koneksi yang sudah ada';
  END IF;
END$$;

-- Ana (yang diblokir) tidak bisa mengajak balik.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a01';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02');
    RAISE EXCEPTION 'pihak yang diblokir tidak boleh bisa mengajak lagi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Ana tidak bisa melihat bahwa dirinya diblokir (bukan baris miliknya).
  IF EXISTS (SELECT 1 FROM public.connection_blocks) THEN
    RAISE EXCEPTION 'pihak yang diblokir tidak boleh membaca baris blokir milik orang lain';
  END IF;
END$$;

-- Budi (yang memblokir) juga tidak bisa mengajak Ana selama blokir aktif.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a02';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000b0a02', '00000000-0000-4000-8000-0000000b0a01');
    RAISE EXCEPTION 'is_blocked() harus menolak dari kedua arah';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.connection_blocks_with_names WHERE blocked_id = '00000000-0000-4000-8000-0000000b0a01' AND blocked_full_name = 'Ana Blokir') THEN
    RAISE EXCEPTION 'daftar blokir sendiri harus terlihat lengkap dengan nama';
  END IF;
END$$;

-- Cici (pihak ketiga) tidak melihat siapa pun memblokir siapa.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a03';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.connection_blocks) OR EXISTS (SELECT 1 FROM public.connection_blocks_with_names) THEN
    RAISE EXCEPTION 'pihak ketiga tidak boleh melihat daftar blokir orang lain';
  END IF;
END$$;

-- Budi membuka blokir → Ana bisa mengajak lagi.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a02';
DELETE FROM public.connection_blocks WHERE blocker_id = '00000000-0000-4000-8000-0000000b0a02' AND blocked_id = '00000000-0000-4000-8000-0000000b0a01';

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a01';
INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.connections WHERE requester_id = '00000000-0000-4000-8000-0000000b0a01' AND addressee_id = '00000000-0000-4000-8000-0000000b0a02') THEN
    RAISE EXCEPTION 'setelah blokir dibuka, ajakan baru harus diizinkan lagi';
  END IF;
END$$;
RESET ROLE;
ROLLBACK;
