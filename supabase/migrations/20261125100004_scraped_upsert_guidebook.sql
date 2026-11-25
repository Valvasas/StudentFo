-- =====================================================================
-- Pipeline: buku panduan + "upsert aman" (ADR-102)
--
-- 1. `stage_scraped_event` kini menerima `guidebook_url`. URL yang bukan https
--    / terlalu panjang jadi NULL (bukan membuat seluruh kegiatan gagal oleh
--    CHECK `events_guidebook_url_https`).
-- 2. `upsert_scraped_event(p)`: kegiatan BARU → jalur yang sama dengan
--    `stage_scraped_event` (PENDING). Kegiatan yang SAMA dan masih PENDING
--    di antrean → diperbarui di tempat (isi, tenggat, kategori). Yang sudah
--    ditinjau (APPROVED/REJECTED) TIDAK PERNAH disentuh: moderator sudah
--    memutuskan atas isi yang ada, dan menimpanya diam-diam = melewati
--    moderasi. Hasilnya dilaporkan ('locked') supaya pemanggil tahu.
--
-- Tanpa DROP: CREATE OR REPLACE FUNCTION saja. Hanya service_role.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.scraped_https_url(p_url TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN btrim(p_url) ~* '^https://[^[:space:]]+$' AND char_length(btrim(p_url)) <= 2000 THEN btrim(p_url)
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.scraped_https_url(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scraped_https_url(TEXT) TO service_role;

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
    title, organizer, description, benefits, requirements, guidebook_url, event_type, registration_link, source_url,
    dedup_hash, education_levels, location, is_online, status
  )
  VALUES (
    btrim(p ->> 'title'),
    btrim(p ->> 'organizer'),
    NULLIF(btrim(p ->> 'description'), ''),
    NULLIF(btrim(p ->> 'benefits'), ''),
    NULLIF(btrim(p ->> 'requirements'), ''),
    public.scraped_https_url(p ->> 'guidebook_url'),
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

CREATE OR REPLACE FUNCTION public.upsert_scraped_event(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash   TEXT;
  v_id     UUID;
  v_status TEXT;
  v_new    UUID;
BEGIN
  IF jsonb_typeof(p) <> 'object' OR pg_column_size(p) > 65536 THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  v_hash := public.compute_dedup_hash(p ->> 'title', p ->> 'organizer');
  SELECT id, status::text INTO v_id, v_status
  FROM public.events
  WHERE dedup_hash = v_hash AND status <> 'EXPIRED'
  FOR UPDATE;

  IF NOT FOUND THEN
    v_new := public.stage_scraped_event(p);
    IF v_new IS NULL THEN
      RETURN jsonb_build_object('action', 'duplicate');
    END IF;
    RETURN jsonb_build_object('action', 'created', 'id', v_new);
  END IF;

  IF v_status <> 'PENDING' THEN
    RETURN jsonb_build_object('action', 'locked', 'id', v_id, 'status', v_status);
  END IF;

  UPDATE public.events SET
    description       = COALESCE(NULLIF(btrim(p ->> 'description'), ''), description),
    benefits          = COALESCE(NULLIF(btrim(p ->> 'benefits'), ''), benefits),
    requirements      = COALESCE(NULLIF(btrim(p ->> 'requirements'), ''), requirements),
    guidebook_url     = COALESCE(public.scraped_https_url(p ->> 'guidebook_url'), guidebook_url),
    registration_link = COALESCE(NULLIF(p ->> 'registration_link', ''), registration_link),
    source_url        = COALESCE(NULLIF(p ->> 'source_url', ''), source_url),
    location          = COALESCE(NULLIF(btrim(p ->> 'location'), ''), location),
    is_online         = COALESCE((p ->> 'is_online')::BOOLEAN, is_online),
    education_levels  = CASE WHEN p ? 'education_levels' THEN ARRAY(
      SELECT value::education_level FROM jsonb_array_elements_text(p -> 'education_levels') AS value
    ) ELSE education_levels END
  WHERE id = v_id;

  -- Tenggat & kategori diganti utuh HANYA bila dikirim (kunci ada, tidak kosong).
  IF jsonb_typeof(p -> 'deadlines') = 'array' AND jsonb_array_length(p -> 'deadlines') > 0 THEN
    DELETE FROM public.event_deadlines WHERE event_id = v_id;
    INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
    SELECT v_id, d ->> 'label', (d ->> 'deadline_at')::TIMESTAMPTZ, COALESCE((d ->> 'is_primary')::BOOLEAN, FALSE)
    FROM jsonb_array_elements(p -> 'deadlines') AS d;
  END IF;

  IF jsonb_typeof(p -> 'categories') = 'array' AND jsonb_array_length(p -> 'categories') > 0 THEN
    DELETE FROM public.event_categories WHERE event_id = v_id;
    INSERT INTO public.event_categories (event_id, category_id)
    SELECT v_id, c.id FROM public.categories c
    WHERE c.slug IN (SELECT jsonb_array_elements_text(p -> 'categories'));
  END IF;

  RETURN jsonb_build_object('action', 'updated', 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_scraped_event(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_scraped_event(JSONB) TO service_role;

COMMENT ON FUNCTION public.upsert_scraped_event(JSONB) IS
  'Pipeline: baru → PENDING; sama & masih PENDING → diperbarui; sudah ditinjau → tidak disentuh (locked). Hanya service_role. ADR-102.';
