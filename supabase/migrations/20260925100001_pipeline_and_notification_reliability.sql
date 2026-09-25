-- =====================================================================
-- StudentFo — Migration: keandalan pipeline & notifikasi
--
-- 1. Dedup edisi tahunan  (audit P3)
-- 2. Notifikasi tahan cron yang telat  (audit P4)
-- 3. Staging hasil scraping dalam satu transaksi  (audit P7)
--
-- Diuji oleh supabase/tests/20_pipeline_and_notifications.test.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DEDUP: unik hanya di antara event yang MASIH BERLAKU
--
-- Sebelumnya `dedup_hash` UNIQUE mutlak. Hash = judul + penyelenggara, jadi
-- "Gemastik / Kemdikbud" edisi tahun depan bertabrakan dengan edisi tahun
-- ini yang sudah EXPIRED dan tidak pernah bisa masuk antrean lagi.
--
-- Sekarang keunikan berlaku untuk PENDING, APPROVED, dan REJECTED.
-- REJECTED sengaja tetap memblokir: tanpa itu scraper akan memasukkan
-- ulang kiriman yang sudah ditolak admin SETIAP MALAM.
-- ---------------------------------------------------------------------
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_dedup_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS events_dedup_hash_active_key
  ON public.events (dedup_hash)
  WHERE status <> 'EXPIRED';

COMMENT ON INDEX public.events_dedup_hash_active_key IS
  'Dedup hanya di antara event yang belum EXPIRED, agar edisi tahunan berikutnya bisa masuk. Lihat migration 20260925100001.';

-- ---------------------------------------------------------------------
-- 2. NOTIFIKASI: rentang hari, bukan kesamaan persis
--
-- Sebelumnya hanya `days_left IN (3, 1)`. GitHub Actions `schedule` bisa
-- telat atau terlewat; satu hari terlewat = pengingat hilang permanen.
--
--   days_left 2..3 -> DEADLINE_H3   ("ditutup N hari lagi")
--   days_left 0..1 -> DEADLINE_H1   ("besok" / "hari ini")
--
-- Dalam operasi normal hasilnya identik dengan sebelumnya: H3 dibuat pada
-- H-3 dan H1 pada H-1, lalu idx_notifications_dedupe (user, event, tipe)
-- menolak duplikat di hari berikutnya. H-2 dan H-0 hanya menjadi jalur
-- susulan saat run sebelumnya terlewat, atau saat event baru disimpan.
-- Pesan menyebut sisa hari yang SEBENARNYA, bukan angka tetap "3 hari".
--
-- Aturan yang sama dicerminkan di src/lib/notifications.ts (mode demo);
-- ubah keduanya di PR yang sama.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_deadline_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  WITH watched AS (
    SELECT user_id, event_id FROM public.saved_events
    UNION
    SELECT user_id, event_id FROM public.application_tracker
  ),
  due AS (
    SELECT
      w.user_id,
      w.event_id,
      e.title,
      (d.deadline_at AT TIME ZONE 'Asia/Jakarta')::date
        - (NOW() AT TIME ZONE 'Asia/Jakarta')::date AS days_left
    FROM watched w
    JOIN public.events e          ON e.id = w.event_id
    JOIN public.event_deadlines d ON d.event_id = e.id AND d.is_primary
    WHERE e.status = 'APPROVED'
  )
  INSERT INTO public.notifications (user_id, event_id, type, message)
  SELECT
    due.user_id,
    due.event_id,
    CASE WHEN due.days_left >= 2 THEN 'DEADLINE_H3' ELSE 'DEADLINE_H1' END,
    CASE due.days_left
      WHEN 0 THEN 'Hari terakhir — pendaftaran ' || due.title || ' ditutup hari ini.'
      WHEN 1 THEN 'Terakhir — pendaftaran ' || due.title || ' ditutup besok.'
      ELSE        'Pendaftaran ' || due.title || ' ditutup ' || due.days_left || ' hari lagi.'
    END
  FROM due
  WHERE due.days_left BETWEEN 0 AND 3
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_deadline_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_deadline_notifications() TO service_role;

-- ---------------------------------------------------------------------
-- 3. STAGING PIPELINE: satu event = satu transaksi
--
-- Sebelumnya publisher Python menulis events, event_deadlines, dan
-- event_categories dalam tiga request terpisah; gagal di tengah = event
-- PENDING tanpa tenggat. Juga satu query kategori per event (N+1).
--
-- Fungsi ini juga MENEGAKKAN invarian "pipeline tidak pernah menerbitkan"
-- di level database: status selalu PENDING, apa pun isi payload.
-- dedup_hash dihitung di sini (compute_dedup_hash), bukan dipercaya dari
-- klien, sehingga hanya ada SATU implementasi hash yang menentukan.
--
-- Mengembalikan id event baru, atau NULL kalau duplikat event yang masih
-- berlaku (bukan error — duplikat adalah hasil normal scraping harian).
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

  RETURN new_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.stage_scraped_event(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_scraped_event(JSONB) TO service_role;

COMMENT ON FUNCTION public.stage_scraped_event(JSONB) IS
  'Pipeline scraper: tulis satu event PENDING + tenggat + kategori dalam satu transaksi. NULL = duplikat. Hanya service_role.';
