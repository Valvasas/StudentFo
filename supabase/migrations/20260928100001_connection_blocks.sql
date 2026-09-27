-- =====================================================================
-- StudentFo — Blokir koneksi (ADR-041, menutup celah ADR-040 § Konsekuensi)
--
-- Sebelum ini, orang yang ditolak/diputus bisa mengajak lagi berkali-kali,
-- hanya dibatasi 30 ajakan/24 jam — dan setiap ajakan mengirim notifikasi.
--
--   * connection_blocks — satu baris per (pemblokir, yang diblokir). Hanya
--     pemblokir yang melihat/menulis barisnya; yang diblokir TIDAK diberi
--     tahu dan tidak bisa membaca apa pun dari tabel ini.
--   * is_blocked(a, b)  — dua arah, dipakai policy `connections`.
--   * Memblokir memutus: koneksi/ajakan yang ada di antara keduanya dihapus.
--   * network_directory — pemblokir & yang diblokir saling hilang dari
--     direktori (arah "dia memblokirku" tidak bisa disaring aplikasi karena
--     RLS menyembunyikannya — jadi harus di view).
--   * blocked_people    — nama orang yang KUBLOKIR, untuk halaman kelola.
--
-- Migration 20260927100001 TIDAK diubah; policy & fungsi yang perlu
-- berubah di-DROP + CREATE / CREATE OR REPLACE di sini.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
CREATE TABLE public.connection_blocks (
  blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT connection_blocks_not_self CHECK (blocker_id <> blocked_id)
);

-- PK melayani arah (pemblokir → yang diblokir); is_blocked() dan saringan
-- direktori juga mencari arah sebaliknya.
CREATE INDEX idx_connection_blocks_blocked ON public.connection_blocks (blocked_id, blocker_id);

ALTER TABLE public.connection_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY connection_blocks_select_own ON public.connection_blocks
  FOR SELECT TO authenticated USING (blocker_id = (select auth.uid()));

-- Hanya orang yang memang pernah "terlihat" oleh pemblokir: bisa ditemukan
-- di direktori, atau punya koneksi/ajakan dengannya (termasuk ajakan masuk
-- dari orang yang tersembunyi — kasus pelecehan yang paling nyata). Tanpa
-- syarat ini, memblokir UUID sembarang lalu membaca `blocked_people` akan
-- membocorkan nama orang yang tidak pernah membuka profilnya.
CREATE POLICY connection_blocks_insert_own ON public.connection_blocks
  FOR INSERT TO authenticated
  WITH CHECK (
    blocker_id = (select auth.uid())
    AND (
      public.is_discoverable(blocked_id)
      OR EXISTS (
        SELECT 1 FROM public.connections c
        WHERE LEAST(c.requester_id, c.addressee_id) = LEAST(blocker_id, blocked_id)
          AND GREATEST(c.requester_id, c.addressee_id) = GREATEST(blocker_id, blocked_id)
      )
    )
  );

CREATE POLICY connection_blocks_delete_own ON public.connection_blocks
  FOR DELETE TO authenticated USING (blocker_id = (select auth.uid()));

-- Hak per kolom (AGENTS.md §14/§15): `created_at` diisi server, tidak ada UPDATE.
REVOKE ALL ON public.connection_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.connection_blocks TO authenticated;
GRANT INSERT (blocker_id, blocked_id) ON public.connection_blocks TO authenticated;

-- ---------------------------------------------------------------------
-- 2. is_blocked(a, b) — dua arah
--
-- DEFINER karena policy `connections` harus tahu apakah LAWAN memblokir
-- pemanggil, sementara RLS di atas hanya membuka baris milik pemanggil.
-- Hanya menjawab kalau pemanggil adalah salah satu pihak: tanpa penjaga
-- ini siapa pun bisa menanyakan "apakah A memblokir B?" untuk pasangan
-- mana pun. service_role (tanpa auth.uid()) selalu mendapat false — ia
-- melewati RLS dan trigger di bawah memang tidak berlaku untuknya.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_blocked(p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth.uid() IN (p_a, p_b), false)
    AND EXISTS (
      SELECT 1 FROM public.connection_blocks
      WHERE (blocker_id = p_a AND blocked_id = p_b) OR (blocker_id = p_b AND blocked_id = p_a)
    );
$$;

REVOKE ALL ON FUNCTION public.is_blocked(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked(UUID, UUID) TO authenticated;

-- Kunci transaksi per PASANGAN (tanpa memandang arah). Policy WITH CHECK
-- dievaluasi dengan snapshot awal statement, jadi "A memblokir B" dan
-- "B mengajak A" yang berjalan bersamaan bisa sama-sama lolos: ajakan
-- tidak melihat blokir yang belum commit, dan penghapusan di trigger blokir
-- tidak melihat ajakan yang belum commit. Kedua trigger mengambil kunci
-- ini lalu memeriksa ulang dengan snapshot baru (READ COMMITTED).
CREATE OR REPLACE FUNCTION public.lock_connection_pair(p_a UUID, p_b UUID)
RETURNS VOID
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended('connection-pair:' || LEAST(p_a, p_b)::text || ':' || GREATEST(p_a, p_b)::text, 0)
  );
$$;

REVOKE ALL ON FUNCTION public.lock_connection_pair(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Policy `connections`: tolak kalau salah satu pihak memblokir
-- ---------------------------------------------------------------------
DROP POLICY connections_insert_requester ON public.connections;
CREATE POLICY connections_insert_requester ON public.connections
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = (select auth.uid())
    AND status = 'PENDING'
    AND public.is_discoverable(addressee_id)
    AND NOT public.is_blocked(requester_id, addressee_id)
  );

-- Blokir sudah menghapus ajakan yang ada (trigger di bawah); cek ini
-- penjaga kedua kalau baris itu entah bagaimana masih tersisa.
DROP POLICY connections_accept_addressee ON public.connections;
CREATE POLICY connections_accept_addressee ON public.connections
  FOR UPDATE TO authenticated
  USING (addressee_id = (select auth.uid()) AND status = 'PENDING')
  WITH CHECK (
    addressee_id = (select auth.uid())
    AND status = 'ACCEPTED'
    AND NOT public.is_blocked(requester_id, addressee_id)
  );

-- Pengganti versi 20260927100001: sama persis + kunci pasangan & cek blokir
-- ulang. Teks 'connection_blocked' dibaca SupabaseEventRepository.
CREATE OR REPLACE FUNCTION public.enforce_connection_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.status := 'PENDING';
  NEW.responded_at := NULL;
  NEW.created_at := now();

  PERFORM public.lock_connection_pair(NEW.requester_id, NEW.addressee_id);
  IF public.is_blocked(NEW.requester_id, NEW.addressee_id) THEN
    RAISE EXCEPTION 'connection_blocked' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.consume_rate_limit('connection:' || NEW.requester_id::text, 30, 86400) THEN
    -- Teks 'connection_rate_limited' dibaca SupabaseEventRepository.requestConnection().
    RAISE EXCEPTION 'connection_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_connection_insert() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Memblokir memutus koneksi & ajakan yang ada, dua arah
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sever_blocked_connection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lock_connection_pair(NEW.blocker_id, NEW.blocked_id);
  DELETE FROM public.connections
  WHERE LEAST(requester_id, addressee_id) = LEAST(NEW.blocker_id, NEW.blocked_id)
    AND GREATEST(requester_id, addressee_id) = GREATEST(NEW.blocker_id, NEW.blocked_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sever_blocked_connection() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_connection_blocks_sever
  AFTER INSERT ON public.connection_blocks
  FOR EACH ROW EXECUTE FUNCTION public.sever_blocked_connection();

-- ---------------------------------------------------------------------
-- 5. Direktori: pemblokir & yang diblokir saling hilang
--
-- Kolom IDENTIK dengan 20260927100001 (CREATE OR REPLACE VIEW menuntutnya,
-- dan ADR-018/040 melarang menambah kolom). Dua NOT EXISTS terpisah, bukan
-- satu dengan OR, supaya masing-masing jadi anti-join ber-indeks.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.network_directory AS
SELECT
  u.id AS user_id,
  u.full_name,
  np.headline,
  u.education_level,
  u.major,
  u.interests,
  np.updated_at
FROM public.network_profiles np
JOIN public.users u ON u.id = np.user_id
WHERE np.is_discoverable
  AND NOT EXISTS (
    SELECT 1 FROM public.connection_blocks b
    WHERE b.blocker_id = (select auth.uid()) AND b.blocked_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.connection_blocks b
    WHERE b.blocked_id = (select auth.uid()) AND b.blocker_id = u.id
  );

REVOKE ALL ON public.network_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.network_directory TO authenticated;

COMMENT ON VIEW public.network_directory IS
  'Direktori Cari Koneksi: hanya pengguna yang memilih bisa ditemukan, tanpa orang yang memblokir/diblokir pemanggil. security_invoker = off untuk menembus users_select_own; tanpa email. Jangan tambah kolom (ADR-040/041).';

-- ---------------------------------------------------------------------
-- 6. Daftar orang yang KUBLOKIR (security_invoker = off, pola ADR-018)
--
-- Nama saja — cukup untuk mengenali siapa yang mau dibuka blokirnya.
-- Syarat INSERT di atas memastikan nama ini memang pernah terlihat oleh
-- pemblokir.
-- ---------------------------------------------------------------------
CREATE VIEW public.blocked_people AS
SELECT
  b.blocked_id AS user_id,
  u.full_name,
  b.created_at
FROM public.connection_blocks b
JOIN public.users u ON u.id = b.blocked_id
WHERE b.blocker_id = (select auth.uid());

REVOKE ALL ON public.blocked_people FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.blocked_people TO authenticated;

COMMENT ON VIEW public.blocked_people IS
  'Orang yang diblokir pemanggil. security_invoker = off; tanpa email. Jangan tambah kolom (ADR-041).';
