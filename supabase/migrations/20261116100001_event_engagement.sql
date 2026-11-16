-- =====================================================================
-- Interaksi & perawatan postingan kegiatan (ADR-092).
--
--   1. Suka per kegiatan (satu per orang) + komentar dengan balasan satu
--      tingkat. Rel pengaman = Komunitas (ADR-087, pengguna 13+): khusus
--      anggota, semua lewat RPC DEFINER, nama disingkat, kontak pribadi
--      ditolak, tiga pelapor berbeda menyembunyikan otomatis.
--   2. "Lagi ramai": skor interaksi 14 hari yang meluruh (paruh waktu 72 jam),
--      dihitung ulang pg_cron tiap 15 menit ke `event_engagement.trend_score`,
--      diurutkan lewat kolom baru `events_listing.trend_score`.
--      Kembaran TypeScript: src/lib/popularity.ts.
--   3. Bagikan ke koneksi: notifikasi berisi kalimat tetap (bukan pesan
--      bebas — ADR-062 #7 tetap tanpa DM), hanya ke koneksi yang diterima.
--   4. Hapus permanen postingan yang sudah diturunkan (berkas Storage dihapus
--      aplikasi lebih dulu, pola hapus akun ADR-061), tercatat di riwayat.
--   5. `events.registration_mode`: lomba mandiri yang HANYA menerima
--      pendaftaran lewat formulir StudentFo — tautan luar tidak pernah jadi
--      cadangan saat formulir ditutup.
--
-- Hanya CREATE / ADD / CREATE OR REPLACE (dikunci migrations-manifest.test.ts).
-- Kode aman urutan deploy: tanpa objek ini fitur tampil "belum aktif".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Cara mendaftar (lomba mandiri)
-- ---------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN registration_mode VARCHAR(16) NOT NULL DEFAULT 'external'
  CHECK (registration_mode IN ('external', 'studentfo'));

COMMENT ON COLUMN public.events.registration_mode IS
  'ADR-092: studentfo = hanya lewat formulir StudentFo; registration_link tidak pernah ditampilkan/dipakai sebagai cadangan.';

-- ---------------------------------------------------------------------
-- 1. Angka per kegiatan: penghitung + skor "Lagi ramai"
--    Tabel terpisah dari `events`: memperbarui penghitung tidak menyentuh
--    `events.updated_at` (trg_events_touch) dan tidak berebut kunci baris
--    dengan suntingan admin.
-- ---------------------------------------------------------------------
CREATE TABLE public.event_engagement (
  event_id      UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  like_count    INT NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count INT NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  trend_score   DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (trend_score >= 0),
  trend_at      TIMESTAMPTZ
);
CREATE INDEX idx_event_engagement_trend ON public.event_engagement (trend_score DESC) WHERE trend_score > 0;

ALTER TABLE public.event_engagement ENABLE ROW LEVEL SECURITY;
-- Angka publik (tampil di kartu) — hanya untuk kegiatan yang memang tayang,
-- mengikuti visibilitas induknya seperti event_deadlines.
CREATE POLICY event_engagement_public_read ON public.event_engagement
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_engagement.event_id AND e.status IN ('APPROVED', 'EXPIRED')));
REVOKE ALL ON public.event_engagement FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_engagement TO anon, authenticated;
GRANT ALL ON public.event_engagement TO service_role;

-- ---------------------------------------------------------------------
-- 2. Suka
-- ---------------------------------------------------------------------
CREATE TABLE public.event_likes (
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- CASCADE: menghapus akun menghapus jejak sukanya (UU PDP Pasal 8).
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX idx_event_likes_user ON public.event_likes (user_id, created_at DESC);
CREATE INDEX idx_event_likes_recent ON public.event_likes (created_at);

ALTER TABLE public.event_likes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_likes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.event_likes TO service_role;

-- Penghitung. Pengurangan HANYA lewat UPDATE: saat kegiatan dihapus, kaskade
-- bisa menghapus baris penghitung lebih dulu, dan INSERT di sini akan
-- menunjuk kegiatan yang sedang dihapus (pelanggaran FK menggagalkan hapusnya).
CREATE OR REPLACE FUNCTION public.sync_event_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.event_engagement (event_id, like_count) VALUES (NEW.event_id, 1)
    ON CONFLICT (event_id) DO UPDATE SET like_count = public.event_engagement.like_count + 1;
  ELSE
    UPDATE public.event_engagement SET like_count = GREATEST(like_count - 1, 0) WHERE event_id = OLD.event_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_event_like_count
  AFTER INSERT OR DELETE ON public.event_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_like_count();

-- ---------------------------------------------------------------------
-- 3. Komentar (+ balasan satu tingkat)
-- ---------------------------------------------------------------------
CREATE TABLE public.event_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Induk = komentar UTAMA kegiatan yang sama (dicek create_event_comment).
  -- CASCADE: menghapus komentar membawa balasannya.
  parent_id   UUID REFERENCES public.event_comments(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 2 AND 1000),
  hidden_at   TIMESTAMPTZ,
  -- TRUE = disembunyikan otomatis oleh laporan (tampil lagi bila laporannya diabaikan).
  hidden_auto BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_comments_hidden_trail CHECK (NOT hidden_auto OR hidden_at IS NOT NULL),
  CONSTRAINT event_comments_not_own_parent CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX idx_event_comments_event ON public.event_comments (event_id, created_at DESC);
CREATE INDEX idx_event_comments_parent ON public.event_comments (parent_id, created_at) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_event_comments_author ON public.event_comments (author_id, created_at DESC);
CREATE INDEX idx_event_comments_recent ON public.event_comments (created_at);

ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_comments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.event_comments TO service_role;

-- Penghitung kartu = komentar yang benar-benar tampil: tidak disembunyikan,
-- dan balasan hanya bila utamanya juga tampil (menyembunyikan utama ikut
-- menyembunyikan seluruh utasnya). DIHITUNG ULANG, bukan ±1: selisih per
-- baris tidak bisa tahu berapa balasan yang ikut lenyap saat utamanya
-- disembunyikan/dihapus berantai. Baris penghitung dikunci DULU — di READ
-- COMMITTED hitungan sesudah kunci melihat komentar transaksi lain yang
-- sudah commit, jadi dua komentar bersamaan tidak saling menimpa. Jalur
-- hapus hanya UPDATE (lihat catatan FK di sync_event_like_count).
CREATE OR REPLACE FUNCTION public.sync_event_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target  UUID;
  visible INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target := OLD.event_id;
  ELSE
    target := NEW.event_id;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.event_engagement (event_id) VALUES (target) ON CONFLICT (event_id) DO NOTHING;
  END IF;
  PERFORM 1 FROM public.event_engagement WHERE event_id = target FOR UPDATE;

  SELECT count(*) INTO visible
  FROM public.event_comments c
  LEFT JOIN public.event_comments parent ON parent.id = c.parent_id
  WHERE c.event_id = target
    AND c.hidden_at IS NULL
    AND (c.parent_id IS NULL OR parent.hidden_at IS NULL);

  UPDATE public.event_engagement SET comment_count = visible WHERE event_id = target;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_event_comment_count
  AFTER INSERT OR DELETE OR UPDATE OF hidden_at ON public.event_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_comment_count();

CREATE TABLE public.event_comment_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL: laporan tetap berguna sebagai arsip walau pelapor menghapus akun.
  reporter_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Tanpa FK: komentar bisa dihapus penulisnya, laporannya tidak boleh ikut hilang.
  comment_id      UUID NOT NULL,
  event_id        UUID REFERENCES public.events(id) ON DELETE SET NULL,
  author_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Isi saat dilaporkan: bukti tetap ada walau penulis menghapusnya.
  snapshot        TEXT NOT NULL CHECK (char_length(snapshot) <= 1000),
  reason          TEXT NOT NULL CHECK (reason IN ('scam', 'misleading', 'inappropriate', 'harassment', 'spam', 'impersonation', 'other')),
  details         TEXT CHECK (char_length(details) <= 1000),
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
  resolution_note TEXT CHECK (char_length(resolution_note) <= 500),
  reviewed_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_comment_reports_review_trail CHECK ((status = 'OPEN') = (reviewed_at IS NULL))
);
CREATE UNIQUE INDEX event_comment_reports_one_open ON public.event_comment_reports (reporter_id, comment_id) WHERE status = 'OPEN';
CREATE INDEX idx_event_comment_reports_queue ON public.event_comment_reports (status, created_at);
CREATE INDEX idx_event_comment_reports_comment ON public.event_comment_reports (comment_id) WHERE status = 'OPEN';

ALTER TABLE public.event_comment_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_comment_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.event_comment_reports TO service_role;

-- Jendela "Lagi ramai" memindai menurut waktu lintas kegiatan.
CREATE INDEX IF NOT EXISTS idx_saved_events_recent ON public.saved_events (saved_at);
CREATE INDEX IF NOT EXISTS idx_event_registrations_recent ON public.event_registrations (created_at);

COMMENT ON TABLE public.event_comments IS 'Komentar kegiatan (ADR-092): tanpa policy — baca/tulis hanya lewat RPC DEFINER.';

-- ---------------------------------------------------------------------
-- 4. Membaca
-- ---------------------------------------------------------------------

-- Angka & keadaan suka untuk halaman detail. Tamu: liked = false.
-- Jumlah komentar = yang benar-benar tampil (tidak disembunyikan, penulis aktif).
CREATE OR REPLACE FUNCTION public.event_engagement_state(p_event UUID)
RETURNS TABLE (like_count INT, comment_count INT, liked BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT g.like_count FROM public.event_engagement g WHERE g.event_id = e.id), 0),
         (SELECT count(*)::int FROM public.event_comments c
          JOIN public.users u ON u.id = c.author_id AND u.suspended_at IS NULL
          LEFT JOIN public.event_comments parent ON parent.id = c.parent_id
          LEFT JOIN public.users pu ON pu.id = parent.author_id
          WHERE c.event_id = e.id AND c.hidden_at IS NULL
            AND (c.parent_id IS NULL OR (parent.hidden_at IS NULL AND pu.suspended_at IS NULL))),
         (select auth.uid()) IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.event_likes l WHERE l.event_id = e.id AND l.user_id = (select auth.uid()))
  FROM public.events e
  WHERE e.id = p_event AND e.status IN ('APPROVED', 'EXPIRED');
$$;

-- Komentar sebuah kegiatan: komentar utama terbaru (maks. p_limit) + semua
-- balasannya (maks. 400). Khusus anggota; tamu mendapat himpunan kosong.
-- `author_role`: 'team' = akun admin StudentFo, 'organizer' = pengelola
-- terverifikasi kegiatan itu.
CREATE OR REPLACE FUNCTION public.list_event_comments(p_event UUID, p_limit INT DEFAULT 100)
RETURNS TABLE (
  id               UUID,
  parent_id        UUID,
  body             TEXT,
  author_name      TEXT,
  author_username  TEXT,
  author_avatar_id UUID,
  author_role      TEXT,
  is_mine          BOOLEAN,
  created_at       TIMESTAMPTZ,
  more_threads     BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH viewer AS (
    SELECT (select auth.uid()) AS uid
  ),
  visible AS (
    SELECT c.*
    FROM public.event_comments c
    JOIN public.users u ON u.id = c.author_id AND u.suspended_at IS NULL
    JOIN public.events e ON e.id = c.event_id AND e.status IN ('APPROVED', 'EXPIRED')
    CROSS JOIN viewer v
    WHERE v.uid IS NOT NULL
      AND c.event_id = p_event
      AND c.hidden_at IS NULL
      AND NOT public.is_blocked(v.uid, c.author_id)
  ),
  threads AS (
    SELECT t.id FROM visible t
    WHERE t.parent_id IS NULL
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100) + 1
  ),
  shown_threads AS (
    SELECT t.id FROM visible t
    WHERE t.parent_id IS NULL
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100)
  ),
  picked AS (
    SELECT t.* FROM visible t WHERE t.id IN (SELECT id FROM shown_threads)
    UNION ALL
    (SELECT r.* FROM visible r
     WHERE r.parent_id IN (SELECT id FROM shown_threads)
     ORDER BY r.created_at, r.id
     LIMIT 400)
  )
  SELECT r.id, r.parent_id, r.body,
         public.community_display_name(u.full_name),
         CASE WHEN public.can_view_profile(u.id) THEN u.username::text END,
         CASE WHEN public.can_view_profile(u.id) THEN u.avatar_id END,
         CASE
           WHEN u.role = 'ADMIN' THEN 'team'
           WHEN EXISTS (
             SELECT 1 FROM public.event_managers m
             JOIN public.organizer_profiles o ON o.user_id = m.user_id AND o.status = 'VERIFIED'
             WHERE m.event_id = r.event_id AND m.user_id = r.author_id
           ) THEN 'organizer'
         END,
         r.author_id = (select auth.uid()),
         r.created_at,
         (SELECT count(*) FROM threads) > (SELECT count(*) FROM shown_threads)
  FROM picked r
  JOIN public.users u ON u.id = r.author_id;
$$;

-- Komentar milik sendiri (ekspor data akun). Termasuk yang disembunyikan moderator.
CREATE OR REPLACE FUNCTION public.my_event_comments()
RETURNS TABLE (id UUID, event_slug TEXT, event_title TEXT, body TEXT, is_reply BOOLEAN, hidden BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, e.slug::text, e.title::text, c.body, c.parent_id IS NOT NULL, c.hidden_at IS NOT NULL, c.created_at
  FROM public.event_comments c
  LEFT JOIN public.events e ON e.id = c.event_id
  WHERE c.author_id = (select auth.uid())
  ORDER BY c.created_at DESC
  LIMIT 2000;
$$;

-- Suka milik sendiri (ekspor data akun, UU PDP Pasal 7). Tabelnya tertutup
-- untuk klien, jadi pemilik membacanya lewat sini.
CREATE OR REPLACE FUNCTION public.my_event_likes()
RETURNS TABLE (event_slug TEXT, event_title TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.slug::text, e.title::text, l.created_at
  FROM public.event_likes l
  LEFT JOIN public.events e ON e.id = l.event_id
  WHERE l.user_id = (select auth.uid())
  ORDER BY l.created_at DESC
  LIMIT 2000;
$$;

-- ---------------------------------------------------------------------
-- 5. Menulis
-- ---------------------------------------------------------------------

-- Suka/batal suka. Mengembalikan keadaan sesudahnya + jumlah terbaru.
CREATE OR REPLACE FUNCTION public.toggle_event_like(p_event UUID)
RETURNS TABLE (liked BOOLEAN, like_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid     UUID := public.community_writer();
  removed INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event AND status IN ('APPROVED', 'EXPIRED')) THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.event_likes WHERE event_id = p_event AND user_id = uid;
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed = 0 THEN
    -- Kuota hanya untuk MENYUKAI: membatalkan tidak pernah ditolak.
    IF NOT public.consume_rate_limit('event-like:' || uid::text, 300, 86400) THEN
      RAISE EXCEPTION 'like_rate_limited' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.event_likes (event_id, user_id) VALUES (p_event, uid) ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT removed = 0,
         COALESCE((SELECT g.like_count FROM public.event_engagement g WHERE g.event_id = p_event), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_event_comment(p_event UUID, p_body TEXT, p_parent UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid     UUID := public.community_writer();
  parent  public.event_comments%ROWTYPE;
  target  public.events%ROWTYPE;
  comment UUID;
BEGIN
  -- Seperti tanya jawab: kegiatan yang sudah tutup tetap terbaca, tidak menerima komentar baru.
  SELECT * INTO target FROM public.events WHERE id = p_event AND status = 'APPROVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_event_unavailable' USING ERRCODE = 'P0002';
  END IF;
  IF char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 2 AND 1000 THEN
    RAISE EXCEPTION 'invalid_event_comment' USING ERRCODE = '23514';
  END IF;
  IF public.community_has_contact(p_body) THEN
    RAISE EXCEPTION 'community_contact_blocked' USING ERRCODE = '23514';
  END IF;
  IF p_parent IS NOT NULL THEN
    SELECT * INTO parent FROM public.event_comments
    WHERE id = p_parent AND event_id = p_event AND parent_id IS NULL AND hidden_at IS NULL;
    -- Tidak ada, balasan (bukan komentar utama), disembunyikan, penulis ditangguhkan, atau saling blokir = jawaban sama.
    IF NOT FOUND OR NOT public.community_author_visible(parent.author_id) THEN
      RAISE EXCEPTION 'event_comment_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  -- Komentar tampil ke semua anggota: akun yang dibajak tidak boleh membanjiri halaman kegiatan.
  IF NOT public.consume_rate_limit('event-comment:' || uid::text, 30, 86400) THEN
    RAISE EXCEPTION 'comment_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.event_comments (event_id, author_id, parent_id, body)
  VALUES (p_event, uid, p_parent, btrim(p_body))
  RETURNING id INTO comment;

  -- Satu notifikasi per (penerima, kegiatan) yang diperbarui — bukan satu per balasan.
  IF p_parent IS NOT NULL AND parent.author_id <> uid THEN
    INSERT INTO public.notifications (user_id, event_id, type, message)
    VALUES (parent.author_id, p_event, 'EVENT_COMMENT_REPLY',
            format('Ada balasan untuk komentarmu di "%s".', left(target.title, 100)))
    ON CONFLICT (user_id, event_id, type) WHERE event_id IS NOT NULL
    DO UPDATE SET message = EXCLUDED.message, is_read = false, sent_at = now();
  END IF;
  RETURN comment;
END;
$$;

-- Penulis menghapus komentarnya sendiri (balasannya ikut, CASCADE). Mengembalikan id kegiatannya.
CREATE OR REPLACE FUNCTION public.delete_event_comment(p_comment UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target UUID;
BEGIN
  DELETE FROM public.event_comments WHERE id = p_comment AND author_id = auth.uid() RETURNING event_id INTO target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_comment_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN target;
END;
$$;

-- Bagikan ke koneksi: kalimat tetap (tanpa pesan bebas), hanya ke koneksi
-- yang DITERIMA dan tidak saling blokir. Mengembalikan jumlah penerima.
CREATE OR REPLACE FUNCTION public.share_event_with_connections(p_event UUID, p_recipients UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid    UUID := public.community_writer();
  target public.events%ROWTYPE;
  sharer TEXT;
  sent   INT;
BEGIN
  SELECT * INTO target FROM public.events WHERE id = p_event AND status = 'APPROVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'P0002';
  END IF;
  IF p_recipients IS NULL OR cardinality(p_recipients) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'invalid_share' USING ERRCODE = '23514';
  END IF;
  IF NOT public.consume_rate_limit('event-share:' || uid::text, 20, 86400) THEN
    RAISE EXCEPTION 'share_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  SELECT public.community_display_name(full_name) INTO sharer FROM public.users WHERE id = uid;

  INSERT INTO public.notifications (user_id, event_id, type, message)
  SELECT DISTINCT r, p_event, 'EVENT_SHARED',
         format('%s membagikan "%s" kepadamu.', sharer, left(target.title, 100))
  FROM unnest(p_recipients) AS r
  JOIN public.users ru ON ru.id = r AND ru.suspended_at IS NULL
  WHERE r <> uid
    AND NOT public.is_blocked(uid, r)
    AND EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.status = 'ACCEPTED'
        AND ((c.requester_id = uid AND c.addressee_id = r) OR (c.requester_id = r AND c.addressee_id = uid))
    )
  ON CONFLICT (user_id, event_id, type) WHERE event_id IS NOT NULL
  DO UPDATE SET message = EXCLUDED.message, is_read = false, sent_at = now();
  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;

-- Lomba mandiri: pengelola terverifikasi acara itu atau admin (aal2) mengatur cara mendaftar.
CREATE OR REPLACE FUNCTION public.set_event_registration_mode(p_event UUID, p_mode TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('external', 'studentfo') THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '23514';
  END IF;
  IF NOT (public.manages_event(p_event) OR public.is_admin()) THEN
    RAISE EXCEPTION 'not_event_manager' USING ERRCODE = '42501';
  END IF;
  UPDATE public.events SET registration_mode = p_mode WHERE id = p_event;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 6. Laporan & moderasi komentar (pola admin_*_community_report, ADR-087)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.report_event_comment(p_comment UUID, p_reason TEXT, p_details TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid       UUID := public.community_writer();
  target    public.event_comments%ROWTYPE;
  reporters INT;
BEGIN
  SELECT c.* INTO target FROM public.event_comments c
  JOIN public.events e ON e.id = c.event_id AND e.status IN ('APPROVED', 'EXPIRED')
  WHERE c.id = p_comment AND c.hidden_at IS NULL;
  -- Tidak ada, milik sendiri, atau tidak boleh dibaca = jawaban sama.
  IF NOT FOUND OR target.author_id = uid OR NOT public.community_author_visible(target.author_id) THEN
    RAISE EXCEPTION 'report_unavailable' USING ERRCODE = 'P0002';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('scam', 'misleading', 'inappropriate', 'harassment', 'spam', 'impersonation', 'other') THEN
    RAISE EXCEPTION 'invalid_report' USING ERRCODE = '23514';
  END IF;
  -- Kuota yang SAMA dengan laporan lain: tidak ada jalur kedua untuk membanjiri antrean.
  IF NOT public.consume_rate_limit('report:' || uid::text, 10, 86400) THEN
    RAISE EXCEPTION 'report_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('event-comment-report:' || p_comment::text, 0));
  INSERT INTO public.event_comment_reports (reporter_id, comment_id, event_id, author_id, snapshot, reason, details)
  VALUES (uid, p_comment, target.event_id, target.author_id, left(target.body, 1000), p_reason,
          NULLIF(left(btrim(COALESCE(p_details, '')), 1000), ''))
  ON CONFLICT (reporter_id, comment_id) WHERE status = 'OPEN' DO NOTHING;

  SELECT count(DISTINCT reporter_id) INTO reporters
  FROM public.event_comment_reports WHERE comment_id = p_comment AND status = 'OPEN';
  IF reporters >= 3 THEN
    UPDATE public.event_comments SET hidden_at = now(), hidden_auto = true WHERE id = p_comment AND hidden_at IS NULL;
  END IF;
END;
$$;

-- Antrean: satu baris per KOMENTAR berlaporan terbuka. Rute admin (service_role) setelah checkAdminAccess().
CREATE OR REPLACE FUNCTION public.admin_event_comment_report_queue(p_limit INT DEFAULT 50)
RETURNS TABLE (
  report_id    UUID,
  comment_id   UUID,
  event_slug   TEXT,
  event_title  TEXT,
  author_id    UUID,
  author_name  TEXT,
  snapshot     TEXT,
  reasons      TEXT[],
  details      TEXT,
  report_count INT,
  hidden       BOOLEAN,
  hidden_auto  BOOLEAN,
  still_exists BOOLEAN,
  first_at     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH grouped AS (
    SELECT r.comment_id,
           (array_agg(r.id ORDER BY r.created_at))[1] AS report_id,
           (array_agg(r.event_id ORDER BY r.created_at DESC))[1] AS event_id,
           (array_agg(r.author_id ORDER BY r.created_at DESC))[1] AS author_id,
           (array_agg(r.snapshot ORDER BY r.created_at DESC))[1] AS snapshot,
           array_agg(DISTINCT r.reason ORDER BY r.reason) AS reasons,
           (array_agg(r.details ORDER BY r.created_at DESC) FILTER (WHERE r.details IS NOT NULL))[1] AS details,
           count(*)::int AS report_count,
           min(r.created_at) AS first_at
    FROM public.event_comment_reports r
    WHERE r.status = 'OPEN'
    GROUP BY r.comment_id
  )
  SELECT g.report_id, g.comment_id, e.slug::text, e.title::text, g.author_id, au.full_name::text,
         g.snapshot, g.reasons, g.details, g.report_count,
         c.hidden_at IS NOT NULL, COALESCE(c.hidden_auto, false), c.id IS NOT NULL, g.first_at
  FROM grouped g
  LEFT JOIN public.event_comments c ON c.id = g.comment_id
  LEFT JOIN public.events e ON e.id = g.event_id
  LEFT JOIN public.users au ON au.id = g.author_id
  ORDER BY g.first_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_event_comment_report(p_report UUID, p_actor UUID, p_outcome TEXT, p_hide BOOLEAN, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  report public.event_comment_reports%ROWTYPE;
  note   TEXT := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
  closed UUID[];
BEGIN
  SELECT * INTO report FROM public.event_comment_reports WHERE id = p_report AND status = 'OPEN' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('RESOLVED', 'DISMISSED') THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '23514';
  END IF;

  IF p_outcome = 'RESOLVED' AND COALESCE(p_hide, false) THEN
    UPDATE public.event_comments SET hidden_at = COALESCE(hidden_at, now()), hidden_auto = false WHERE id = report.comment_id;
  ELSIF p_outcome = 'DISMISSED' THEN
    -- Tidak melanggar: yang tersembunyi OTOMATIS tampil lagi; keputusan moderator tidak disentuh.
    UPDATE public.event_comments SET hidden_at = NULL, hidden_auto = false WHERE id = report.comment_id AND hidden_auto;
  END IF;

  WITH done AS (
    UPDATE public.event_comment_reports
    SET status = p_outcome, resolution_note = note, reviewed_by = p_actor, reviewed_at = now()
    WHERE comment_id = report.comment_id AND status = 'OPEN'
    RETURNING id
  )
  SELECT array_agg(id) INTO closed FROM done;

  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES ('report', report.id,
          left(format('Laporan komentar kegiatan (%s)%s', report.reason,
                      CASE WHEN p_outcome = 'RESOLVED' AND COALESCE(p_hide, false) THEN ' — disembunyikan' ELSE '' END), 300),
          'OPEN', p_outcome, p_actor, note);

  INSERT INTO public.notifications (user_id, type, message)
  SELECT DISTINCT r.reporter_id,
         CASE p_outcome WHEN 'RESOLVED' THEN 'REPORT_RESOLVED' ELSE 'REPORT_DISMISSED' END,
         CASE p_outcome
           WHEN 'RESOLVED' THEN 'Terima kasih. Laporanmu tentang sebuah komentar kegiatan sudah ditindaklanjuti moderator. Demi privasi semua pihak, rincian tindakannya tidak kami bagikan.'
           ELSE 'Laporanmu tentang sebuah komentar kegiatan sudah ditinjau moderator dan belum ditemukan pelanggaran Syarat & Ketentuan. Punya bukti tambahan? Kirim laporan baru.'
         END
  FROM public.event_comment_reports r
  WHERE r.id = ANY (closed) AND r.reporter_id IS NOT NULL;
END;
$$;

-- Moderator menyembunyikan komentar langsung dari halaman kegiatan (tanpa menunggu laporan). Final.
CREATE OR REPLACE FUNCTION public.admin_hide_event_comment(p_comment UUID, p_actor UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.event_comments%ROWTYPE;
BEGIN
  UPDATE public.event_comments SET hidden_at = now(), hidden_auto = false
  WHERE id = p_comment AND hidden_at IS NULL
  RETURNING * INTO target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_comment_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Laporan terbuka atas komentar ini terjawab oleh tindakan yang sama.
  UPDATE public.event_comment_reports
  SET status = 'RESOLVED', reviewed_by = p_actor, reviewed_at = now(), resolution_note = NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '')
  WHERE comment_id = p_comment AND status = 'OPEN';
  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES ('report', p_comment, left(format('Komentar kegiatan disembunyikan: %s', left(target.body, 80)), 300),
          'OPEN', 'RESOLVED', p_actor, NULLIF(left(btrim(COALESCE(p_reason, '')), 500), ''));
END;
$$;

-- ---------------------------------------------------------------------
-- 7. Hapus permanen postingan (ADR-092 #1)
--    Dua tahap: diturunkan dulu (status REJECTED, bisa dikembalikan), baru
--    boleh dihapus permanen. Pendaftar aktif = ditolak: data & uang peserta
--    harus diselesaikan dulu, bukan ikut lenyap.
-- ---------------------------------------------------------------------

-- Berkas yang harus dihapus aplikasi SEBELUM barisnya (Supabase menolak
-- DELETE langsung di storage.objects; setelah baris hilang path-nya tak
-- terlacak). Sekaligus gerbang kelayakan — gagal di sini = tidak ada yang dihapus.
CREATE OR REPLACE FUNCTION public.event_deletion_files(p_event UUID)
RETURNS TABLE (bucket TEXT, path TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.events%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.events WHERE id = p_event;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF target.status <> 'REJECTED' THEN
    RAISE EXCEPTION 'event_not_taken_down' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_registrations r WHERE r.event_id = p_event AND r.status NOT IN ('CANCELLED', 'REJECTED')) THEN
    RAISE EXCEPTION 'event_has_registrations' USING ERRCODE = '23514';
  END IF;
  RETURN QUERY
  SELECT 'event-photos'::text, p.storage_path FROM public.event_photos p WHERE p.event_id = p_event
  UNION ALL
  SELECT 'payment-proofs'::text, r.proof_path FROM public.event_registrations r WHERE r.event_id = p_event AND r.proof_path IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_event_permanently(p_event UUID, p_actor UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.events%ROWTYPE;
  reason TEXT := NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '');
BEGIN
  SELECT * INTO target FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF target.status <> 'REJECTED' THEN
    RAISE EXCEPTION 'event_not_taken_down' USING ERRCODE = '23514';
  END IF;
  IF reason IS NULL OR char_length(reason) < 5 THEN
    RAISE EXCEPTION 'deletion_reason_required' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_registrations r WHERE r.event_id = p_event AND r.status NOT IN ('CANCELLED', 'REJECTED')) THEN
    RAISE EXCEPTION 'event_has_registrations' USING ERRCODE = '23514';
  END IF;

  -- Log ditulis SEBELUM barisnya hilang (subjek tanpa FK — riwayat bertahan).
  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES ('event', p_event, left(target.title, 300), 'REJECTED', 'DELETED', p_actor, reason);
  DELETE FROM public.events WHERE id = p_event;
END;
$$;

-- ---------------------------------------------------------------------
-- 8. "Lagi ramai" — kembaran src/lib/popularity.ts
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_event_trends()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  since   TIMESTAMPTZ := now() - interval '14 days';
  scored  INT;
BEGIN
  WITH open_events AS (
    SELECT e.id
    FROM public.events e
    LEFT JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
    WHERE e.status = 'APPROVED' AND (d.deadline_at IS NULL OR d.deadline_at >= now())
  ),
  signals (event_id, weight, at) AS (
    SELECT l.event_id, 1.0::float8, l.created_at
    FROM public.event_likes l
    JOIN public.users u ON u.id = l.user_id AND u.suspended_at IS NULL
    WHERE l.created_at > since
    UNION ALL
    -- Sekali per orang per kegiatan: banjir komentar satu akun tidak menaikkan skor.
    SELECT c.event_id, 2.0::float8, max(c.created_at)
    FROM public.event_comments c
    JOIN public.users u ON u.id = c.author_id AND u.suspended_at IS NULL
    WHERE c.created_at > since AND c.hidden_at IS NULL
    GROUP BY c.event_id, c.author_id
    UNION ALL
    SELECT s.event_id, 3.0::float8, s.saved_at
    FROM public.saved_events s
    WHERE s.saved_at > since
    UNION ALL
    SELECT r.event_id, 4.0::float8, max(r.created_at)
    FROM public.recommendation_signals r
    WHERE r.kind = 'register_click' AND r.user_id IS NOT NULL AND r.created_at > since
    GROUP BY r.event_id, r.user_id
    UNION ALL
    SELECT g.event_id, 6.0::float8, g.created_at
    FROM public.event_registrations g
    WHERE g.status NOT IN ('CANCELLED', 'REJECTED') AND g.created_at > since
    UNION ALL
    -- Pengunjung unik per hari WIB, "terjadi" tengah hari WIB (jakartaNoonOf).
    SELECT v.event_id, 0.25::float8 * v.visitors, (v.day::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Jakarta'
    FROM public.event_daily_stats v
    WHERE v.visitors > 0 AND (v.day::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Jakarta' > since
  ),
  totals AS (
    SELECT s.event_id,
           sum(s.weight * power(2::float8, -GREATEST(extract(epoch FROM now() - s.at)::float8 / 3600.0, 0) / 72.0)) AS score
    FROM signals s
    JOIN open_events o ON o.id = s.event_id
    GROUP BY s.event_id
  ),
  upserted AS (
    INSERT INTO public.event_engagement (event_id, trend_score, trend_at)
    SELECT event_id, score, now() FROM totals
    ON CONFLICT (event_id) DO UPDATE SET trend_score = EXCLUDED.trend_score, trend_at = EXCLUDED.trend_at
    RETURNING event_id
  ),
  -- Yang tak lagi bersinyal / sudah tutup turun ke nol. Himpunan barisnya
  -- terpisah dari `upserted` (NOT IN totals), jadi satu pernyataan aman.
  zeroed AS (
    UPDATE public.event_engagement g
    SET trend_score = 0, trend_at = now()
    WHERE g.trend_score <> 0 AND g.event_id NOT IN (SELECT event_id FROM totals)
    RETURNING g.event_id
  )
  SELECT count(*) INTO scored FROM upserted;
  RETURN scored;
END;
$$;

COMMENT ON FUNCTION public.refresh_event_trends() IS
  'ADR-092: skor "Lagi ramai" (kembaran src/lib/popularity.ts). Dijadwalkan pg_cron tiap 15 menit; idempoten.';

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     OR coalesce(current_setting('shared_preload_libraries', true), '') NOT LIKE '%pg_cron%'
     OR coalesce(current_setting('cron.database_name', true), 'postgres') <> current_database() THEN
    RAISE NOTICE 'pg_cron tidak tersedia — jadwalkan SELECT public.refresh_event_trends() dari luar.';
    RETURN;
  END IF;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  -- Menit ganjil supaya tidak berebut dengan job lain yang biasanya di :00.
  PERFORM cron.schedule('studentfo-refresh-event-trends', '7,22,37,52 * * * *', 'SELECT public.refresh_event_trends()');
END
$migration$;

-- ---------------------------------------------------------------------
-- 9. events_listing: dua kolom baru DI UJUNG (CREATE OR REPLACE hanya boleh
--    menambah kolom di akhir). Isi lain identik dengan versi 20261003100001.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.events_listing
WITH (security_invoker = on) AS
SELECT
  e.id,
  e.slug,
  e.title,
  e.organizer,
  e.description,
  e.event_type,
  e.registration_link,
  e.source_url,
  e.education_levels,
  e.location,
  e.is_online,
  e.status,
  e.saved_count,
  e.created_at,
  d.deadline_at AS primary_deadline_at,
  d.label       AS primary_deadline_label,
  e.category_slugs,
  e.search_vector,
  e.is_free,
  e.price_amount,
  e.is_featured,
  e.featured_until,
  e.verification_badge,
  e.guidebook_url,
  (
    e.is_featured
    AND e.featured_until > NOW()
    AND e.status = 'APPROVED'
    AND (d.deadline_at IS NULL OR d.deadline_at >= NOW())
  ) AS is_promoted,
  e.registration_mode,
  COALESCE(g.trend_score, 0) AS trend_score
FROM events e
LEFT JOIN event_deadlines d ON d.event_id = e.id AND d.is_primary
LEFT JOIN event_engagement g ON g.event_id = e.id;

-- ---------------------------------------------------------------------
-- 10. approve_submission(): salin cara mendaftar. Isi lain identik dengan
--     versi 20261112100001. Payload bisa ditulis siapa pun lewat PostgREST,
--     jadi `studentfo` hanya dihormati bila pengirimnya penyelenggara
--     terverifikasi atau admin — yang memang bisa menyusun formulirnya.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_submission(p_submission_id UUID, p_reviewer_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  submission   public.ugc_submissions%ROWTYPE;
  p            JSONB;
  new_event_id UUID;
  mode         TEXT := 'external';
BEGIN
  SELECT * INTO submission FROM public.ugc_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR submission.status <> 'PENDING' THEN
    RAISE EXCEPTION 'submission_not_found' USING ERRCODE = 'P0002';
  END IF;
  p := submission.payload;

  IF p ->> 'registration_mode' = 'studentfo' AND submission.submitted_by IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.organizer_profiles WHERE user_id = submission.submitted_by AND status = 'VERIFIED')
       OR EXISTS (SELECT 1 FROM public.users WHERE id = submission.submitted_by AND role = 'ADMIN')
     ) THEN
    mode := 'studentfo';
  END IF;

  INSERT INTO public.events (
    title, organizer, description, event_type, registration_link, source_url,
    education_levels, location, is_online, status, reviewed_by, reviewed_at,
    is_free, price_amount, guidebook_url, video_url, registration_mode
  )
  VALUES (
    btrim(p ->> 'title'),
    btrim(p ->> 'organizer'),
    NULLIF(btrim(p ->> 'description'), ''),
    (p ->> 'event_type')::event_type,
    p ->> 'registration_link',
    COALESCE(NULLIF(p ->> 'source_url', ''), p ->> 'registration_link'),
    ARRAY(
      SELECT value::education_level
      FROM jsonb_array_elements_text(COALESCE(p -> 'education_levels', '[]'::JSONB)) AS value
    ),
    NULLIF(btrim(p ->> 'location'), ''),
    COALESCE((p ->> 'is_online')::BOOLEAN, FALSE),
    'APPROVED',
    p_reviewer_id,
    NOW(),
    (p ->> 'is_free')::BOOLEAN,
    (p ->> 'price_amount')::NUMERIC,
    NULLIF(p ->> 'guidebook_url', ''),
    CASE
      WHEN p ->> 'video_url' ~ '^https://(www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com/[0-9]{6,12})$'
      THEN p ->> 'video_url'
    END,
    mode
  )
  RETURNING id INTO new_event_id;

  INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
  VALUES (new_event_id, 'registration', (p ->> 'deadline_at')::TIMESTAMPTZ, TRUE);

  INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
  SELECT DISTINCT ON (stage ->> 'label') new_event_id, stage ->> 'label', (stage ->> 'deadline_at')::TIMESTAMPTZ, FALSE
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p -> 'stages') = 'array' THEN p -> 'stages' ELSE '[]'::JSONB END) AS stage
  WHERE stage ->> 'label' IN ('submission', 'announcement', 'final')
    AND stage ->> 'deadline_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
  ORDER BY stage ->> 'label', stage ->> 'deadline_at';

  INSERT INTO public.event_categories (event_id, category_id)
  SELECT new_event_id, c.id
  FROM public.categories c
  WHERE c.slug IN (
    SELECT jsonb_array_elements_text(COALESCE(p -> 'category_slugs', '[]'::JSONB))
  );

  IF submission.submitted_by IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organizer_profiles WHERE user_id = submission.submitted_by AND status = 'VERIFIED'
  ) THEN
    INSERT INTO public.event_managers (event_id, user_id, source, granted_by)
    VALUES (new_event_id, submission.submitted_by, 'SUBMISSION', p_reviewer_id)
    ON CONFLICT (event_id, user_id) DO NOTHING;
  END IF;

  IF submission.poster_id IS NOT NULL THEN
    INSERT INTO public.event_photos (id, event_id, storage_path, content_type, width, height, is_poster)
    VALUES (
      submission.poster_id,
      new_event_id,
      public.submission_poster_path(submission.id, submission.poster_id, submission.poster_type),
      submission.poster_type,
      submission.poster_width,
      submission.poster_height,
      TRUE
    );
    UPDATE public.event_photos SET uploaded_by = submission.submitted_by WHERE id = submission.poster_id;
  END IF;

  UPDATE public.ugc_submissions
  SET status = 'APPROVED', reviewed_by = p_reviewer_id, reviewed_at = NOW(),
      poster_id = NULL, poster_type = NULL, poster_width = NULL, poster_height = NULL
  WHERE id = p_submission_id;

  RETURN new_event_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 11. Hak (ADR-020: REVOKE dari anon & authenticated, bukan hanya PUBLIC)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.sync_event_like_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_event_comment_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.event_engagement_state(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_event_comments(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_event_comments() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_event_likes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_event_like(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_event_comment(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_event_comment(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.share_event_with_connections(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_event_registration_mode(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_event_comment(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_event_comment_report_queue(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_resolve_event_comment_report(UUID, UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_hide_event_comment(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.event_deletion_files(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_event_permanently(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_event_trends() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_submission(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Angka suka & komentar juga untuk tamu (bukti sosial); menulis = anggota.
GRANT EXECUTE ON FUNCTION public.event_engagement_state(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_event_comments(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_event_comments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_event_likes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_event_like(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_event_comment(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_comment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_event_with_connections(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_registration_mode(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_event_comment(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_event_comment_report_queue(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_event_comment_report(UUID, UUID, TEXT, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_hide_event_comment(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.event_deletion_files(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_event_permanently(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_event_trends() TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_submission(UUID, UUID) TO service_role;

-- Skor awal supaya urutan "Lagi ramai" langsung bermakna setelah migration.
SELECT public.refresh_event_trends();
