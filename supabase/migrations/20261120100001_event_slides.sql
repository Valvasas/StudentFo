-- =====================================================================
-- Slide & gambar deskriptif kegiatan (ADR-094)
--
-- Pemilik (20 Nov): penyelenggara/admin hanya diminta POSTER saat mengirim
-- atau membuat acara; gambar penjelas (alur, hadiah, juri, linimasa) tidak
-- bisa ikut, dan galeri yang ada diurutkan "terbaru dulu" — slide yang
-- diunggah sekaligus tampil TERBALIK, tanpa cara menyusunnya ulang.
--
-- 1. `event_photos.sort_order`: urutan slide yang dipilih manusia. Baris lama
--    diisi menurut urutan tampil sekarang (poster, lalu terbaru); unggahan
--    baru masuk di BELAKANG (pemicu sisip yang sudah ada). Poster tetap
--    pertama (ADR-079) apa pun urutannya.
-- 2. `reorder_event_photos()` & `set_event_photo_caption()` — DEFINER,
--    pengelola atau admin, jawaban "tidak ada" sama dengan "tidak berhak".
--    Klien tetap tanpa hak UPDATE tabel (is_poster hanya lewat RPC).
-- 3. `ugc_submission_photos`: hingga 5 gambar pendukung di kiriman /submit
--    (poster + 5 = 6 berkas × 5 MB, pas batas body Server Action 32 MB).
--    Pola poster kiriman (ADR-084): baris & berkas hanya ditulis server,
--    berkas di `event-photos/<id kiriman>/<id gambar>.<ext>` (lolos CHECK
--    `event_photos.storage_path`), disetujui = baris event_photos menunjuk
--    berkas yang SAMA (tanpa salin), ditolak = dilepas & dihapus.
--
-- Hanya ADD / CREATE / CREATE OR REPLACE. Kode aman urutan deploy: tanpa
-- kolom → urutan lama; tanpa RPC → `media_unavailable`; tanpa tabel →
-- kiriman tersimpan tanpa gambar pendukung dan pengirimnya diberi tahu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Urutan slide
-- ---------------------------------------------------------------------
ALTER TABLE public.event_photos
  ADD COLUMN sort_order SMALLINT CHECK (sort_order BETWEEN 0 AND 999);

UPDATE public.event_photos p
SET sort_order = ranked.rank
FROM (
  SELECT id, (row_number() OVER (PARTITION BY event_id ORDER BY is_poster DESC, created_at DESC) - 1)::SMALLINT AS rank
  FROM public.event_photos
) AS ranked
WHERE ranked.id = p.id;

GRANT SELECT (sort_order) ON public.event_photos TO anon, authenticated;

COMMENT ON COLUMN public.event_photos.sort_order IS
  'Urutan slide pilihan pengelola (ADR-094). Diisi pemicu sisip (di belakang); diubah hanya lewat reorder_event_photos(). Poster tetap tampil pertama.';

-- Isi sama dengan versi 20261014100001 + urutan: baris tanpa urutan masuk di
-- belakang. Kunci per acara yang sama membuat dua unggahan bersamaan tidak
-- berebut nomor; baris sebelumnya di INSERT yang sama sudah terlihat di sini.
CREATE OR REPLACE FUNCTION public.enforce_event_photo_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('photos:' || NEW.event_id::text, 0));
  IF (SELECT count(*) FROM public.event_photos WHERE event_id = NEW.event_id) >= 30 THEN
    RAISE EXCEPTION 'gallery_full' USING ERRCODE = 'P0001';
  END IF;
  NEW.uploaded_by := auth.uid();
  NEW.created_at := clock_timestamp();
  IF NEW.sort_order IS NULL THEN
    NEW.sort_order := (SELECT COALESCE(max(sort_order) + 1, 0) FROM public.event_photos WHERE event_id = NEW.event_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_event_photo_insert() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Susun ulang & keterangan per gambar
-- ---------------------------------------------------------------------
-- `p_photos` = urutan yang diinginkan. Id asing/ganda diabaikan; foto acara
-- ini yang tidak disebut tetap di belakang menurut urutan lamanya — klien
-- yang tertinggal satu unggahan tidak menghilangkan foto siapa pun.
CREATE OR REPLACE FUNCTION public.reorder_event_photos(p_event UUID, p_photos UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event)
     OR NOT (public.manages_event(p_event) OR public.is_admin()) THEN
    RAISE EXCEPTION 'not_event_manager' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(cardinality(p_photos), 0) > 60 THEN
    RAISE EXCEPTION 'invalid_photo_order' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('photos:' || p_event::text, 0));

  WITH wanted AS (
    SELECT DISTINCT ON (t.id) t.id, t.ord
    FROM unnest(p_photos) WITH ORDINALITY AS t(id, ord)
    ORDER BY t.id, t.ord
  ),
  ranked AS (
    SELECT p.id, (row_number() OVER (ORDER BY w.ord NULLS LAST, p.sort_order NULLS LAST, p.created_at) - 1)::SMALLINT AS rank
    FROM public.event_photos p
    LEFT JOIN wanted w ON w.id = p.id
    WHERE p.event_id = p_event
  )
  UPDATE public.event_photos e
  SET sort_order = r.rank
  FROM ranked r
  WHERE e.id = r.id AND e.sort_order IS DISTINCT FROM r.rank;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_event_photo_caption(p_photo UUID, p_caption TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event   UUID;
  v_caption TEXT := NULLIF(btrim(regexp_replace(coalesce(p_caption, ''), '[[:cntrl:]]+', ' ', 'g')), '');
BEGIN
  SELECT event_id INTO v_event FROM public.event_photos WHERE id = p_photo;
  IF v_event IS NULL OR NOT (public.manages_event(v_event) OR public.is_admin()) THEN
    RAISE EXCEPTION 'photo_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_caption) > 140 THEN
    RAISE EXCEPTION 'invalid_caption' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.event_photos SET caption = v_caption WHERE id = p_photo;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Gambar pendukung di kiriman /submit
-- ---------------------------------------------------------------------
CREATE TABLE public.ugc_submission_photos (
  id            UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.ugc_submissions(id) ON DELETE CASCADE,
  content_type  VARCHAR(20) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  width         INTEGER NOT NULL CHECK (width BETWEEN 1 AND 10000),
  height        INTEGER NOT NULL CHECK (height BETWEEN 1 AND 10000),
  caption       VARCHAR(140),
  -- 0..4 + unik per kiriman = maksimal lima gambar, tanpa pemicu hitung.
  sort_order    SMALLINT NOT NULL CHECK (sort_order BETWEEN 0 AND 4),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, sort_order)
);

COMMENT ON TABLE public.ugc_submission_photos IS
  'Gambar pendukung kiriman /submit (ADR-094). Hanya server (service_role) yang menulis & membaca; dipindah ke event_photos oleh approve_submission(), dilepas take_submission_photos() saat ditolak.';

-- RLS tanpa policy: hanya service_role & fungsi DEFINER di bawah.
ALTER TABLE public.ugc_submission_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ugc_submission_photos FROM PUBLIC, anon, authenticated;

-- Berkas di balik /media/kiriman/<id kiriman>/<id gambar>: moderator & pengirimnya.
CREATE OR REPLACE FUNCTION public.submission_photo_file(p_submission UUID, p_photo UUID)
RETURNS TABLE (path TEXT, content_type TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.submission_poster_path(s.id, sp.id, sp.content_type), sp.content_type::text
  FROM public.ugc_submission_photos sp
  JOIN public.ugc_submissions s ON s.id = sp.submission_id
  WHERE sp.id = p_photo
    AND s.id = p_submission
    AND ((select public.is_admin()) OR s.submitted_by = (select auth.uid()));
$$;

-- Lepas gambar pendukung kiriman yang SUDAH diputuskan (ditolak). Kiriman
-- PENDING tidak disentuh — sama dengan take_submission_poster().
CREATE OR REPLACE FUNCTION public.take_submission_photos(p_submission UUID)
RETURNS SETOF TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ugc_submissions WHERE id = p_submission AND status <> 'PENDING') THEN
    RETURN;
  END IF;
  RETURN QUERY
    DELETE FROM public.ugc_submission_photos sp
    WHERE sp.submission_id = p_submission
    RETURNING public.submission_poster_path(sp.submission_id, sp.id, sp.content_type);
END;
$$;

-- ---------------------------------------------------------------------
-- 4. approve_submission(): gambar pendukung ikut jadi slide acara, dalam
--    urutan yang dipilih pengirim, sesudah poster. Isi lain identik dengan
--    versi 20261116100001.
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
    INSERT INTO public.event_photos (id, event_id, storage_path, content_type, width, height, is_poster, sort_order)
    VALUES (
      submission.poster_id,
      new_event_id,
      public.submission_poster_path(submission.id, submission.poster_id, submission.poster_type),
      submission.poster_type,
      submission.poster_width,
      submission.poster_height,
      TRUE,
      0
    );
  END IF;

  -- Gambar pendukung (ADR-094): berkas yang sama, urutan pengirim, sesudah poster.
  INSERT INTO public.event_photos (id, event_id, storage_path, content_type, width, height, caption, sort_order)
  SELECT sp.id, new_event_id, public.submission_poster_path(submission.id, sp.id, sp.content_type),
         sp.content_type, sp.width, sp.height, sp.caption, sp.sort_order + 1
  FROM public.ugc_submission_photos sp
  WHERE sp.submission_id = submission.id
  ORDER BY sp.sort_order;
  DELETE FROM public.ugc_submission_photos WHERE submission_id = submission.id;

  -- Pemicu sisip mengisi uploaded_by dari auth.uid() (kosong untuk service_role).
  UPDATE public.event_photos SET uploaded_by = submission.submitted_by
  WHERE event_id = new_event_id AND submission.submitted_by IS NOT NULL;

  UPDATE public.ugc_submissions
  SET status = 'APPROVED', reviewed_by = p_reviewer_id, reviewed_at = NOW(),
      poster_id = NULL, poster_type = NULL, poster_width = NULL, poster_height = NULL
  WHERE id = p_submission_id;

  RETURN new_event_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Hak (ADR-020: REVOKE dari anon & authenticated, bukan hanya PUBLIC)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reorder_event_photos(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_event_photo_caption(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submission_photo_file(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.take_submission_photos(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_submission(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reorder_event_photos(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_photo_caption(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submission_photo_file(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.take_submission_photos(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_submission(UUID, UUID) TO service_role;
GRANT SELECT, INSERT, DELETE ON public.ugc_submission_photos TO service_role;
