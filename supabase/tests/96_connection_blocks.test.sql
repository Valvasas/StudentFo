-- Blokir koneksi (ADR-041): blokir memutus koneksi yang ada, ajakan baru
-- dari KEDUA arah ditolak, pemblokir & yang diblokir saling hilang dari
-- direktori, buka blokir mengizinkan ajakan lagi, dan pihak ketiga (atau
-- yang diblokir) tidak bisa membaca daftar blokir orang lain.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000b0a01', 'a@blok', '{"full_name":"Ana Blok"}'),
  ('00000000-0000-4000-8000-0000000b0a02', 'b@blok', '{"full_name":"Budi Blok"}'),
  ('00000000-0000-4000-8000-0000000b0a03', 'c@blok', '{"full_name":"Cici Blok"}'),
  ('00000000-0000-4000-8000-0000000b0a04', 'd@blok', '{"full_name":"Dodi Tersembunyi"}');

-- Ana, Budi, Cici bisa ditemukan; Dodi tidak.
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES
  ('00000000-0000-4000-8000-0000000b0a01', true),
  ('00000000-0000-4000-8000-0000000b0a02', true),
  ('00000000-0000-4000-8000-0000000b0a03', true);

-- Ana ↔ Budi terhubung.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a01';
INSERT INTO public.connections (requester_id, addressee_id) VALUES
  ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a02';
UPDATE public.connections SET status = 'ACCEPTED' WHERE requester_id = '00000000-0000-4000-8000-0000000b0a01';

-- Dodi (tersembunyi) mengajak Ana — kasus pelecehan paling nyata: pengirim
-- tidak ada di direktori, tapi Ana tetap harus bisa memblokirnya.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a04';
INSERT INTO public.connections (requester_id, addressee_id) VALUES
  ('00000000-0000-4000-8000-0000000b0a04', '00000000-0000-4000-8000-0000000b0a01');

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a01';
DO $$
BEGIN
  -- Tidak bisa memblokir atas nama orang lain.
  BEGIN
    INSERT INTO public.connection_blocks (blocker_id, blocked_id)
    VALUES ('00000000-0000-4000-8000-0000000b0a03', '00000000-0000-4000-8000-0000000b0a02');
    RAISE EXCEPTION 'memblokir atas nama orang lain harus ditolak';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- `created_at` diisi server.
  BEGIN
    INSERT INTO public.connection_blocks (blocker_id, blocked_id, created_at)
    VALUES ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02', now() - interval '1 year');
    RAISE EXCEPTION 'kolom created_at tidak boleh diisi klien';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Diri sendiri.
  BEGIN
    INSERT INTO public.connection_blocks (blocker_id, blocked_id)
    VALUES ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a01');
    RAISE EXCEPTION 'memblokir diri sendiri harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

-- Ana memblokir Budi (koneksi diterima) dan Dodi (ajakan masuk, tersembunyi).
INSERT INTO public.connection_blocks (blocker_id, blocked_id) VALUES
  ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02'),
  ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a04');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.connection_peers) THEN
    RAISE EXCEPTION 'blokir harus memutus koneksi & ajakan yang ada';
  END IF;
  IF (SELECT array_agg(full_name ORDER BY full_name) FROM public.blocked_people) <> ARRAY['Budi Blok', 'Dodi Tersembunyi']::varchar[] THEN
    RAISE EXCEPTION 'pemblokir harus melihat daftar blokirnya: %', (SELECT array_agg(full_name) FROM public.blocked_people);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blocked_people' AND column_name = 'email') THEN
    RAISE EXCEPTION 'blocked_people tidak boleh memuat email';
  END IF;
  IF EXISTS (SELECT 1 FROM public.network_directory WHERE user_id = '00000000-0000-4000-8000-0000000b0a02') THEN
    RAISE EXCEPTION 'orang yang kublokir tidak boleh muncul di direktoriku';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.network_directory WHERE user_id = '00000000-0000-4000-8000-0000000b0a03') THEN
    RAISE EXCEPTION 'blokir tidak boleh menyembunyikan orang lain dari direktori';
  END IF;
  -- Pemblokir sendiri juga tidak bisa mengajak orang yang diblokirnya.
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id)
    VALUES ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02');
    RAISE EXCEPTION 'pemblokir tidak boleh mengajak orang yang diblokirnya';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    IF SQLSTATE = 'P0001' AND SQLERRM <> 'connection_blocked' THEN RAISE; END IF;
  END;
  -- Memblokir orang yang tidak pernah terlihat (tersembunyi, tanpa koneksi)
  -- ditolak: kalau tidak, `blocked_people` membocorkan namanya.
  DELETE FROM public.connection_blocks WHERE blocked_id = '00000000-0000-4000-8000-0000000b0a04';
  BEGIN
    INSERT INTO public.connection_blocks (blocker_id, blocked_id)
    VALUES ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a04');
    RAISE EXCEPTION 'memblokir orang tersembunyi tanpa koneksi harus ditolak';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

-- Yang diblokir: tidak bisa mengajak, tidak melihat pemblokir di direktori,
-- tidak bisa membaca atau menghapus baris blokir.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a02';
DELETE FROM public.connection_blocks WHERE blocker_id = '00000000-0000-4000-8000-0000000b0a01';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id)
    VALUES ('00000000-0000-4000-8000-0000000b0a02', '00000000-0000-4000-8000-0000000b0a01');
    RAISE EXCEPTION 'orang yang diblokir tidak boleh mengajak lagi';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    IF SQLSTATE = 'P0001' AND SQLERRM <> 'connection_blocked' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.network_directory WHERE user_id = '00000000-0000-4000-8000-0000000b0a01') THEN
    RAISE EXCEPTION 'pemblokir harus hilang dari direktori orang yang diblokirnya';
  END IF;
  IF EXISTS (SELECT 1 FROM public.connection_blocks) OR EXISTS (SELECT 1 FROM public.blocked_people) THEN
    RAISE EXCEPTION 'yang diblokir tidak boleh melihat baris blokir';
  END IF;
END$$;

-- Pihak ketiga: tidak melihat apa pun, dan is_blocked() tidak menjawab
-- pertanyaan tentang pasangan yang tidak melibatkannya.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a03';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.connection_blocks) OR EXISTS (SELECT 1 FROM public.blocked_people) THEN
    RAISE EXCEPTION 'pihak ketiga tidak boleh melihat daftar blokir orang lain';
  END IF;
  IF public.is_blocked('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02') THEN
    RAISE EXCEPTION 'is_blocked tidak boleh membocorkan blokir antara orang lain';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.network_directory WHERE user_id IN ('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02') HAVING count(*) = 2) THEN
    RAISE EXCEPTION 'blokir antara Ana & Budi tidak boleh menyembunyikan mereka dari pihak ketiga';
  END IF;
END$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.connection_blocks WHERE blocker_id = '00000000-0000-4000-8000-0000000b0a01' AND blocked_id = '00000000-0000-4000-8000-0000000b0a02') THEN
    RAISE EXCEPTION 'yang diblokir tidak boleh bisa menghapus blokir';
  END IF;
END$$;

-- Penjaga kedua di policy UPDATE: ajakan yang entah bagaimana tersisa di
-- antara pasangan yang saling blokir tidak bisa diterima. Baris disisipkan
-- langsung oleh pemilik tabel (tanpa klaim JWT → trigger tidak memblokir).
SET LOCAL request.jwt.claim.sub = '';
INSERT INTO public.connections (id, requester_id, addressee_id) VALUES
  ('00000000-0000-4000-8000-0000000b0c01', '00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a02';
DO $$
BEGIN
  BEGIN
    UPDATE public.connections SET status = 'ACCEPTED' WHERE id = '00000000-0000-4000-8000-0000000b0c01';
    RAISE EXCEPTION 'ajakan antara pasangan yang saling blokir tidak boleh diterima';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;
DELETE FROM public.connections WHERE id = '00000000-0000-4000-8000-0000000b0c01';

-- Buka blokir → saling terlihat lagi dan boleh mengajak lagi.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a01';
DELETE FROM public.connection_blocks WHERE blocked_id = '00000000-0000-4000-8000-0000000b0a02';
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000b0a02';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.network_directory WHERE user_id = '00000000-0000-4000-8000-0000000b0a01') THEN
    RAISE EXCEPTION 'setelah blokir dibuka, pemblokir harus kembali terlihat';
  END IF;
END$$;
INSERT INTO public.connections (requester_id, addressee_id) VALUES
  ('00000000-0000-4000-8000-0000000b0a02', '00000000-0000-4000-8000-0000000b0a01');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.connections WHERE requester_id = '00000000-0000-4000-8000-0000000b0a02' AND addressee_id = '00000000-0000-4000-8000-0000000b0a01') THEN
    RAISE EXCEPTION 'setelah blokir dibuka, ajakan harus diizinkan lagi';
  END IF;
END$$;

-- Tamu tidak menyentuh tabel & view blokir sama sekali.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.connection_blocks;
    RAISE EXCEPTION 'anon tidak boleh membaca connection_blocks';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.blocked_people;
    RAISE EXCEPTION 'anon tidak boleh membaca blocked_people';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.is_blocked('00000000-0000-4000-8000-0000000b0a01', '00000000-0000-4000-8000-0000000b0a02');
    RAISE EXCEPTION 'anon tidak boleh memanggil is_blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;
ROLLBACK;
