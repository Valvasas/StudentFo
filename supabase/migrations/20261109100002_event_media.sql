-- =====================================================================
-- Media kegiatan: poster, slide, video (ADR-079)
--
-- 1. `event_photos.is_poster` — satu foto galeri per acara ditandai sebagai
--    poster. Poster tampil pertama di slide halaman acara, sebagai
--    thumbnail di kartu daftar, dan sebagai gambar pratinjau tautan (og:image).
--    Tanpa tabel baru: poster ADALAH foto galeri (bucket privat, EXIF dibuang,
--    batas 30, dihapus = hilang) — satu jalur penyimpanan & moderasi (ADR-056).
-- 2. `events.video_url` — satu video per acara, HANYA tautan YouTube/Vimeo
--    yang sudah dinormalisasi aplikasi (`src/lib/video.ts`). StudentFo tidak
--    menampung berkas video: biaya, moderasi, dan transcoding bukan beban
--    yang layak dipikul katalog info lomba.
-- 3. Menulis keduanya HANYA lewat RPC DEFINER yang memeriksa hak kelola
--    (pengelola terverifikasi atau admin ber-MFA) — klien tidak diberi hak
--    UPDATE pada tabelnya.
--
-- Hanya ADD / CREATE OR REPLACE: penerapannya tidak meminta konfirmasi
-- "perintah destruktif". Kode aman urutan deploy: tanpa kolom ini poster
-- dan video sekadar tidak tampil.
-- =====================================================================

ALTER TABLE public.event_photos
  ADD COLUMN is_poster BOOLEAN NOT NULL DEFAULT FALSE;

-- Maksimal satu poster per acara; sekaligus melayani pencarian poster per daftar kartu.
CREATE UNIQUE INDEX idx_event_photos_one_poster ON public.event_photos (event_id) WHERE is_poster;

COMMENT ON COLUMN public.event_photos.is_poster IS
  'TRUE = poster acara (maks. satu per acara). Diubah hanya lewat set_event_poster().';

-- Hak SELECT tabel ini per KOLOM (20261014100001); tanpa baris ini tamu gagal membaca galeri.
GRANT SELECT (is_poster) ON public.event_photos TO anon, authenticated;

ALTER TABLE public.events
  ADD COLUMN video_url VARCHAR(200),
  -- Bentuk kanonis dari normalizeVideoUrl() — URL lain (playlist, kanal,
  -- pendek youtu.be, domain tiruan) sudah diubah atau ditolak aplikasi.
  ADD CONSTRAINT events_video_url_shape CHECK (
    video_url IS NULL
    OR video_url ~ '^https://(www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com/[0-9]{6,12})$'
  );

COMMENT ON COLUMN public.events.video_url IS
  'Video acara (YouTube/Vimeo, bentuk kanonis). Diputar lewat youtube-nocookie/player.vimeo.com setelah diklik (ADR-079).';

-- ---------------------------------------------------------------------
-- Poster: tandai/lepas. Kunci advisory yang SAMA dengan pemicu unggah
-- foto (enforce_event_photo_insert), supaya dua panitia yang memilih poster
-- bersamaan tidak sama-sama lolos lalu menabrak indeks unik.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_event_poster(p_photo UUID, p_poster BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event UUID;
BEGIN
  SELECT event_id INTO v_event FROM public.event_photos WHERE id = p_photo;
  -- Tidak ada & tidak berhak = jawaban sama: id foto acara orang lain tidak terbuka.
  IF v_event IS NULL OR NOT (public.manages_event(v_event) OR public.is_admin()) THEN
    RAISE EXCEPTION 'photo_not_found' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('photos:' || v_event::text, 0));

  IF p_poster THEN
    -- Lepas poster lama lebih dulu: indeks unik diperiksa per baris.
    UPDATE public.event_photos SET is_poster = FALSE WHERE event_id = v_event AND is_poster AND id <> p_photo;
    UPDATE public.event_photos SET is_poster = TRUE WHERE id = p_photo;
  ELSE
    UPDATE public.event_photos SET is_poster = FALSE WHERE id = p_photo;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- Video: pasang/ganti/hapus (NULL atau string kosong = hapus).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_event_video(p_event UUID, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_event IS NULL OR NOT (public.manages_event(p_event) OR public.is_admin()) THEN
    RAISE EXCEPTION 'not_event_manager' USING ERRCODE = 'P0001';
  END IF;
  -- Tautan video tampil di halaman publik: batasi laju supaya akun pengelola
  -- yang dibajak tidak bisa memutar-mutar konten (pola organizer:, 20260928110001).
  IF NOT public.consume_rate_limit('event-video:' || auth.uid()::text, 30, 86400) THEN
    RAISE EXCEPTION 'video_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.events SET video_url = NULLIF(btrim(p_url), '') WHERE id = p_event;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_event_poster(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_event_video(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_poster(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_video(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- approve_submission(): salin tautan video dari kiriman (/submit kini
-- menerimanya). Isi lain identik dengan versi 20261101100004.
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

  UPDATE public.ugc_submissions
  SET status = 'APPROVED', reviewed_by = p_reviewer_id, reviewed_at = NOW()
  WHERE id = p_submission_id;

  RETURN new_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_submission(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_submission(UUID, UUID) TO service_role;
