-- =====================================================================
-- Tanya-jawab publik per kegiatan (ADR-062 #7) — bentuk "diskusi" yang aman
-- untuk platform 13+: PUBLIK (tidak ada saluran privat antar-orang asing,
-- PP 17/2025), satu topik (kegiatan itu), yang menjawab hanya pengelola
-- terverifikasi atau admin, bisa dilaporkan & disembunyikan moderator.
--
-- Tabel tanpa policy: semua akses lewat RPC DEFINER, sehingga nama penanya
-- yang tampil hanya NAMA DEPAN (bukan profil lengkap) dan id akun tidak
-- pernah keluar.
-- =====================================================================

CREATE TABLE public.event_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- CASCADE: menghapus akun menghapus pertanyaannya (UU PDP Pasal 8).
  author_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 10 AND 500),
  answer      TEXT CHECK (answer IS NULL OR char_length(btrim(answer)) BETWEEN 2 AND 1500),
  answered_as TEXT CHECK (answered_as IN ('organizer', 'moderator')),
  answered_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ,
  hidden_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_questions_answer_trail CHECK ((answer IS NULL) = (answered_at IS NULL) AND (answer IS NULL) = (answered_as IS NULL))
);

CREATE INDEX idx_event_questions_event ON public.event_questions (event_id, created_at DESC) WHERE hidden_at IS NULL;
CREATE INDEX idx_event_questions_author ON public.event_questions (author_id);

ALTER TABLE public.event_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_questions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.event_questions TO service_role;

CREATE OR REPLACE FUNCTION public.list_event_questions(p_event UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id                UUID,
  body              TEXT,
  author_first_name TEXT,
  is_mine           BOOLEAN,
  created_at        TIMESTAMPTZ,
  answer            TEXT,
  answered_as       TEXT,
  answered_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT q.id, q.body,
         COALESCE(NULLIF(split_part(btrim(u.full_name), ' ', 1), ''), 'Peserta'),
         q.author_id = auth.uid() IS TRUE,
         q.created_at, q.answer, q.answered_as, q.answered_at
  FROM public.event_questions q
  JOIN public.events e ON e.id = q.event_id AND e.status IN ('APPROVED', 'EXPIRED')
  JOIN public.users u ON u.id = q.author_id
  WHERE q.event_id = p_event AND q.hidden_at IS NULL
  ORDER BY q.created_at DESC, q.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.ask_event_question(p_event UUID, p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid      UUID := auth.uid();
  question UUID;
  title    TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE = '42501';
  END IF;
  -- Kegiatan yang sudah tutup tidak menerima pertanyaan baru (tetap terbaca).
  SELECT e.title INTO title FROM public.events e WHERE e.id = p_event AND e.status = 'APPROVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_event_unavailable' USING ERRCODE = 'P0002';
  END IF;
  IF char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid_question' USING ERRCODE = '23514';
  END IF;
  IF NOT public.consume_rate_limit('question:' || uid::text, 5, 86400) THEN
    RAISE EXCEPTION 'question_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.event_questions (event_id, author_id, body)
  VALUES (p_event, uid, btrim(p_body))
  RETURNING id INTO question;

  -- Satu notifikasi per pengelola per kegiatan (idx_notifications_dedupe):
  -- sepuluh pertanyaan baru = satu kabar yang diperbarui, bukan sepuluh.
  INSERT INTO public.notifications (user_id, event_id, type, message)
  SELECT m.user_id, p_event, 'QUESTION_ASKED',
         format('Ada pertanyaan baru di "%s". Jawab dari tab Tanya jawab di halaman kegiatannya.', left(title, 120))
  FROM public.event_managers m
  JOIN public.organizer_profiles o ON o.user_id = m.user_id AND o.status = 'VERIFIED'
  WHERE m.event_id = p_event AND m.user_id <> uid
  ON CONFLICT (user_id, event_id, type) WHERE event_id IS NOT NULL
  DO UPDATE SET message = EXCLUDED.message, is_read = false, sent_at = now();

  RETURN question;
END;
$$;

CREATE OR REPLACE FUNCTION public.answer_event_question(p_question UUID, p_answer TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid   UUID := auth.uid();
  q     public.event_questions%ROWTYPE;
  role  TEXT;
  title TEXT;
BEGIN
  SELECT * INTO q FROM public.event_questions WHERE id = p_question AND hidden_at IS NULL FOR UPDATE;
  IF NOT FOUND OR uid IS NULL THEN
    RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Pengelola lebih dulu: admin yang juga pengelola menjawab sebagai penyelenggara.
  role := CASE WHEN public.manages_event(q.event_id) THEN 'organizer' WHEN public.is_admin() THEN 'moderator' END;
  IF role IS NULL THEN
    RAISE EXCEPTION 'question_forbidden' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(COALESCE(p_answer, ''))) NOT BETWEEN 2 AND 1500 THEN
    RAISE EXCEPTION 'invalid_answer' USING ERRCODE = '23514';
  END IF;

  UPDATE public.event_questions
  SET answer = btrim(p_answer), answered_as = role, answered_by = uid, answered_at = now()
  WHERE id = q.id;

  IF q.author_id <> uid THEN
    SELECT e.title INTO title FROM public.events e WHERE e.id = q.event_id;
    INSERT INTO public.notifications (user_id, event_id, type, message)
    VALUES (q.author_id, q.event_id, 'QUESTION_ANSWERED',
            format('Pertanyaanmu tentang "%s" sudah dijawab %s.', left(title, 120), CASE role WHEN 'organizer' THEN 'penyelenggara' ELSE 'moderator' END))
    ON CONFLICT (user_id, event_id, type) WHERE event_id IS NOT NULL
    DO UPDATE SET message = EXCLUDED.message, is_read = false, sent_at = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_event_question(p_question UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.event_questions WHERE id = p_question AND author_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Moderasi: dipanggil rute admin (service_role) setelah checkAdminAccess().
CREATE OR REPLACE FUNCTION public.hide_event_question(p_question UUID, p_actor UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  q public.event_questions%ROWTYPE;
BEGIN
  UPDATE public.event_questions SET hidden_at = now()
  WHERE id = p_question AND hidden_at IS NULL
  RETURNING * INTO q;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES ('question', q.id, left(q.body, 120), 'APPROVED', 'REJECTED', p_actor, NULLIF(btrim(p_reason), ''));
END;
$$;

-- Hak akses data (UU PDP Pasal 7): pertanyaan milik sendiri, termasuk yang disembunyikan moderator.
CREATE OR REPLACE FUNCTION public.list_my_event_questions()
RETURNS TABLE (event_title TEXT, event_slug TEXT, body TEXT, created_at TIMESTAMPTZ, answer TEXT, hidden BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.title, e.slug, q.body, q.created_at, q.answer, q.hidden_at IS NOT NULL
  FROM public.event_questions q
  JOIN public.events e ON e.id = q.event_id
  WHERE q.author_id = auth.uid()
  ORDER BY q.created_at DESC
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.list_my_event_questions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_event_questions() TO authenticated;

REVOKE ALL ON FUNCTION public.list_event_questions(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ask_event_question(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.answer_event_question(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_event_question(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hide_event_question(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_event_questions(UUID, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ask_event_question(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.answer_event_question(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_question(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_event_question(UUID, UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- Laporan & riwayat moderasi menerima subjek "question"
-- ---------------------------------------------------------------------
ALTER TABLE public.content_reports DROP CONSTRAINT content_reports_subject_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_subject_type_check CHECK (subject_type IN ('event', 'user', 'question'));
ALTER TABLE public.moderation_log DROP CONSTRAINT moderation_log_subject_type_check;
ALTER TABLE public.moderation_log
  ADD CONSTRAINT moderation_log_subject_type_check
  CHECK (subject_type IN ('event', 'submission', 'organizer', 'claim', 'revision', 'user', 'report', 'question'));

CREATE OR REPLACE FUNCTION public.report_content(
  p_subject_type TEXT,
  p_subject_id   UUID,
  p_reason       TEXT,
  p_details      TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'report_requires_login' USING ERRCODE = '42501';
  END IF;

  -- Subjek harus sesuatu yang memang bisa dilihat pelapor; laporan untuk UUID
  -- sembarang = alat menebak keberadaan akun/acara.
  IF p_subject_type = 'event' THEN
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_subject_id AND status IN ('APPROVED', 'EXPIRED')) THEN
      RAISE EXCEPTION 'report_subject_unavailable' USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_subject_type = 'user' THEN
    IF p_subject_id = uid OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_subject_id) THEN
      RAISE EXCEPTION 'report_subject_unavailable' USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_subject_type = 'question' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.event_questions q JOIN public.events e ON e.id = q.event_id
      WHERE q.id = p_subject_id AND q.hidden_at IS NULL AND e.status IN ('APPROVED', 'EXPIRED')
        AND q.author_id IS DISTINCT FROM uid
    ) THEN
      RAISE EXCEPTION 'report_subject_unavailable' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_report' USING ERRCODE = '23514';
  END IF;

  IF NOT public.consume_rate_limit('report:' || uid::text, 10, 86400) THEN
    RAISE EXCEPTION 'report_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.content_reports (reporter_id, subject_type, subject_id, reason, details)
  VALUES (uid, p_subject_type, p_subject_id, p_reason, NULLIF(btrim(p_details), ''))
  ON CONFLICT (reporter_id, subject_type, subject_id) WHERE status = 'OPEN' DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.report_content(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_content(TEXT, UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_content_report(
  p_report  UUID,
  p_actor   UUID,
  p_outcome TEXT,
  p_note    TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  report       public.content_reports%ROWTYPE;
  -- Id eksplisit, bukan "reviewed_at = now()": dua keputusan dalam satu
  -- transaksi berbagi now() dan pelapor keputusan pertama ikut dikabari ulang.
  closed_ids   UUID[];
  also_closed  INT := 0;
  subject_text TEXT;
BEGIN
  IF p_outcome NOT IN ('RESOLVED', 'DISMISSED') THEN
    RAISE EXCEPTION 'invalid_report' USING ERRCODE = '23514';
  END IF;

  UPDATE public.content_reports
  SET status = p_outcome, resolution_note = NULLIF(btrim(p_note), ''), reviewed_by = p_actor, reviewed_at = now()
  WHERE id = p_report AND status = 'OPEN'
  RETURNING * INTO report;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_not_found' USING ERRCODE = 'P0002';
  END IF;

  closed_ids := ARRAY[report.id];
  IF p_outcome = 'RESOLVED' THEN
    WITH closed AS (
      UPDATE public.content_reports
      SET status = 'RESOLVED', resolution_note = report.resolution_note, reviewed_by = p_actor, reviewed_at = now()
      WHERE subject_type = report.subject_type AND subject_id = report.subject_id AND status = 'OPEN'
      RETURNING id
    )
    SELECT closed_ids || COALESCE(array_agg(id), '{}'), count(*) INTO closed_ids, also_closed FROM closed;
  END IF;

  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES ('report', report.id,
          format('Laporan %s (%s)%s', CASE report.subject_type WHEN 'event' THEN 'kegiatan' WHEN 'question' THEN 'pertanyaan' ELSE 'pengguna' END, report.reason,
                 CASE WHEN also_closed > 0 THEN format(' + %s laporan lain atas subjek yang sama', also_closed) ELSE '' END),
          'OPEN', p_outcome, p_actor, report.resolution_note);

  IF report.subject_type = 'event' THEN
    SELECT format('kegiatan "%s"', left(e.title, 120)) INTO subject_text FROM public.events e WHERE e.id = report.subject_id;
  END IF;
  subject_text := COALESCE(subject_text, CASE report.subject_type WHEN 'event' THEN 'sebuah kegiatan' WHEN 'question' THEN 'pertanyaan yang kamu laporkan' ELSE 'akun yang kamu laporkan' END);

  -- Tanpa event_id: kegiatan yang diturunkan tidak bisa dibuka pelapor, dan
  -- notifikasi tidak ikut terhapus bila kegiatannya dihapus.
  INSERT INTO public.notifications (user_id, type, message)
  SELECT DISTINCT r.reporter_id,
         CASE p_outcome WHEN 'RESOLVED' THEN 'REPORT_RESOLVED' ELSE 'REPORT_DISMISSED' END,
         CASE p_outcome
           WHEN 'RESOLVED' THEN format('Terima kasih. Laporanmu tentang %s sudah ditindaklanjuti moderator. Demi privasi semua pihak, rincian tindakannya tidak kami bagikan.', subject_text)
           ELSE format('Laporanmu tentang %s sudah ditinjau moderator dan belum ditemukan pelanggaran Syarat & Ketentuan. Punya bukti tambahan? Kirim laporan baru.', subject_text)
         END
  FROM public.content_reports r
  WHERE r.id = ANY (closed_ids) AND r.reporter_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_content_report(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_content_report(UUID, UUID, TEXT, TEXT) TO service_role;
