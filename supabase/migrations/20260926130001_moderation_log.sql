-- =====================================================================
-- Log moderasi append-only.
--
-- Kenapa bukan cukup `events.reviewed_by/reviewed_at`: kolom itu hanya
-- menyimpan keputusan TERAKHIR. Admin B yang membalik keputusan admin A
-- menghapus jejak A; job expiry dan edit lewat SQL editor tidak meninggalkan
-- jejak sama sekali. Log diisi TRIGGER, jadi setiap perubahan status tercatat
-- dari jalur mana pun — aplikasi tidak bisa "lupa mencatat".
--
-- Aktor = `reviewed_by` HANYA kalau baris itu juga mengubah `reviewed_at`
-- (tanda keputusan manusia lewat aplikasi). Perubahan tanpa itu (expiry,
-- SQL manual) tercatat dengan aktor NULL = "sistem / di luar aplikasi",
-- bukan diatribusikan diam-diam ke peninjau sebelumnya.
-- =====================================================================

-- Kiriman komunitas belum punya jejak peninjau sama sekali.
ALTER TABLE public.ugc_submissions
  ADD COLUMN reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at TIMESTAMPTZ;
-- Hak INSERT anon/authenticated di tabel ini per KOLOM (0008) — kolom baru
-- otomatis TIDAK termasuk, jadi tamu tidak bisa mengisi peninjau palsu.

CREATE TABLE public.moderation_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('event', 'submission')),
  subject_id   UUID NOT NULL,
  -- Salinan judul saat itu: event bisa diganti judulnya/dihapus kemudian.
  title        TEXT NOT NULL CHECK (length(title) <= 300),
  from_status  event_status,
  to_status    event_status NOT NULL,
  actor_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason       TEXT CHECK (length(reason) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Satu-satunya pola baca: riwayat terbaru, opsional per subjek.
CREATE INDEX idx_moderation_log_recent ON public.moderation_log (created_at DESC);
CREATE INDEX idx_moderation_log_subject ON public.moderation_log (subject_id, created_at DESC);

ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY moderation_log_admin_read ON public.moderation_log
  FOR SELECT USING ((select public.is_admin()));

-- Append-only: tidak ada yang boleh mengubah/menghapus riwayat lewat API,
-- termasuk service_role (yang mem-bypass RLS tapi tetap tunduk pada GRANT).
REVOKE ALL ON public.moderation_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.moderation_log TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_moderation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_status event_status;
  human      BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Kiriman/scrape baru masuk antrean bukan keputusan moderasi.
    IF NEW.status = 'PENDING' THEN RETURN NULL; END IF;
    old_status := NULL;
    human := TRUE;
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
    old_status := OLD.status;
    human := NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at;
  END IF;

  INSERT INTO public.moderation_log (subject_type, subject_id, title, from_status, to_status, actor_id, reason)
  VALUES (
    TG_ARGV[0],
    NEW.id,
    left(COALESCE(
      CASE WHEN TG_ARGV[0] = 'event' THEN to_jsonb(NEW) ->> 'title' ELSE to_jsonb(NEW) -> 'payload' ->> 'title' END,
      '(tanpa judul)'
    ), 300),
    old_status,
    NEW.status,
    CASE WHEN human THEN (to_jsonb(NEW) ->> 'reviewed_by')::UUID END,
    CASE WHEN NEW.status = 'REJECTED' THEN left(to_jsonb(NEW) ->> 'rejection_reason', 500) END
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_moderation_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_events_moderation_log
  AFTER INSERT OR UPDATE OF status ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.log_moderation_change('event');

CREATE TRIGGER trg_ugc_submissions_moderation_log
  AFTER INSERT OR UPDATE OF status ON public.ugc_submissions
  FOR EACH ROW EXECUTE FUNCTION public.log_moderation_change('submission');

-- approve_submission() identik dengan versi 0008, ditambah jejak peninjau
-- di baris kiriman.
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

  -- slug & dedup_hash diisi trigger events_fill_derived().
  INSERT INTO public.events (
    title, organizer, description, event_type, registration_link, source_url,
    education_levels, location, is_online, status, reviewed_by, reviewed_at
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
    NOW()
  )
  RETURNING id INTO new_event_id;

  INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
  VALUES (new_event_id, 'registration', (p ->> 'deadline_at')::TIMESTAMPTZ, TRUE);

  -- Slug kategori yang tidak dikenal diabaikan, bukan menggagalkan persetujuan.
  INSERT INTO public.event_categories (event_id, category_id)
  SELECT new_event_id, c.id
  FROM public.categories c
  WHERE c.slug IN (
    SELECT jsonb_array_elements_text(COALESCE(p -> 'category_slugs', '[]'::JSONB))
  );

  UPDATE public.ugc_submissions
  SET status = 'APPROVED', reviewed_by = p_reviewer_id, reviewed_at = NOW()
  WHERE id = p_submission_id;

  RETURN new_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_submission(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_submission(UUID, UUID) TO service_role;
