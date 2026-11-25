-- =====================================================================
-- Benefit & persyaratan kegiatan lewat pipeline (ADR-101)
--
-- Otomasi info lomba mengekstrak "apa yang didapat" (hadiah, beasiswa,
-- sertifikat) dan "syarat ikut" sebagai teks. Keduanya masuk lewat jalur
-- resmi `stage_scraped_event` — selalu PENDING, dedup & kategori dalam satu
-- transaksi — BUKAN insert langsung ke `events`, yang melewati moderasi.
--
-- Kolom teks nullable (kegiatan lama tidak punya), dibatasi 2000 karakter
-- seperti batas isian lain; tampil publik hanya setelah kegiatan disetujui
-- (`events_public_read`). Tanpa DROP: ADD COLUMN IF NOT EXISTS +
-- CREATE OR REPLACE FUNCTION (isi lain identik dengan 20261121100001).
-- =====================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS benefits TEXT,
  ADD COLUMN IF NOT EXISTS requirements TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_benefits_length') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_benefits_length CHECK (benefits IS NULL OR char_length(benefits) <= 2000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_requirements_length') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_requirements_length CHECK (requirements IS NULL OR char_length(requirements) <= 2000);
  END IF;
END$$;

COMMENT ON COLUMN public.events.benefits IS 'Yang didapat peserta (hadiah, beasiswa, sertifikat), teks bebas ≤ 2000. Diisi pipeline. ADR-101.';
COMMENT ON COLUMN public.events.requirements IS 'Syarat mengikuti, teks bebas ≤ 2000. Diisi pipeline. ADR-101.';

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
    title, organizer, description, benefits, requirements, event_type, registration_link, source_url,
    dedup_hash, education_levels, location, is_online, status
  )
  VALUES (
    btrim(p ->> 'title'),
    btrim(p ->> 'organizer'),
    NULLIF(btrim(p ->> 'description'), ''),
    NULLIF(btrim(p ->> 'benefits'), ''),
    NULLIF(btrim(p ->> 'requirements'), ''),
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
