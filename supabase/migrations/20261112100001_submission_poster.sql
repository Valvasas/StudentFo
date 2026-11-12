-- =====================================================================
-- Poster di kiriman kegiatan (ADR-084)
--
-- Pengirim yang MASUK (penyelenggara, admin, anggota) boleh melampirkan satu
-- poster saat mengirim kegiatan lewat /submit. Sebelum ini poster baru bisa
-- dipasang SETELAH acaranya tayang (studio/admin, ADR-079) — acara baru
-- tampil tanpa gambar tepat di hari-hari pertamanya.
--
-- 1. Empat kolom di `ugc_submissions` (id, jenis, lebar, tinggi). Klien TIDAK
--    diberi hak INSERT kolomnya (hak INSERT tabel ini per kolom, 20260923100001):
--    hanya server (service_role) yang menulis, setelah berkasnya lolos
--    pemeriksaan byte & EXIF-nya dibuang. Payload JSON sengaja tidak dipakai —
--    ia bisa ditulis siapa pun lewat PostgREST, dan referensi berkas di
--    dalamnya tidak boleh dipercaya.
-- 2. Berkas di bucket privat `event-photos` yang sudah ada, path
--    `<id kiriman>/<id poster>.<ext>` — lolos CHECK `event_photos.storage_path`,
--    jadi saat disetujui cukup MENAMBAH baris `event_photos` (is_poster) yang
--    menunjuk berkas yang sama: tidak ada penyalinan berkas, tidak ada jendela
--    "acara tayang tapi posternya belum ikut".
-- 3. `approve_submission()` memindahkan kepemilikan poster ke acara lalu
--    mengosongkan kolom kirimannya; `take_submission_poster()` melepasnya
--    (kiriman ditolak) dan mengembalikan path untuk dihapus dari Storage.
--    Kolom terisi = berkas masih milik kiriman.
-- 4. `submission_poster_file()` — moderator ber-MFA dan pengirimnya sendiri
--    boleh melihat poster kiriman yang belum tayang.
--
-- Hanya ADD / CREATE / CREATE OR REPLACE. Kode aman urutan deploy: tanpa
-- kolom ini kiriman tersimpan tanpa poster dan pengirimnya diberi tahu.
-- =====================================================================

ALTER TABLE public.ugc_submissions
  ADD COLUMN poster_id     UUID,
  ADD COLUMN poster_type   VARCHAR(20),
  ADD COLUMN poster_width  INTEGER,
  ADD COLUMN poster_height INTEGER,
  -- Semua atau tidak sama sekali: id tanpa jenis/ukuran = baris event_photos
  -- tidak bisa dibuat. Ditulis sebagai perbandingan IS NULL, bukan
  -- "id IS NOT NULL AND jenis IN (…)": `NULL IN (…)` bernilai NULL, dan CHECK
  -- meloloskan NULL — poster tanpa jenis akan lolos.
  ADD CONSTRAINT ugc_submissions_poster_file CHECK (
    (poster_id IS NULL) = (poster_type IS NULL)
    AND (poster_id IS NULL) = (poster_width IS NULL)
    AND (poster_id IS NULL) = (poster_height IS NULL)
    AND (poster_type IS NULL OR poster_type IN ('image/jpeg', 'image/png', 'image/webp'))
    AND (poster_width IS NULL OR poster_width BETWEEN 1 AND 10000)
    AND (poster_height IS NULL OR poster_height BETWEEN 1 AND 10000)
  );

-- Id poster menjadi `event_photos.id` saat disetujui: tidak boleh dipakai dua kiriman.
CREATE UNIQUE INDEX ugc_submissions_poster_id_key ON public.ugc_submissions (poster_id) WHERE poster_id IS NOT NULL;

COMMENT ON COLUMN public.ugc_submissions.poster_id IS
  'Poster lampiran kiriman (ADR-084), berkas di event-photos/<id kiriman>/<poster_id>.<ext>. Ditulis hanya oleh server; kosong lagi setelah disetujui (pindah ke event_photos) atau ditolak.';

CREATE OR REPLACE FUNCTION public.submission_poster_path(p_submission UUID, p_id UUID, p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_submission::text || '/' || p_id::text || '.'
    || CASE p_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
$$;

-- ---------------------------------------------------------------------
-- Berkas di balik /media/kiriman/<id kiriman>: hanya moderator ber-MFA dan
-- pengirimnya sendiri. Dipanggil dengan sesi pembaca (pola profile_media_file).
-- Tidak ada, tidak berhak, dan tanpa poster = hasil kosong yang sama.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submission_poster_file(p_submission UUID)
RETURNS TABLE (path TEXT, content_type TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.submission_poster_path(s.id, s.poster_id, s.poster_type), s.poster_type::text
  FROM public.ugc_submissions s
  WHERE s.id = p_submission
    AND s.poster_id IS NOT NULL
    AND ((select public.is_admin()) OR s.submitted_by = (select auth.uid()));
$$;

-- ---------------------------------------------------------------------
-- Lepas poster dari kiriman (dipanggil server setelah kiriman DITOLAK).
-- Mengembalikan path berkasnya untuk dihapus dari Storage; NULL bila tidak
-- ada poster. Kiriman PENDING tidak disentuh: posternya masih menunggu
-- keputusan, dan melepasnya diam-diam = moderator menyetujui acara tanpa
-- gambar yang dikirim panitianya.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.take_submission_poster(p_submission UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_path TEXT;
BEGIN
  SELECT public.submission_poster_path(s.id, s.poster_id, s.poster_type) INTO old_path
  FROM public.ugc_submissions s
  WHERE s.id = p_submission AND s.poster_id IS NOT NULL AND s.status <> 'PENDING'
  FOR UPDATE;
  IF old_path IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.ugc_submissions
  SET poster_id = NULL, poster_type = NULL, poster_width = NULL, poster_height = NULL
  WHERE id = p_submission;
  RETURN old_path;
END;
$$;

-- ---------------------------------------------------------------------
-- approve_submission(): poster lampiran menjadi poster acara. Isi lain
-- identik dengan versi 20261109100002.
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
BEGIN
  SELECT * INTO submission FROM public.ugc_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR submission.status <> 'PENDING' THEN
    RAISE EXCEPTION 'submission_not_found' USING ERRCODE = 'P0002';
  END IF;
  p := submission.payload;

  INSERT INTO public.events (
    title, organizer, description, event_type, registration_link, source_url,
    education_levels, location, is_online, status, reviewed_by, reviewed_at,
    is_free, price_amount, guidebook_url, video_url
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
    -- Kiriman lama (sebelum migration ini) tidak punya kunci-kunci ini →
    -- NULL = "belum diketahui", sama dengan event hasil scraping.
    (p ->> 'is_free')::BOOLEAN,
    (p ->> 'price_amount')::NUMERIC,
    NULLIF(p ->> 'guidebook_url', ''),
    -- Video (ADR-079). Payload bisa ditulis lewat PostgREST oleh siapa pun:
    -- hanya bentuk kanonis yang disalin; selebihnya NULL, bukan kiriman yang
    -- gagal disetujui karena CHECK events_video_url_shape.
    CASE
      WHEN p ->> 'video_url' ~ '^https://(www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com/[0-9]{6,12})$'
      THEN p ->> 'video_url'
    END
  )
  RETURNING id INTO new_event_id;

  INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
  VALUES (new_event_id, 'registration', (p ->> 'deadline_at')::TIMESTAMPTZ, TRUE);

  -- Tahapan berikutnya (ADR-062 #5). Kunci ini tidak ada di kiriman lama, dan
  -- payload bisa ditulis lewat PostgREST oleh siapa pun: hanya label tahapan
  -- yang dikenal & timestamp ISO yang diambil, satu per label.
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

  -- Poster lampiran (ADR-084): baris event_photos baru menunjuk berkas yang
  -- sudah ada — tidak ada berkas yang disalin. Pemicu sisip mengisi
  -- uploaded_by dari auth.uid() (kosong untuk service_role), jadi pengunggah
  -- aslinya ditulis sesudahnya.
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
      -- Berkasnya kini milik acara: kolom terisi = masih milik kiriman.
      poster_id = NULL, poster_type = NULL, poster_width = NULL, poster_height = NULL
  WHERE id = p_submission_id;

  RETURN new_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submission_poster_path(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submission_poster_file(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.take_submission_poster(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_submission(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submission_poster_file(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.take_submission_poster(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_submission(UUID, UUID) TO service_role;
