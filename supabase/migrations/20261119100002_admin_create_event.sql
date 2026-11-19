-- =====================================================================
-- 20261119100002 — "Buat acara StudentFo" untuk admin (ADR-093)
--
-- Dulu satu-satunya jalan admin membuat lomba internal: isi /submit →
-- kiriman masuk antrean → menyetujui kirimannya sendiri → membuka studio →
-- menyusun formulir. Lima langkah di tiga tempat, dan kiriman admin ikut
-- terhitung batas laju per email (3/jam) serta batas antrean global.
--
-- admin_create_event() memasukkan kegiatan LANGSUNG tayang dalam satu
-- transaksi, dengan kolom yang sama persis dengan approve_submission()
-- (20261116100001): tenggat utama, tahapan, kategori, biaya, panduan,
-- video kanonis, cara mendaftar. Riwayat moderasi ditulis trigger
-- `trg_events_moderation_log` (INSERT berstatus APPROVED + reviewed_by =
-- admin) — fungsi ini TIDAK menulis log sendiri supaya tidak ganda.
--
-- Hanya service_role (server memanggilnya setelah checkAdminAccess() +
-- MFA); pelaku diperiksa ULANG di sini: admin, tidak ditangguhkan.
-- Bergantung pada 20261116100001 (kolom registration_mode).
-- Hanya CREATE OR REPLACE (dikunci migrations-manifest.test.ts).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_create_event(p_actor UUID, p_payload JSONB)
RETURNS TABLE (created_id UUID, created_slug TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p            JSONB := p_payload;
  new_event_id UUID;
  new_slug     TEXT;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_actor AND role = 'ADMIN' AND suspended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
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
    p_actor,
    NOW(),
    (p ->> 'is_free')::BOOLEAN,
    (p ->> 'price_amount')::NUMERIC,
    NULLIF(p ->> 'guidebook_url', ''),
    CASE
      WHEN p ->> 'video_url' ~ '^https://(www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com/[0-9]{6,12})$'
      THEN p ->> 'video_url'
    END,
    CASE WHEN p ->> 'registration_mode' = 'studentfo' THEN 'studentfo' ELSE 'external' END
  )
  RETURNING id, slug INTO new_event_id, new_slug;

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

  RETURN QUERY SELECT new_event_id, new_slug;
END;
$$;

COMMENT ON FUNCTION public.admin_create_event(UUID, JSONB) IS
  'ADR-093: admin membuat kegiatan StudentFo langsung tayang (kolom = approve_submission). Hanya service_role; pelaku diperiksa ulang.';

REVOKE ALL ON FUNCTION public.admin_create_event(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_event(UUID, JSONB) TO service_role;
