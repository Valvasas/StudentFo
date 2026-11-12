-- =====================================================================
-- Komunitas (ADR-087): forum PUBLIK khusus anggota yang dimoderasi.
--
-- Bentuk "berinteraksi satu sama lain" yang konsisten dengan ADR-062 #7
-- (platform 13+, PP 17/2025): setiap percakapan terbuka untuk SEMUA anggota
-- yang masuk — tidak ada pesan pribadi atau grup tertutup antar-orang asing.
--
--   * Tabel tanpa policy: semua akses lewat RPC DEFINER. Nama penulis yang
--     keluar disingkat ("Dinda P."), id akun tidak pernah keluar; username
--     (tautan profil) & foto hanya bila pembaca memang boleh melihat profil
--     itu (`can_view_profile`, ADR-077).
--   * Blokir (dua arah) menyembunyikan tulisan satu sama lain; tulisan akun
--     yang ditangguhkan hilang dari Komunitas.
--   * Nomor HP, email, dan tautan WhatsApp/Telegram/LINE ditolak: kontak
--     pribadi di ruang publik = pintu ke saluran privat yang justru dihindari.
--   * Laporan punya tabel sendiri (cuplikan isi tetap tersimpan walau
--     tulisannya dihapus). Tiga pelapor BERBEDA menyembunyikan tulisan
--     otomatis sampai moderator memutuskan; diabaikan = tampil lagi.
--   * Balasan mengabari penulis postingan lewat lonceng — satu notifikasi per
--     postingan yang diperbarui, bukan satu per balasan.
--
-- Hanya CREATE / ADD / CREATE OR REPLACE: penerapannya tidak meminta
-- konfirmasi "perintah destruktif". Kode aman urutan deploy: tanpa tabel ini
-- halaman Komunitas mengatakan fiturnya belum aktif.
-- =====================================================================

CREATE TABLE public.community_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE: menghapus akun menghapus tulisannya (UU PDP Pasal 8).
  author_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  topic            VARCHAR(16) NOT NULL CHECK (topic IN ('tanya', 'cari-tim', 'info', 'cerita')),
  title            VARCHAR(120) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 6 AND 120),
  body             TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 10 AND 2000),
  event_id         UUID REFERENCES public.events(id) ON DELETE SET NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_at        TIMESTAMPTZ,
  -- TRUE = disembunyikan otomatis oleh laporan (bisa tampil lagi bila laporannya diabaikan).
  hidden_auto      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_posts_hidden_trail CHECK (NOT hidden_auto OR hidden_at IS NOT NULL)
);

-- Lini masa "aktif terbaru" (kursor keyset), per topik, per kegiatan, per penulis.
CREATE INDEX idx_community_posts_feed ON public.community_posts (last_activity_at DESC, id DESC) WHERE hidden_at IS NULL;
CREATE INDEX idx_community_posts_topic ON public.community_posts (topic, last_activity_at DESC, id DESC) WHERE hidden_at IS NULL;
CREATE INDEX idx_community_posts_event ON public.community_posts (event_id, last_activity_at DESC) WHERE event_id IS NOT NULL;
CREATE INDEX idx_community_posts_author ON public.community_posts (author_id, created_at DESC);

CREATE TABLE public.community_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 2 AND 1000),
  hidden_at   TIMESTAMPTZ,
  hidden_auto BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_replies_hidden_trail CHECK (NOT hidden_auto OR hidden_at IS NOT NULL)
);

CREATE INDEX idx_community_replies_post ON public.community_replies (post_id, created_at, id);
CREATE INDEX idx_community_replies_author ON public.community_replies (author_id, created_at DESC);

-- "Bermanfaat": satu tanda per orang per tulisan. Indeks unik = juga indeks hitungannya.
CREATE TABLE public.community_helpful (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id    UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  reply_id   UUID REFERENCES public.community_replies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_helpful_target CHECK ((post_id IS NULL) <> (reply_id IS NULL))
);
CREATE UNIQUE INDEX community_helpful_post ON public.community_helpful (post_id, user_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX community_helpful_reply ON public.community_helpful (reply_id, user_id) WHERE reply_id IS NOT NULL;
CREATE INDEX idx_community_helpful_user ON public.community_helpful (user_id);

CREATE TABLE public.community_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL: laporan tetap berguna sebagai arsip walau pelapor menghapus akun.
  reporter_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  subject_type    TEXT NOT NULL CHECK (subject_type IN ('post', 'reply')),
  -- Tanpa FK: tulisan bisa dihapus penulisnya, laporannya tidak boleh ikut hilang.
  subject_id      UUID NOT NULL,
  -- Untuk tautan ke utasnya selama masih ada.
  post_id         UUID REFERENCES public.community_posts(id) ON DELETE SET NULL,
  author_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Isi saat dilaporkan: bukti tetap ada walau penulis menyuntingnya lewat hapus-tulis-ulang.
  snapshot        TEXT NOT NULL CHECK (char_length(snapshot) <= 2200),
  reason          TEXT NOT NULL CHECK (reason IN ('scam', 'misleading', 'inappropriate', 'harassment', 'spam', 'impersonation', 'other')),
  details         TEXT CHECK (char_length(details) <= 1000),
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
  resolution_note TEXT CHECK (char_length(resolution_note) <= 500),
  reviewed_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_reports_review_trail CHECK ((status = 'OPEN') = (reviewed_at IS NULL))
);

-- Satu laporan TERBUKA per (pelapor, tulisan): klik berulang tidak menumpuk antrean.
CREATE UNIQUE INDEX community_reports_one_open ON public.community_reports (reporter_id, subject_type, subject_id) WHERE status = 'OPEN';
CREATE INDEX idx_community_reports_queue ON public.community_reports (status, created_at);
CREATE INDEX idx_community_reports_subject ON public.community_reports (subject_type, subject_id) WHERE status = 'OPEN';

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_helpful ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_posts, public.community_replies, public.community_helpful, public.community_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.community_posts, public.community_replies, public.community_helpful, public.community_reports TO service_role;

-- Notifikasi balasan menunjuk postingannya; satu baris per (penerima, postingan).
-- Hak SELECT notifikasi per TABEL (policy pemilik), jadi kolom ini ikut terbaca pemiliknya.
ALTER TABLE public.notifications
  ADD COLUMN community_post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_notifications_community_dedupe
  ON public.notifications (user_id, community_post_id, type) WHERE community_post_id IS NOT NULL;

COMMENT ON TABLE public.community_posts IS 'Komunitas (ADR-087): tanpa policy — baca/tulis hanya lewat RPC DEFINER.';

-- ---------------------------------------------------------------------
-- Pembantu
-- ---------------------------------------------------------------------

-- "Dinda Pratiwi" → "Dinda P."; satu kata tetap utuh; kosong → "Anggota".
-- Cermin: communityDisplayName() di src/lib/community.ts.
CREATE OR REPLACE FUNCTION public.community_display_name(p_full_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN n = '' THEN 'Anggota'
    WHEN position(' ' IN n) = 0 THEN left(n, 40)
    ELSE left(split_part(n, ' ', 1), 40) || ' ' || upper(left(regexp_replace(n, '^.* ', ''), 1)) || '.'
  END
  FROM (SELECT regexp_replace(btrim(COALESCE(p_full_name, '')), '\s+', ' ', 'g') AS n) AS name;
$$;

-- Kontak pribadi di teks publik. Cermin: CONTACT_PATTERNS di src/lib/community.ts
-- (contoh yang sama diuji di kedua sisi).
CREATE OR REPLACE FUNCTION public.community_has_contact(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(p_text, '') ~* '(\+62|62|0)[ .-]?8[1-9]([ .-]?[0-9]){7,11}'
      OR COALESCE(p_text, '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      OR COALESCE(p_text, '') ~* '(wa\.me|chat\.whatsapp\.com|t\.me|line\.me)/';
$$;

-- Penulis yang tulisannya boleh dibaca pembaca ini: tidak ditangguhkan, tidak saling blokir.
CREATE OR REPLACE FUNCTION public.community_author_visible(p_author UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_author AND u.suspended_at IS NULL)
     AND NOT public.is_blocked((select auth.uid()), p_author);
$$;

-- Pemanggil yang boleh menulis: masuk dan tidak ditangguhkan.
CREATE OR REPLACE FUNCTION public.community_writer()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR EXISTS (SELECT 1 FROM public.users WHERE id = uid AND suspended_at IS NOT NULL) THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE = '42501';
  END IF;
  RETURN uid;
END;
$$;

-- ---------------------------------------------------------------------
-- Membaca
-- ---------------------------------------------------------------------

-- Lini masa (maks. 50), kursor keyset (last_activity_at, id). Tamu: kosong.
CREATE OR REPLACE FUNCTION public.list_community_posts(
  p_topic     TEXT DEFAULT NULL,
  p_event     UUID DEFAULT NULL,
  p_before_at TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL,
  p_limit     INT DEFAULT 20
)
RETURNS TABLE (
  id               UUID,
  topic            TEXT,
  title            TEXT,
  excerpt          TEXT,
  event_slug       TEXT,
  event_title      TEXT,
  author_name      TEXT,
  author_username  TEXT,
  author_avatar_id UUID,
  is_mine          BOOLEAN,
  reply_count      INT,
  helpful_count    INT,
  helped           BOOLEAN,
  created_at       TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.topic::text, p.title::text, left(p.body, 240),
         e.slug::text, e.title::text,
         public.community_display_name(u.full_name),
         CASE WHEN public.can_view_profile(u.id) THEN u.username::text END,
         CASE WHEN public.can_view_profile(u.id) THEN u.avatar_id END,
         p.author_id = (select auth.uid()),
         (SELECT count(*)::int FROM public.community_replies r
          JOIN public.users ru ON ru.id = r.author_id AND ru.suspended_at IS NULL
          WHERE r.post_id = p.id AND r.hidden_at IS NULL),
         (SELECT count(*)::int FROM public.community_helpful h WHERE h.post_id = p.id),
         EXISTS (SELECT 1 FROM public.community_helpful h WHERE h.post_id = p.id AND h.user_id = (select auth.uid())),
         p.created_at, p.last_activity_at
  FROM public.community_posts p
  JOIN public.users u ON u.id = p.author_id AND u.suspended_at IS NULL
  LEFT JOIN public.events e ON e.id = p.event_id AND e.status IN ('APPROVED', 'EXPIRED')
  WHERE (select auth.uid()) IS NOT NULL
    AND p.hidden_at IS NULL
    AND NOT public.is_blocked((select auth.uid()), p.author_id)
    AND (p_topic IS NULL OR p.topic = p_topic)
    AND (p_event IS NULL OR p.event_id = p_event)
    AND (
      p_before_at IS NULL
      OR (p.last_activity_at, p.id) < (p_before_at, COALESCE(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    )
  ORDER BY p.last_activity_at DESC, p.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.get_community_post(p_post UUID)
RETURNS TABLE (
  id               UUID,
  topic            TEXT,
  title            TEXT,
  body             TEXT,
  event_slug       TEXT,
  event_title      TEXT,
  author_name      TEXT,
  author_username  TEXT,
  author_avatar_id UUID,
  is_mine          BOOLEAN,
  helpful_count    INT,
  helped           BOOLEAN,
  created_at       TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.topic::text, p.title::text, p.body,
         e.slug::text, e.title::text,
         public.community_display_name(u.full_name),
         CASE WHEN public.can_view_profile(u.id) THEN u.username::text END,
         CASE WHEN public.can_view_profile(u.id) THEN u.avatar_id END,
         p.author_id = (select auth.uid()),
         (SELECT count(*)::int FROM public.community_helpful h WHERE h.post_id = p.id),
         EXISTS (SELECT 1 FROM public.community_helpful h WHERE h.post_id = p.id AND h.user_id = (select auth.uid())),
         p.created_at, p.last_activity_at
  FROM public.community_posts p
  JOIN public.users u ON u.id = p.author_id AND u.suspended_at IS NULL
  LEFT JOIN public.events e ON e.id = p.event_id AND e.status IN ('APPROVED', 'EXPIRED')
  WHERE (select auth.uid()) IS NOT NULL
    AND p.id = p_post
    AND p.hidden_at IS NULL
    AND NOT public.is_blocked((select auth.uid()), p.author_id);
$$;

-- Balasan sebuah utas yang boleh dibaca (maks. 300, urut lama → baru).
CREATE OR REPLACE FUNCTION public.list_community_replies(p_post UUID, p_limit INT DEFAULT 300)
RETURNS TABLE (
  id               UUID,
  body             TEXT,
  author_name      TEXT,
  author_username  TEXT,
  author_avatar_id UUID,
  is_mine          BOOLEAN,
  is_op            BOOLEAN,
  helpful_count    INT,
  helped           BOOLEAN,
  created_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.body,
         public.community_display_name(u.full_name),
         CASE WHEN public.can_view_profile(u.id) THEN u.username::text END,
         CASE WHEN public.can_view_profile(u.id) THEN u.avatar_id END,
         r.author_id = (select auth.uid()),
         r.author_id = p.author_id,
         (SELECT count(*)::int FROM public.community_helpful h WHERE h.reply_id = r.id),
         EXISTS (SELECT 1 FROM public.community_helpful h WHERE h.reply_id = r.id AND h.user_id = (select auth.uid())),
         r.created_at
  FROM public.community_replies r
  JOIN public.community_posts p ON p.id = r.post_id AND p.hidden_at IS NULL
  JOIN public.users pu ON pu.id = p.author_id AND pu.suspended_at IS NULL
  JOIN public.users u ON u.id = r.author_id AND u.suspended_at IS NULL
  WHERE (select auth.uid()) IS NOT NULL
    AND r.post_id = p_post
    AND r.hidden_at IS NULL
    AND NOT public.is_blocked((select auth.uid()), p.author_id)
    AND NOT public.is_blocked((select auth.uid()), r.author_id)
  ORDER BY r.created_at, r.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 300);
$$;

-- Tulisan milik sendiri (ekspor data akun). Termasuk yang disembunyikan moderator.
CREATE OR REPLACE FUNCTION public.my_community_content()
RETURNS TABLE (kind TEXT, id UUID, post_id UUID, title TEXT, body TEXT, hidden BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM (
    SELECT 'post'::text, p.id, p.id, p.title::text, p.body, p.hidden_at IS NOT NULL, p.created_at
    FROM public.community_posts p WHERE p.author_id = (select auth.uid())
    UNION ALL
    SELECT 'reply'::text, r.id, r.post_id, p.title::text, r.body, r.hidden_at IS NOT NULL, r.created_at
    FROM public.community_replies r JOIN public.community_posts p ON p.id = r.post_id
    WHERE r.author_id = (select auth.uid())
  ) AS mine
  ORDER BY 7 DESC
  LIMIT 2000;
$$;

-- ---------------------------------------------------------------------
-- Menulis
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_community_post(p_topic TEXT, p_title TEXT, p_body TEXT, p_event UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid  UUID := public.community_writer();
  post UUID;
BEGIN
  IF p_topic IS NULL OR p_topic NOT IN ('tanya', 'cari-tim', 'info', 'cerita')
     OR char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 6 AND 120
     OR char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'invalid_community_post' USING ERRCODE = '23514';
  END IF;
  IF public.community_has_contact(p_title) OR public.community_has_contact(p_body) THEN
    RAISE EXCEPTION 'community_contact_blocked' USING ERRCODE = '23514';
  END IF;
  IF p_event IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event AND status IN ('APPROVED', 'EXPIRED')) THEN
    RAISE EXCEPTION 'community_event_unavailable' USING ERRCODE = 'P0002';
  END IF;
  -- Postingan tampil ke semua anggota: akun yang dibajak tidak boleh membanjiri lini masa.
  IF NOT public.consume_rate_limit('community-post:' || uid::text, 5, 86400) THEN
    RAISE EXCEPTION 'community_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.community_posts (author_id, topic, title, body, event_id)
  VALUES (uid, p_topic, btrim(p_title), btrim(p_body), p_event)
  RETURNING id INTO post;
  RETURN post;
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_community_post(p_post UUID, p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid    UUID := public.community_writer();
  target public.community_posts%ROWTYPE;
  reply  UUID;
BEGIN
  SELECT * INTO target FROM public.community_posts WHERE id = p_post AND hidden_at IS NULL FOR UPDATE;
  -- Tidak ada, disembunyikan, penulisnya ditangguhkan, atau saling blokir = jawaban sama.
  IF NOT FOUND OR NOT public.community_author_visible(target.author_id) THEN
    RAISE EXCEPTION 'community_post_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 2 AND 1000 THEN
    RAISE EXCEPTION 'invalid_community_reply' USING ERRCODE = '23514';
  END IF;
  IF public.community_has_contact(p_body) THEN
    RAISE EXCEPTION 'community_contact_blocked' USING ERRCODE = '23514';
  END IF;
  IF NOT public.consume_rate_limit('community-reply:' || uid::text, 30, 86400) THEN
    RAISE EXCEPTION 'community_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.community_replies (post_id, author_id, body)
  VALUES (p_post, uid, btrim(p_body))
  RETURNING id INTO reply;
  UPDATE public.community_posts SET last_activity_at = now() WHERE id = p_post;

  IF target.author_id <> uid THEN
    INSERT INTO public.notifications (user_id, community_post_id, type, message)
    VALUES (target.author_id, p_post, 'COMMUNITY_REPLY', format('Ada balasan baru di postinganmu "%s".', left(target.title, 100)))
    ON CONFLICT (user_id, community_post_id, type) WHERE community_post_id IS NOT NULL
    DO UPDATE SET message = EXCLUDED.message, is_read = false, sent_at = now();
  END IF;
  RETURN reply;
END;
$$;

-- Tandai/lepas "Bermanfaat". Mengembalikan keadaan sesudahnya (TRUE = ditandai).
CREATE OR REPLACE FUNCTION public.toggle_community_helpful(p_post UUID, p_reply UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid         UUID := public.community_writer();
  author      UUID;
  post_author UUID;
  removed     INT;
BEGIN
  IF (p_post IS NULL) = (p_reply IS NULL) THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '23514';
  END IF;
  IF p_post IS NOT NULL THEN
    SELECT p.author_id, p.author_id INTO author, post_author FROM public.community_posts p WHERE p.id = p_post AND p.hidden_at IS NULL;
  ELSE
    SELECT r.author_id, p.author_id INTO author, post_author
    FROM public.community_replies r
    JOIN public.community_posts p ON p.id = r.post_id AND p.hidden_at IS NULL
    WHERE r.id = p_reply AND r.hidden_at IS NULL;
  END IF;
  IF author IS NULL OR NOT public.community_author_visible(author) OR NOT public.community_author_visible(post_author) THEN
    RAISE EXCEPTION 'community_post_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF author = uid THEN
    RAISE EXCEPTION 'community_own_content' USING ERRCODE = '23514';
  END IF;

  IF p_post IS NOT NULL THEN
    DELETE FROM public.community_helpful WHERE post_id = p_post AND user_id = uid;
  ELSE
    DELETE FROM public.community_helpful WHERE reply_id = p_reply AND user_id = uid;
  END IF;
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed > 0 THEN
    RETURN false;
  END IF;
  IF NOT public.consume_rate_limit('community-helpful:' || uid::text, 200, 86400) THEN
    RAISE EXCEPTION 'community_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.community_helpful (user_id, post_id, reply_id) VALUES (uid, p_post, p_reply) ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

-- Penulis menghapus tulisannya sendiri. Postingan membawa balasannya (CASCADE).
CREATE OR REPLACE FUNCTION public.delete_community_post(p_post UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.community_posts WHERE id = p_post AND author_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_post_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Mengembalikan id postingannya supaya aplikasi bisa kembali ke utas yang sama.
CREATE OR REPLACE FUNCTION public.delete_community_reply(p_reply UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  post UUID;
BEGIN
  DELETE FROM public.community_replies WHERE id = p_reply AND author_id = auth.uid() RETURNING post_id INTO post;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_reply_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN post;
END;
$$;

-- ---------------------------------------------------------------------
-- Laporan & moderasi
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.report_community_content(p_kind TEXT, p_id UUID, p_reason TEXT, p_details TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid       UUID := public.community_writer();
  author    UUID;
  post      UUID;
  snap      TEXT;
  reporters INT;
BEGIN
  IF p_kind = 'post' THEN
    SELECT p.author_id, p.id, p.title || E'\n\n' || p.body INTO author, post, snap
    FROM public.community_posts p WHERE p.id = p_id AND p.hidden_at IS NULL;
  ELSIF p_kind = 'reply' THEN
    SELECT r.author_id, r.post_id, r.body INTO author, post, snap
    FROM public.community_replies r
    JOIN public.community_posts p ON p.id = r.post_id AND p.hidden_at IS NULL
    WHERE r.id = p_id AND r.hidden_at IS NULL;
  END IF;
  -- Tidak ada, milik sendiri, atau tidak boleh dibaca = jawaban sama.
  IF author IS NULL OR author = uid OR NOT public.community_author_visible(author) THEN
    RAISE EXCEPTION 'report_unavailable' USING ERRCODE = 'P0002';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('scam', 'misleading', 'inappropriate', 'harassment', 'spam', 'impersonation', 'other') THEN
    RAISE EXCEPTION 'invalid_report' USING ERRCODE = '23514';
  END IF;
  -- Kuota yang SAMA dengan laporan kegiatan/akun/pertanyaan: tidak ada jalur kedua untuk membanjiri antrean.
  IF NOT public.consume_rate_limit('report:' || uid::text, 10, 86400) THEN
    RAISE EXCEPTION 'report_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  -- Dua laporan bersamaan tidak boleh sama-sama melihat "2 pelapor" lalu sama-sama tidak menyembunyikan.
  PERFORM pg_advisory_xact_lock(hashtextextended('community-report:' || p_id::text, 0));
  INSERT INTO public.community_reports (reporter_id, subject_type, subject_id, post_id, author_id, snapshot, reason, details)
  VALUES (uid, p_kind, p_id, post, author, left(snap, 2200), p_reason, NULLIF(left(btrim(COALESCE(p_details, '')), 1000), ''))
  ON CONFLICT (reporter_id, subject_type, subject_id) WHERE status = 'OPEN' DO NOTHING;

  -- Tiga pelapor BERBEDA = disembunyikan sampai moderator memutuskan (melindungi
  -- pembaca 13+ dari konten berbahaya di luar jam kerja moderator).
  SELECT count(DISTINCT reporter_id) INTO reporters
  FROM public.community_reports WHERE subject_type = p_kind AND subject_id = p_id AND status = 'OPEN';
  IF reporters >= 3 THEN
    IF p_kind = 'post' THEN
      UPDATE public.community_posts SET hidden_at = now(), hidden_auto = true WHERE id = p_id AND hidden_at IS NULL;
    ELSE
      UPDATE public.community_replies SET hidden_at = now(), hidden_auto = true WHERE id = p_id AND hidden_at IS NULL;
    END IF;
  END IF;
END;
$$;

-- Antrean moderator: satu baris per TULISAN yang punya laporan terbuka (bukan per laporan).
-- Dipanggil rute admin (service_role) setelah checkAdminAccess().
CREATE OR REPLACE FUNCTION public.admin_community_report_queue(p_limit INT DEFAULT 50)
RETURNS TABLE (
  report_id    UUID,
  subject_type TEXT,
  subject_id   UUID,
  post_id      UUID,
  post_title   TEXT,
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
    SELECT r.subject_type, r.subject_id,
           (array_agg(r.id ORDER BY r.created_at))[1] AS report_id,
           (array_agg(r.post_id ORDER BY r.created_at DESC))[1] AS post_id,
           (array_agg(r.author_id ORDER BY r.created_at DESC))[1] AS author_id,
           (array_agg(r.snapshot ORDER BY r.created_at DESC))[1] AS snapshot,
           array_agg(DISTINCT r.reason ORDER BY r.reason) AS reasons,
           (array_agg(r.details ORDER BY r.created_at DESC) FILTER (WHERE r.details IS NOT NULL))[1] AS details,
           count(*)::int AS report_count,
           min(r.created_at) AS first_at
    FROM public.community_reports r
    WHERE r.status = 'OPEN'
    GROUP BY r.subject_type, r.subject_id
  )
  SELECT g.report_id, g.subject_type, g.subject_id, g.post_id, p.title::text, g.author_id, au.full_name::text,
         g.snapshot, g.reasons, g.details, g.report_count,
         COALESCE(sp.hidden_at, sr.hidden_at) IS NOT NULL,
         COALESCE(sp.hidden_auto, sr.hidden_auto, false),
         (sp.id IS NOT NULL OR sr.id IS NOT NULL),
         g.first_at
  FROM grouped g
  LEFT JOIN public.community_posts p ON p.id = g.post_id
  LEFT JOIN public.community_posts sp ON g.subject_type = 'post' AND sp.id = g.subject_id
  LEFT JOIN public.community_replies sr ON g.subject_type = 'reply' AND sr.id = g.subject_id
  LEFT JOIN public.users au ON au.id = g.author_id
  ORDER BY g.first_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_community_report(p_report UUID, p_actor UUID, p_outcome TEXT, p_hide BOOLEAN, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  report public.community_reports%ROWTYPE;
  note   TEXT := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
  closed UUID[];
BEGIN
  SELECT * INTO report FROM public.community_reports WHERE id = p_report AND status = 'OPEN' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('RESOLVED', 'DISMISSED') THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '23514';
  END IF;

  IF p_outcome = 'RESOLVED' AND COALESCE(p_hide, false) THEN
    -- Keputusan moderator final: bukan lagi "otomatis".
    IF report.subject_type = 'post' THEN
      UPDATE public.community_posts SET hidden_at = COALESCE(hidden_at, now()), hidden_auto = false WHERE id = report.subject_id;
    ELSE
      UPDATE public.community_replies SET hidden_at = COALESCE(hidden_at, now()), hidden_auto = false WHERE id = report.subject_id;
    END IF;
  ELSIF p_outcome = 'DISMISSED' THEN
    -- Tidak melanggar: yang tersembunyi OTOMATIS tampil lagi; yang disembunyikan moderator tidak disentuh.
    IF report.subject_type = 'post' THEN
      UPDATE public.community_posts SET hidden_at = NULL, hidden_auto = false WHERE id = report.subject_id AND hidden_auto;
    ELSE
      UPDATE public.community_replies SET hidden_at = NULL, hidden_auto = false WHERE id = report.subject_id AND hidden_auto;
    END IF;
  END IF;

  WITH done AS (
    UPDATE public.community_reports
    SET status = p_outcome, resolution_note = note, reviewed_by = p_actor, reviewed_at = now()
    WHERE subject_type = report.subject_type AND subject_id = report.subject_id AND status = 'OPEN'
    RETURNING id
  )
  SELECT array_agg(id) INTO closed FROM done;

  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES ('report', report.id,
          left(format('Laporan Komunitas: %s (%s)%s',
                      CASE report.subject_type WHEN 'post' THEN 'postingan' ELSE 'balasan' END,
                      report.reason,
                      CASE WHEN p_outcome = 'RESOLVED' AND COALESCE(p_hide, false) THEN ' — disembunyikan' ELSE '' END), 300),
          'OPEN', p_outcome, p_actor, note);

  -- Pelapor dikabari hasilnya, tanpa catatan internal moderator (ADR-062).
  INSERT INTO public.notifications (user_id, type, message)
  SELECT DISTINCT r.reporter_id,
         CASE p_outcome WHEN 'RESOLVED' THEN 'REPORT_RESOLVED' ELSE 'REPORT_DISMISSED' END,
         CASE p_outcome
           WHEN 'RESOLVED' THEN 'Terima kasih. Laporanmu tentang sebuah tulisan di Komunitas sudah ditindaklanjuti moderator. Demi privasi semua pihak, rincian tindakannya tidak kami bagikan.'
           ELSE 'Laporanmu tentang sebuah tulisan di Komunitas sudah ditinjau moderator dan belum ditemukan pelanggaran Syarat & Ketentuan. Punya bukti tambahan? Kirim laporan baru.'
         END
  FROM public.community_reports r
  WHERE r.id = ANY (closed) AND r.reporter_id IS NOT NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- Hak
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.community_display_name(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_has_contact(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_author_visible(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_writer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_community_posts(TEXT, UUID, TIMESTAMPTZ, UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_community_post(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_community_replies(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_community_content() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_community_post(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reply_community_post(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_community_helpful(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_community_post(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_community_reply(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_community_content(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_community_report_queue(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_resolve_community_report(UUID, UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_community_posts(TEXT, UUID, TIMESTAMPTZ, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_post(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_community_replies(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_community_content() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_post(TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_community_post(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_community_helpful(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_community_post(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_community_reply(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_community_content(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_community_report_queue(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_community_report(UUID, UUID, TEXT, BOOLEAN, TEXT) TO service_role;
