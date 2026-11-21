-- =====================================================================
-- Impor media otomatis ke antrean moderasi (ADR-095)
--
-- Pemilik (21 Nov): kegiatan yang masuk antrean — hasil pipeline maupun
-- kurasi — tidak boleh menunggu admin mengunggah poster & slide satu per
-- satu. Setiap kegiatan PENDING membawa daftar "gambar yang harus
-- disiapkan"; server aplikasi (cron / tombol admin) mengerjakannya:
--
--   URL        : unduh gambar dari tautan resmi. Bila tautannya halaman
--                HTML, gambar og:image/twitter:image halaman itu yang
--                diambil (poster resmi penyelenggara).
--   GENERATED  : poster ringkas & slide penjelas (syarat, jadwal, cara
--                daftar) yang DIGAMBAR server dari data kegiatan itu sendiri.
--
-- Hasilnya masuk ke event_photos (bucket event-photos yang sama), jadi
-- admin melihatnya di kartu antrean dan semuanya ikut tayang saat disetujui.
--
-- 1. Tabel `event_media_imports` — hanya service_role (RLS tanpa policy).
--    Maks. 8 baris per kegiatan (position 0..7, unik per kegiatan).
-- 2. `stage_event_media(event, media)` — DEFINER, service_role: masukkan
--    daftar; NULL = daftar bawaan (gambar laman sumber + 4 gambar buatan).
--    Entri cacat dilewati diam-diam, pola kategori di stage_scraped_event.
-- 3. `claim_event_media_imports(limit)` — sewa 10 menit, SKIP LOCKED: dua
--    pemanggil bersamaan (cron + tombol admin) tidak mengerjakan baris sama.
-- 4. `stage_scraped_event()` ikut mengantrekan media (`p.media` atau bawaan).
--    Isi lain identik dengan versi 20260925100001.
--
-- Hanya CREATE / CREATE OR REPLACE. Kode aman urutan deploy: tanpa tabel,
-- ringkasan media antrean kosong dan pemroses menjawab `media_unavailable`.
-- =====================================================================

CREATE TABLE public.event_media_imports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  position     SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 7),
  kind         VARCHAR(10) NOT NULL CHECK (kind IN ('URL', 'GENERATED')),
  source_url   TEXT CHECK (source_url IS NULL OR (source_url ~* '^https://[^[:space:]]+$' AND char_length(source_url) <= 2000)),
  spec         JSONB CHECK (spec IS NULL OR (jsonb_typeof(spec) = 'object' AND pg_column_size(spec) <= 8192)),
  caption      VARCHAR(140),
  -- "Jadikan poster bila kegiatan belum punya poster": poster yang dipilih
  -- manusia tidak pernah ditimpa pemroses.
  is_poster    BOOLEAN NOT NULL DEFAULT FALSE,
  status       VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'FAILED')),
  attempts     SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  claimed_at   TIMESTAMPTZ,
  error_code   VARCHAR(40),
  photo_id     UUID REFERENCES public.event_photos(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT event_media_imports_source CHECK (
    (kind = 'URL' AND source_url IS NOT NULL AND spec IS NULL)
    OR (kind = 'GENERATED' AND spec IS NOT NULL AND source_url IS NULL)
  ),
  CONSTRAINT event_media_imports_position_key UNIQUE (event_id, position)
);

CREATE INDEX idx_event_media_imports_pending
  ON public.event_media_imports (created_at)
  WHERE status = 'PENDING';

COMMENT ON TABLE public.event_media_imports IS
  'Gambar yang harus disiapkan untuk sebuah kegiatan (ADR-095): unduhan dari tautan resmi (URL) atau poster/slide buatan server (GENERATED). Hanya service_role.';

ALTER TABLE public.event_media_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_media_imports FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Masukkan daftar media
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stage_event_media(p_event UUID, p_media JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source TEXT;
  v_media  JSONB := p_media;
  v_next   INTEGER;
  v_added  INTEGER := 0;
  item     JSONB;
  v_url    TEXT;
  v_spec   JSONB;
BEGIN
  SELECT source_url INTO v_source FROM public.events WHERE id = p_event;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Daftar bawaan: gambar resmi dari laman sumber (calon poster), lalu poster
  -- ringkas buatan server sebagai cadangan, lalu tiga slide penjelas.
  IF v_media IS NULL OR jsonb_typeof(v_media) <> 'array' THEN
    v_media := jsonb_build_array(
      jsonb_build_object('url', v_source, 'is_poster', true, 'caption', 'Gambar dari laman resmi penyelenggara'),
      jsonb_build_object('spec', jsonb_build_object('template', 'poster'), 'is_poster', true),
      jsonb_build_object('spec', jsonb_build_object('template', 'syarat')),
      jsonb_build_object('spec', jsonb_build_object('template', 'jadwal')),
      jsonb_build_object('spec', jsonb_build_object('template', 'cara-daftar'))
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('media-imports:' || p_event::text, 0));
  SELECT COALESCE(max(position) + 1, 0) INTO v_next FROM public.event_media_imports WHERE event_id = p_event;

  FOR item IN SELECT value FROM jsonb_array_elements(v_media) LOOP
    EXIT WHEN v_next > 7;
    CONTINUE WHEN jsonb_typeof(item) <> 'object';
    v_url := btrim(item ->> 'url');
    v_spec := item -> 'spec';

    IF v_url IS NOT NULL AND v_url ~* '^https://[^[:space:]]+$' AND char_length(v_url) <= 2000 THEN
      v_spec := NULL;
    ELSIF jsonb_typeof(v_spec) = 'object'
      AND v_spec ->> 'template' IN ('poster', 'syarat', 'jadwal', 'cara-daftar')
      AND pg_column_size(v_spec) <= 8192 THEN
      v_url := NULL;
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO public.event_media_imports (event_id, position, kind, source_url, spec, caption, is_poster)
    VALUES (
      p_event,
      v_next,
      CASE WHEN v_url IS NOT NULL THEN 'URL' ELSE 'GENERATED' END,
      v_url,
      v_spec,
      NULLIF(left(btrim(regexp_replace(COALESCE(item ->> 'caption', ''), '[[:cntrl:]]+', ' ', 'g')), 140), ''),
      COALESCE((item ->> 'is_poster') = 'true', FALSE)
    );
    v_next := v_next + 1;
    v_added := v_added + 1;
  END LOOP;

  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION public.stage_event_media(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_event_media(UUID, JSONB) TO service_role;

-- ---------------------------------------------------------------------
-- 3. Klaim untuk dikerjakan
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_event_media_imports(p_limit INTEGER)
RETURNS SETOF public.event_media_imports
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.event_media_imports i
  SET claimed_at = NOW(), attempts = i.attempts + 1
  WHERE i.id IN (
    SELECT id
    FROM public.event_media_imports
    WHERE status = 'PENDING'
      AND attempts < 20
      AND (claimed_at IS NULL OR claimed_at < NOW() - INTERVAL '10 minutes')
    ORDER BY created_at, event_id, position
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 50)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING i.*;
$$;

REVOKE ALL ON FUNCTION public.claim_event_media_imports(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_event_media_imports(INTEGER) TO service_role;

-- ---------------------------------------------------------------------
-- 4. Pipeline: tahap event + media dalam satu transaksi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stage_scraped_event(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_event_id UUID;
BEGIN
  IF jsonb_typeof(p) <> 'object' OR pg_column_size(p) > 65536 THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.events (
    title, organizer, description, event_type, registration_link, source_url,
    dedup_hash, education_levels, location, is_online, status
  )
  VALUES (
    btrim(p ->> 'title'),
    btrim(p ->> 'organizer'),
    NULLIF(btrim(p ->> 'description'), ''),
    (p ->> 'event_type')::event_type,
    p ->> 'registration_link',
    p ->> 'source_url',
    public.compute_dedup_hash(p ->> 'title', p ->> 'organizer'),
    ARRAY(
      SELECT value::education_level
      FROM jsonb_array_elements_text(COALESCE(p -> 'education_levels', '[]'::JSONB)) AS value
    ),
    NULLIF(btrim(p ->> 'location'), ''),
    COALESCE((p ->> 'is_online')::BOOLEAN, FALSE),
    'PENDING'
  )
  ON CONFLICT (dedup_hash) WHERE status <> 'EXPIRED' DO NOTHING
  RETURNING id INTO new_event_id;

  IF new_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
  SELECT
    new_event_id,
    d ->> 'label',
    (d ->> 'deadline_at')::TIMESTAMPTZ,
    COALESCE((d ->> 'is_primary')::BOOLEAN, FALSE)
  FROM jsonb_array_elements(COALESCE(p -> 'deadlines', '[]'::JSONB)) AS d;

  -- Slug yang tidak dikenal diabaikan diam-diam: taksonomi bisa berubah di
  -- antara pembuatan schema LLM dan penulisan, dan kategori yang hilang
  -- lebih baik daripada seluruh event gagal.
  INSERT INTO public.event_categories (event_id, category_id)
  SELECT new_event_id, c.id
  FROM public.categories c
  WHERE c.slug IN (
    SELECT jsonb_array_elements_text(COALESCE(p -> 'categories', '[]'::JSONB))
  );

  -- Tanpa `media` = daftar bawaan (ADR-095); `[]` = sengaja tanpa media.
  PERFORM public.stage_event_media(new_event_id, p -> 'media');

  RETURN new_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.stage_scraped_event(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_scraped_event(JSONB) TO service_role;
