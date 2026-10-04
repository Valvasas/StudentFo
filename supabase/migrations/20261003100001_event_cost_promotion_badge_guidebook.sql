-- =====================================================================
-- Atribut kegiatan baru: biaya, promosi berbayar, lencana otoritas
-- penyelenggara, dan buku panduan (ADR-049).
--
-- Penyimpangan sadar dari brief (alasan lengkap di DECISION.md ADR-049):
--   * `is_free` NULLABLE tanpa default, BUKAN `DEFAULT true`. Event hasil
--     scraping tidak pernah menyebut biaya secara terstruktur; default true
--     berarti setiap kegiatan berbayar tampil berlencana "Gratis" — persis
--     kebohongan yang paling merugikan pengguna yang sensitif biaya.
--     NULL = belum diketahui, dan UI tidak menampilkan lencana apa pun.
--   * `price_amount` NULLABLE, bukan `DEFAULT 0`: "0" untuk kegiatan
--     berbayar yang nominalnya belum diumumkan sama salahnya.
--   * `verification_badge` VARCHAR + CHECK, bukan enum Postgres — pola yang
--     sama dengan status penyelenggara (ADR-042). Pipeline tidak pernah
--     menulisnya, jadi aturan paritas tiga tempat (AGENTS.md §2) tidak
--     berlaku; daftar nilainya cukup sama dengan `VERIFICATION_BADGES` di
--     src/types/domain.ts.
-- =====================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN,
  ADD COLUMN IF NOT EXISTS price_amount NUMERIC(12, 0),
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_badge VARCHAR(20),
  ADD COLUMN IF NOT EXISTS guidebook_url TEXT;

-- Nominal hanya bermakna untuk kegiatan berbayar. Gratis + nominal > 0, atau
-- nominal tanpa status biaya, adalah data yang saling membantah — lebih baik
-- ditolak di sini daripada dirender sebagai "Gratis · Rp 150.000".
ALTER TABLE public.events
  ADD CONSTRAINT events_price_consistent CHECK (
    price_amount IS NULL OR (is_free IS FALSE AND price_amount > 0 AND price_amount <= 1000000000)
  );

-- Promosi berbayar selalu punya akhir. "Tayang di atas selamanya" tanpa
-- tanggal adalah kontrak yang tidak pernah disepakati siapa pun.
ALTER TABLE public.events
  ADD CONSTRAINT events_featured_has_end CHECK (NOT is_featured OR featured_until IS NOT NULL);

ALTER TABLE public.events
  ADD CONSTRAINT events_verification_badge_known CHECK (
    verification_badge IS NULL OR verification_badge IN ('OFFICIAL_GOV', 'CAMPUS_VERIFIED', 'COMMUNITY')
  );

-- https saja: halaman detail menyematkan PDF ini dalam <iframe>, dan
-- konten http di halaman https diblokir browser (mixed content) — tautan
-- http hanya akan menghasilkan kotak kosong.
ALTER TABLE public.events
  ADD CONSTRAINT events_guidebook_url_https CHECK (
    guidebook_url IS NULL OR (guidebook_url ~* '^https://' AND char_length(guidebook_url) <= 2000)
  );

-- Diminta brief, dan memang melayani query nyata: halaman admin
-- "Lencana & promosi" mendaftar promosi yang sedang/akan berjalan
-- (`WHERE is_featured`), dan jumlah baris itu selalu kecil dibanding
-- katalog — index parsial menyimpan hanya baris berpromosi.
CREATE INDEX IF NOT EXISTS idx_events_featured
  ON public.events (is_featured, featured_until)
  WHERE is_featured = TRUE;

-- Kolom baru ditambahkan DI AKHIR: CREATE OR REPLACE VIEW hanya sah bila
-- kolom lama tetap di posisi, nama, dan tipe yang sama (lihat 20260930100001).
--
-- `is_promoted` dihitung di view karena bergantung pada `now()`. Aturannya
-- dicerminkan `isPromoted()` di src/lib/data/listing.ts — ubah keduanya
-- bersamaan. Promosi tidak pernah mengangkat kegiatan yang sudah tutup:
-- iklan untuk pendaftaran yang tidak bisa diikuti = uang mitra terbuang dan
-- pengguna tertipu.
CREATE OR REPLACE VIEW public.events_listing
WITH (security_invoker = on) AS
SELECT
  e.id,
  e.slug,
  e.title,
  e.organizer,
  e.description,
  e.event_type,
  e.registration_link,
  e.source_url,
  e.education_levels,
  e.location,
  e.is_online,
  e.status,
  e.saved_count,
  e.created_at,
  d.deadline_at AS primary_deadline_at,
  d.label       AS primary_deadline_label,
  e.category_slugs,
  e.search_vector,
  e.is_free,
  e.price_amount,
  e.is_featured,
  e.featured_until,
  e.verification_badge,
  e.guidebook_url,
  (
    e.is_featured
    AND e.featured_until > NOW()
    AND e.status = 'APPROVED'
    AND (d.deadline_at IS NULL OR d.deadline_at >= NOW())
  ) AS is_promoted
FROM events e
LEFT JOIN event_deadlines d ON d.event_id = e.id AND d.is_primary;

-- ---------------------------------------------------------------------
-- approve_submission(): salin biaya & buku panduan dari kiriman.
-- Isi lain identik dengan versi 20260928110001. Kontak penyelenggara dan
-- tautan bukti TIDAK disalin — keduanya bahan verifikasi moderator, bukan
-- informasi publik (kontak bisa berupa nomor WhatsApp pribadi panitia).
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
    is_free, price_amount, guidebook_url
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
    NULLIF(p ->> 'guidebook_url', '')
  )
  RETURNING id INTO new_event_id;

  INSERT INTO public.event_deadlines (event_id, label, deadline_at, is_primary)
  VALUES (new_event_id, 'registration', (p ->> 'deadline_at')::TIMESTAMPTZ, TRUE);

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
