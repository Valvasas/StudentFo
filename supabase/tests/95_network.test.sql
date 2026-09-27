-- Koneksi (ADR-040): opt-in direktori, satu baris per pasangan, hanya yang
-- diajak boleh menerima, pihak ketiga tidak melihat apa pun, notifikasi,
-- koneksi bersama, dan batas laju yang tidak bisa diakali kirim-batal.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000c0a01', 'a@net', '{"full_name":"Ana"}'),
  ('00000000-0000-4000-8000-0000000c0a02', 'b@net', '{"full_name":"Budi"}'),
  ('00000000-0000-4000-8000-0000000c0a03', 'c@net', '{"full_name":"Cici"}'),
  ('00000000-0000-4000-8000-0000000c0a04', 'd@net', '{"full_name":"Dodi"}');

-- Budi & Dodi memilih bisa ditemukan; Cici tidak punya profil jaringan.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a02';
INSERT INTO public.network_profiles (user_id, is_discoverable, headline)
VALUES ('00000000-0000-4000-8000-0000000c0a02', true, 'Backend');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a04';
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000c0a04', true);
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a01';
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000c0a01', true);

DO $$
BEGIN
  -- Tidak bisa membuat profil jaringan atas nama orang lain.
  BEGIN
    INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000c0a03', true);
    RAISE EXCEPTION 'profil jaringan orang lain tidak boleh dibuat';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF EXISTS (SELECT 1 FROM public.network_directory WHERE user_id = '00000000-0000-4000-8000-0000000c0a03') THEN
    RAISE EXCEPTION 'orang yang tidak memilih bisa ditemukan tidak boleh ada di direktori';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.network_directory WHERE user_id = '00000000-0000-4000-8000-0000000c0a02' AND headline = 'Backend') THEN
    RAISE EXCEPTION 'direktori harus memuat orang yang memilih bisa ditemukan';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name IN ('network_directory', 'connection_peers') AND column_name = 'email') THEN
    RAISE EXCEPTION 'view jaringan tidak boleh memuat email';
  END IF;

  -- Target yang tidak bisa ditemukan tidak bisa diajak.
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000c0a01', '00000000-0000-4000-8000-0000000c0a03');
    RAISE EXCEPTION 'mengajak orang yang tersembunyi harus ditolak';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Tidak bisa mengajak atas nama orang lain.
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000c0a04', '00000000-0000-4000-8000-0000000c0a02');
    RAISE EXCEPTION 'mengajak atas nama orang lain harus ditolak';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Status tidak bisa diisi klien (langsung ACCEPTED tanpa persetujuan).
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id, status) VALUES ('00000000-0000-4000-8000-0000000c0a01', '00000000-0000-4000-8000-0000000c0a02', 'ACCEPTED');
    RAISE EXCEPTION 'kolom status tidak boleh diisi saat insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

INSERT INTO public.connections (requester_id, addressee_id, message) VALUES
  ('00000000-0000-4000-8000-0000000c0a01', '00000000-0000-4000-8000-0000000c0a02', 'Halo Budi');
-- Klien tidak punya hak mengisi `id`; test memberi id tetap sebagai superuser.
RESET ROLE;
UPDATE public.connections SET id = '00000000-0000-4000-8000-0000000c0c01'
WHERE requester_id = '00000000-0000-4000-8000-0000000c0a01' AND addressee_id = '00000000-0000-4000-8000-0000000c0a02';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a01';

-- Pengirim tidak bisa menerima ajakannya sendiri (0 baris berubah).
UPDATE public.connections SET status = 'ACCEPTED' WHERE id = '00000000-0000-4000-8000-0000000c0c01';

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a02';
DO $$
BEGIN
  IF (SELECT status FROM public.connections WHERE id = '00000000-0000-4000-8000-0000000c0c01') <> 'PENDING' THEN
    RAISE EXCEPTION 'pengirim tidak boleh menerima ajakannya sendiri';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE type = 'CONNECTION_REQUEST' AND message = 'Ana ingin terhubung denganmu.') THEN
    RAISE EXCEPTION 'yang diajak harus dikabari';
  END IF;
  -- Pasangan yang sama dari arah sebaliknya ditolak indeks unik.
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000c0a02', '00000000-0000-4000-8000-0000000c0a01');
    RAISE EXCEPTION 'pasangan ganda (arah terbalik) harus ditolak';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- Yang diajak hanya boleh mengubah status, bukan pesan / pihak.
  BEGIN
    UPDATE public.connections SET message = 'diubah' WHERE id = '00000000-0000-4000-8000-0000000c0c01';
    RAISE EXCEPTION 'kolom selain status tidak boleh diubah';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;

UPDATE public.connections SET status = 'ACCEPTED' WHERE id = '00000000-0000-4000-8000-0000000c0c01';

-- Dodi terhubung dengan Ana dan Budi → satu koneksi bersama di antara keduanya.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a04';
INSERT INTO public.connections (requester_id, addressee_id) VALUES
  ('00000000-0000-4000-8000-0000000c0a04', '00000000-0000-4000-8000-0000000c0a01'),
  ('00000000-0000-4000-8000-0000000c0a04', '00000000-0000-4000-8000-0000000c0a02');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a01';
UPDATE public.connections SET status = 'ACCEPTED' WHERE requester_id = '00000000-0000-4000-8000-0000000c0a04';
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a02';
UPDATE public.connections SET status = 'ACCEPTED' WHERE requester_id = '00000000-0000-4000-8000-0000000c0a04';

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a01';
DO $$
DECLARE
  peer RECORD;
BEGIN
  SELECT * INTO peer FROM public.connection_peers WHERE connection_id = '00000000-0000-4000-8000-0000000c0c01';
  IF peer IS NULL OR peer.full_name <> 'Budi' OR NOT peer.is_outgoing OR peer.status <> 'ACCEPTED' OR peer.responded_at IS NULL THEN
    RAISE EXCEPTION 'connection_peers harus menampilkan Budi sebagai koneksi keluar yang diterima: %', peer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE type = 'CONNECTION_ACCEPTED' AND message = 'Budi menerima ajakan koneksimu.') THEN
    RAISE EXCEPTION 'pengirim harus dikabari saat diterima';
  END IF;
  IF (SELECT mutual_count FROM public.mutual_connection_counts(ARRAY['00000000-0000-4000-8000-0000000c0a02'::uuid])) <> 1 THEN
    RAISE EXCEPTION 'Ana & Budi harus punya tepat satu koneksi bersama (Dodi)';
  END IF;
END$$;

-- Pihak ketiga tidak melihat apa pun dan tidak bisa menghapus.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a03';
DELETE FROM public.connections WHERE id = '00000000-0000-4000-8000-0000000c0c01';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.connections) OR EXISTS (SELECT 1 FROM public.connection_peers) THEN
    RAISE EXCEPTION 'pihak ketiga tidak boleh melihat koneksi orang lain';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mutual_connection_counts(ARRAY['00000000-0000-4000-8000-0000000c0a02'::uuid])) THEN
    RAISE EXCEPTION 'koneksi bersama hanya dihitung terhadap koneksi pemanggil';
  END IF;
END$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.connections WHERE id = '00000000-0000-4000-8000-0000000c0c01') THEN
    RAISE EXCEPTION 'pihak ketiga tidak boleh bisa menghapus koneksi orang lain';
  END IF;
END$$;

-- Tamu tidak bisa membaca direktori.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.network_directory;
    RAISE EXCEPTION 'anon tidak boleh membaca direktori';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

-- Batas laju dihitung dari percobaan, bukan baris yang tersisa: isi ember
-- Cici sampai penuh, lalu ajakan berikutnya ditolak walau tabelnya kosong.
INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('00000000-0000-4000-8000-0000000c0a03', true);
INSERT INTO public.rate_limit_hits (bucket)
SELECT 'connection:00000000-0000-4000-8000-0000000c0a03' FROM generate_series(1, 30);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a03';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.connections (requester_id, addressee_id) VALUES ('00000000-0000-4000-8000-0000000c0a03', '00000000-0000-4000-8000-0000000c0a04');
    RAISE EXCEPTION 'ajakan ke-31 dalam 24 jam harus ditolak';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'connection_rate_limited' THEN RAISE; END IF;
  END;
END$$;

-- Kedua pihak boleh memutus.
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0a02';
DELETE FROM public.connections WHERE id = '00000000-0000-4000-8000-0000000c0c01';
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.connections WHERE id = '00000000-0000-4000-8000-0000000c0c01') THEN
    RAISE EXCEPTION 'yang diajak harus bisa memutus koneksi';
  END IF;
END$$;
ROLLBACK;
