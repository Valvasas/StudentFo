-- =====================================================================
-- StudentFo — Blokir antar pengguna di fitur Koneksi (ADR-041)
--
-- Celah yang ditutup: orang yang ditolak/diputus di ADR-040 masih bisa
-- mengajak lagi berkali-kali (dibatasi hanya 30 ajakan/24 jam). Migration
-- ini menambah `connection_blocks` — satu arah, dicek DUA arah — dan
-- mengaitkannya ke policy `connections` yang sudah ada.
-- =====================================================================

CREATE TABLE public.connection_blocks (
  blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT connection_blocks_not_self CHECK (blocker_id <> blocked_id)
);

-- Dipakai `is_blocked()` untuk mengecek arah B→A tanpa memindai seluruh tabel.
CREATE INDEX idx_connection_blocks_blocked ON public.connection_blocks (blocked_id);

ALTER TABLE public.connection_blocks ENABLE ROW LEVEL SECURITY;

-- Daftar blokir adalah privat: siapa yang kamu blokir bukan urusan orang
-- yang diblokir maupun publik. Tidak ada policy UPDATE — blokir hanya
-- dibuat & dibatalkan (INSERT/DELETE), tidak pernah diubah isinya.
CREATE POLICY connection_blocks_select_own ON public.connection_blocks
  FOR SELECT TO authenticated USING (blocker_id = (select auth.uid()));
CREATE POLICY connection_blocks_insert_own ON public.connection_blocks
  FOR INSERT TO authenticated WITH CHECK (blocker_id = (select auth.uid()));
CREATE POLICY connection_blocks_delete_own ON public.connection_blocks
  FOR DELETE TO authenticated USING (blocker_id = (select auth.uid()));

REVOKE ALL ON public.connection_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.connection_blocks TO authenticated;
GRANT INSERT (blocker_id, blocked_id) ON public.connection_blocks TO authenticated;

-- SECURITY DEFINER: policy `connections` di bawah perlu tahu status blokir
-- LAWAN bicara, tapi RLS di atas hanya membuka baris blokir milik sendiri.
-- Sama polanya dengan `is_discoverable()` di migration 20260927100001.
CREATE OR REPLACE FUNCTION public.is_blocked(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.connection_blocks
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  );
$$;

REVOKE ALL ON FUNCTION public.is_blocked(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- Kaitkan ke `connections`: blokir dua arah mencegah ajakan BARU dari
-- kedua sisi (bukan hanya sisi yang memblokir) — itulah gunanya blokir.
-- DROP + CREATE (bukan ALTER POLICY ... WITH CHECK) supaya seluruh syarat
-- policy tetap terlihat utuh di satu tempat, sama seperti gaya migration
-- lain di repo ini yang mendefinisikan ulang function dengan CREATE OR REPLACE.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS connections_insert_requester ON public.connections;
CREATE POLICY connections_insert_requester ON public.connections
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = (select auth.uid())
    AND status = 'PENDING'
    AND public.is_discoverable(addressee_id)
    AND NOT public.is_blocked(requester_id, addressee_id)
  );

-- Jaga-jaga kondisi balapan: blokir terjadi tepat di antara INSERT ajakan
-- dan UPDATE menerimanya. Tanpa baris ini, penerimaan tetap lolos.
DROP POLICY IF EXISTS connections_accept_addressee ON public.connections;
CREATE POLICY connections_accept_addressee ON public.connections
  FOR UPDATE TO authenticated
  USING (addressee_id = (select auth.uid()) AND status = 'PENDING')
  WITH CHECK (
    addressee_id = (select auth.uid())
    AND status = 'ACCEPTED'
    AND NOT public.is_blocked(requester_id, addressee_id)
  );

-- Memblokir seseorang WAJIB memutus koneksi/ajakan yang sudah ada di
-- antara keduanya — kalau tidak, blokir cuma mencegah ajakan BARU sementara
-- yang lama (mis. sudah ACCEPTED) tetap tampil di kedua sisi.
CREATE OR REPLACE FUNCTION public.sever_connection_on_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.connections
  WHERE (requester_id = NEW.blocker_id AND addressee_id = NEW.blocked_id)
     OR (requester_id = NEW.blocked_id AND addressee_id = NEW.blocker_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sever_connection_on_block() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_connection_blocks_sever
  AFTER INSERT ON public.connection_blocks
  FOR EACH ROW EXECUTE FUNCTION public.sever_connection_on_block();

-- ---------------------------------------------------------------------
-- View untuk menampilkan daftar blokir dengan nama (pola ADR-018/ADR-040:
-- security_invoker = off untuk menembus users_select_own, kolom dibatasi
-- ketat, tanpa email). Hanya baris blokir MILIK PEMANGGIL yang terlihat —
-- dijamin oleh RLS `connection_blocks_select_own` di atas, bukan oleh view.
-- ---------------------------------------------------------------------
-- security_invoker = off (bawaan) BERARTI view ini menembus RLS
-- `connection_blocks` sepenuhnya — filternya HARUS ditulis eksplisit di
-- sini dengan auth.uid(), bukan diserahkan ke RLS tabel dasarnya (yang
-- percuma di sini, pola yang sama dengan `connection_peers`, ADR-040).
-- Tanpa baris `WHERE cb.blocker_id = (select auth.uid())`, SIAPA PUN yang
-- punya GRANT SELECT ke view ini bisa membaca daftar blokir orang lain.
CREATE VIEW public.connection_blocks_with_names AS
SELECT
  cb.blocker_id,
  cb.blocked_id,
  cb.created_at,
  u.full_name AS blocked_full_name
FROM public.connection_blocks cb
JOIN public.users u ON u.id = cb.blocked_id
WHERE cb.blocker_id = (select auth.uid());

REVOKE ALL ON public.connection_blocks_with_names FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.connection_blocks_with_names TO authenticated;

COMMENT ON TABLE public.connection_blocks IS
  'Blokir satu arah antar pengguna (ADR-041). Dicek DUA arah oleh is_blocked() sehingga pihak yang diblokir tidak bisa mengajak balik. Memblokir memutus koneksi/ajakan yang ada (trigger sever_connection_on_block). Jangan tambah kolom ke connection_blocks_with_names — tanpa email, hanya untuk menampilkan nama di daftar blokir milik sendiri.';
