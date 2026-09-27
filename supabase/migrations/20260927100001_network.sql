-- =====================================================================
-- StudentFo — Koneksi antar pengguna (ADR-040)
--
-- Dua tabel baru:
--   * network_profiles — opt-in "bisa ditemukan" + headline. BAWAAN: tidak
--     bisa ditemukan. Tidak ada orang yang muncul di direktori tanpa
--     memilihnya sendiri.
--   * connections      — satu baris per PASANGAN orang (arah dicatat di
--     requester/addressee). Menolak = menghapus baris, jadi tidak ada status
--     "ditolak" yang perlu disembunyikan dari pengirim.
--
-- Yang TIDAK dilakukan: melonggarkan `users_select_own`. Tabel `users`
-- memuat email. Profil orang lain hanya terbaca lewat dua view sempit
-- (security_invoker = off, pola `team_member_profiles` ADR-018) yang
-- kolomnya tetap dan TIDAK memuat email:
--   * network_directory — hanya orang yang memilih bisa ditemukan.
--   * connection_peers  — hanya pihak lawan dari koneksi milik pemanggil.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. network_profiles
-- ---------------------------------------------------------------------
CREATE TABLE public.network_profiles (
  user_id         UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  is_discoverable BOOLEAN NOT NULL DEFAULT FALSE,
  headline        VARCHAR(140)
                  CHECK (headline IS NULL OR char_length(btrim(headline)) BETWEEN 1 AND 140),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_network_profiles_touch
  BEFORE UPDATE ON public.network_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Direktori tanpa saringan diurutkan "paling baru aktif" dan hanya memindai
-- baris yang bisa ditemukan.
CREATE INDEX idx_network_profiles_directory
  ON public.network_profiles (updated_at DESC) WHERE is_discoverable;

ALTER TABLE public.network_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY network_profiles_select_own ON public.network_profiles
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY network_profiles_insert_own ON public.network_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY network_profiles_update_own ON public.network_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Hak per kolom (AGENTS.md §14): cabut hak tabel dulu, baru beri kolomnya.
REVOKE ALL ON public.network_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.network_profiles TO authenticated;
GRANT INSERT (user_id, is_discoverable, headline) ON public.network_profiles TO authenticated;
GRANT UPDATE (is_discoverable, headline) ON public.network_profiles TO authenticated;

-- Policy INSERT `connections` perlu tahu apakah TARGET bisa ditemukan, tapi
-- RLS di atas hanya membuka baris milik sendiri. Fungsi ini menjawab satu
-- bit itu saja — informasi yang sama sudah terbuka lewat network_directory.
CREATE OR REPLACE FUNCTION public.is_discoverable(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.network_profiles WHERE user_id = p_user AND is_discoverable
  );
$$;

REVOKE ALL ON FUNCTION public.is_discoverable(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_discoverable(UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. connections
-- ---------------------------------------------------------------------
-- Status VARCHAR + CHECK, bukan enum: paritasnya hanya dengan
-- CONNECTION_STATUSES di src/types/domain.ts (pipeline tidak menyentuhnya).
CREATE TABLE public.connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status       VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED')),
  message      VARCHAR(280)
               CHECK (message IS NULL OR char_length(btrim(message)) BETWEEN 1 AND 280),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT connections_not_self CHECK (requester_id <> addressee_id),
  CONSTRAINT connections_response_trail CHECK ((status = 'ACCEPTED') = (responded_at IS NOT NULL))
);

-- Satu baris per pasangan, TANPA memandang arah. Tanpa ini A→B dan B→A bisa
-- sama-sama menunggu dan pasangan yang sama tampil dua kali.
CREATE UNIQUE INDEX idx_connections_pair
  ON public.connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
-- "Ajakan masuk" dan "koneksi saya" membaca dari kedua sisi.
CREATE INDEX idx_connections_addressee ON public.connections (addressee_id, status);
CREATE INDEX idx_connections_requester ON public.connections (requester_id, status);

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY connections_select_party ON public.connections
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IN (requester_id, addressee_id));

CREATE POLICY connections_insert_requester ON public.connections
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = (select auth.uid())
    AND status = 'PENDING'
    AND public.is_discoverable(addressee_id)
  );

-- Hanya yang DIAJAK boleh menerima, dan hanya PENDING → ACCEPTED.
CREATE POLICY connections_accept_addressee ON public.connections
  FOR UPDATE TO authenticated
  USING (addressee_id = (select auth.uid()) AND status = 'PENDING')
  WITH CHECK (addressee_id = (select auth.uid()) AND status = 'ACCEPTED');

-- Kedua pihak boleh menghapus: batal (pengirim), tolak (yang diajak), putus (siapa pun).
CREATE POLICY connections_delete_party ON public.connections
  FOR DELETE TO authenticated
  USING ((select auth.uid()) IN (requester_id, addressee_id));

REVOKE ALL ON public.connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.connections TO authenticated;
GRANT INSERT (requester_id, addressee_id, message) ON public.connections TO authenticated;
GRANT UPDATE (status) ON public.connections TO authenticated;

-- BEFORE INSERT: pembatas laju + nilai awal yang tidak bisa dipalsukan.
-- Batasnya dihitung di `rate_limit_hits` (bukan COUNT baris connections):
-- menghitung baris bisa diakali dengan kirim → batalkan → kirim lagi, dan
-- setiap putaran mengirim notifikasi baru ke target.
-- Angka 30/24 jam HARUS sama dengan CONNECTION_RATE_LIMIT di src/lib/network.ts.
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

  IF NOT public.consume_rate_limit('connection:' || NEW.requester_id::text, 30, 86400) THEN
    -- Teks 'connection_rate_limited' dibaca SupabaseEventRepository.requestConnection().
    RAISE EXCEPTION 'connection_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_connection_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_connections_before_insert
  BEFORE INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_connection_insert();

-- BEFORE UPDATE: waktu diterima diisi server, bukan klien.
CREATE OR REPLACE FUNCTION public.stamp_connection_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'ACCEPTED' AND OLD.status <> 'ACCEPTED' THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_connection_response() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_connections_before_update
  BEFORE UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.stamp_connection_response();

-- AFTER: notifikasi in-app (pola ADR-037). DEFINER karena pemanggil tidak
-- boleh menulis `notifications` dan tidak bisa membaca nama pihak lawan.
CREATE OR REPLACE FUNCTION public.notify_connection_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT left(full_name, 120) INTO actor_name FROM public.users WHERE id = NEW.requester_id;
    INSERT INTO public.notifications (user_id, type, message)
    VALUES (NEW.addressee_id, 'CONNECTION_REQUEST',
            format('%s ingin terhubung denganmu.', COALESCE(actor_name, 'Seseorang')));
  ELSIF NEW.status = 'ACCEPTED' AND OLD.status = 'PENDING' THEN
    SELECT left(full_name, 120) INTO actor_name FROM public.users WHERE id = NEW.addressee_id;
    INSERT INTO public.notifications (user_id, type, message)
    VALUES (NEW.requester_id, 'CONNECTION_ACCEPTED',
            format('%s menerima ajakan koneksimu.', COALESCE(actor_name, 'Seseorang')));
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_connection_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_connections_notify
  AFTER INSERT OR UPDATE OF status ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.notify_connection_change();

-- ---------------------------------------------------------------------
-- 3. View profil (security_invoker = off SECARA SADAR, lihat kepala berkas)
--
-- JANGAN tambah kolom ke kedua view ini tanpa membaca ADR-018 & ADR-040:
-- setiap kolom baru langsung terbuka ke semua pengguna yang masuk.
-- ---------------------------------------------------------------------
CREATE VIEW public.network_directory AS
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
WHERE np.is_discoverable;

REVOKE ALL ON public.network_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.network_directory TO authenticated;

COMMENT ON VIEW public.network_directory IS
  'Direktori Cari Koneksi: hanya pengguna yang memilih bisa ditemukan. security_invoker = off untuk menembus users_select_own; tanpa email. Jangan tambah kolom (ADR-040).';

-- Pihak lawan dari koneksi PEMANGGIL (difilter auth.uid() di dalam view).
-- Pihak lawan tetap terbaca walau ia kemudian menyembunyikan diri dari
-- direktori: terhubung = kedua pihak sudah saling setuju.
CREATE VIEW public.connection_peers AS
SELECT
  c.id AS connection_id,
  c.status,
  c.message,
  c.created_at,
  c.responded_at,
  (c.requester_id = me.uid) AS is_outgoing,
  p.id AS peer_id,
  p.full_name,
  np.headline,
  p.education_level,
  p.major,
  p.interests
FROM (SELECT (select auth.uid()) AS uid) me
JOIN public.connections c ON me.uid IN (c.requester_id, c.addressee_id)
JOIN public.users p ON p.id = CASE WHEN c.requester_id = me.uid THEN c.addressee_id ELSE c.requester_id END
LEFT JOIN public.network_profiles np ON np.user_id = p.id;

REVOKE ALL ON public.connection_peers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.connection_peers TO authenticated;

COMMENT ON VIEW public.connection_peers IS
  'Profil pihak lawan dari koneksi milik pemanggil saja. security_invoker = off; tanpa email. Jangan tambah kolom (ADR-040).';

-- ---------------------------------------------------------------------
-- 4. Koneksi bersama — hanya JUMLAH, dan hanya terhadap koneksi pemanggil.
--    Dibatasi 200 kandidat per panggilan (= NETWORK_LIMITS.candidateWindow).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mutual_connection_counts(p_candidates UUID[])
RETURNS TABLE (user_id UUID, mutual_count INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  my_peers AS (
    SELECT CASE WHEN c.requester_id = me.uid THEN c.addressee_id ELSE c.requester_id END AS peer
    FROM public.connections c, me
    WHERE c.status = 'ACCEPTED' AND me.uid IN (c.requester_id, c.addressee_id)
  ),
  candidates AS (
    SELECT DISTINCT unnest(p_candidates[1:200]) AS id
  )
  SELECT cand.id, count(*)::int
  FROM candidates cand
  JOIN public.connections c
    ON c.status = 'ACCEPTED' AND cand.id IN (c.requester_id, c.addressee_id)
  JOIN my_peers mp
    ON mp.peer = CASE WHEN c.requester_id = cand.id THEN c.addressee_id ELSE c.requester_id END
  GROUP BY cand.id;
$$;

REVOKE ALL ON FUNCTION public.mutual_connection_counts(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutual_connection_counts(UUID[]) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Index pendukung
-- ---------------------------------------------------------------------
-- Saran "minat sama": `interests && '{…}'` di network_directory.
CREATE INDEX IF NOT EXISTS idx_users_interests ON public.users USING GIN (interests);
-- Simpul "kegiatan" di peta: keanggotaan tim per ORANG. PK team_members
-- (team_id, user_id) tidak melayani pencarian yang dimulai dari user_id.
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members (user_id);
