-- =====================================================================
-- `events.category_slugs`: kategori sebagai kolom fisik ber-index GIN.
--
-- Sebelumnya `events_listing.category_slugs` adalah subquery skalar
-- (array_agg dari event_categories ⨝ categories) yang dihitung ULANG untuk
-- setiap baris. Filter bidang di /events (`.overlaps('category_slugs', …)`
-- → `category_slugs && '{…}'`) jadi tidak bisa memakai index apa pun:
-- Postgres harus menghitung array itu untuk SEMUA event tayang, baru
-- membuang yang tidak cocok. Biayanya tumbuh linear dengan jumlah event,
-- dan dibayar di setiap kombinasi filter yang tidak kena cache.
--
-- Denormalisasi (CONVENTIONS.md: wajib beralasan) — sumber kebenaran tetap
-- `event_categories`. Kolom ini TURUNAN dan dijaga dua trigger:
--   1. perubahan `event_categories` / `categories.slug` → hitung ulang event
--      yang terdampak;
--   2. tulisan langsung ke `events.category_slugs` → DIABAIKAN dan dihitung
--      ulang dari tabel relasi. Tanpa ini admin/pipeline bisa menulis nilai
--      yang tidak cocok dengan relasi, dan filter bidang diam-diam berbohong.
-- =====================================================================

-- VARCHAR[], bukan TEXT[]: kolom view lama bertipe `character varying[]`
-- (array_agg atas categories.slug). Tipe yang sama membuat CREATE OR
-- REPLACE VIEW di bawah sah tanpa DROP, dan tanpa cast di view — cast di
-- atas kolom membuat `category_slugs && …` tidak lagi cocok dengan index.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS category_slugs VARCHAR[] NOT NULL DEFAULT '{}';

-- Urutan slug sama dengan view lama (ORDER BY c.slug) supaya keluaran API
-- tidak berubah bentuk.
CREATE OR REPLACE FUNCTION public.event_category_slugs(p_event UUID)
RETURNS VARCHAR[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(c.slug::VARCHAR ORDER BY c.slug), '{}')
  FROM public.event_categories ec
  JOIN public.categories c ON c.id = ec.category_id
  WHERE ec.event_id = p_event
$$;

REVOKE ALL ON FUNCTION public.event_category_slugs(UUID) FROM PUBLIC, anon, authenticated;

-- Trigger 2: kolom selalu cermin relasi, siapa pun penulisnya.
CREATE OR REPLACE FUNCTION public.events_derive_category_slugs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.category_slugs := public.event_category_slugs(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.events_derive_category_slugs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_events_derive_category_slugs ON public.events;
CREATE TRIGGER trg_events_derive_category_slugs
  BEFORE INSERT OR UPDATE OF category_slugs ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_derive_category_slugs();

-- Trigger 1a: relasi event ↔ kategori berubah.
--
-- SECURITY DEFINER karena penulis `event_categories` (RPC penyelenggara,
-- pipeline) belum tentu punya hak UPDATE atas baris `events`. `IS DISTINCT
-- FROM` mencegah UPDATE kosong yang tetap akan menaikkan `updated_at` lewat
-- trg_events_touch. Saat event dihapus, baris event_categories ikut terhapus
-- (CASCADE) dan UPDATE di sini tidak menemukan baris — itu benar, bukan galat.
CREATE OR REPLACE FUNCTION public.sync_event_category_slugs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.events e
    SET category_slugs = public.event_category_slugs(e.id)
    WHERE e.id = OLD.event_id
      AND e.category_slugs IS DISTINCT FROM public.event_category_slugs(e.id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
    UPDATE public.events e
    SET category_slugs = public.event_category_slugs(e.id)
    WHERE e.id = NEW.event_id
      AND e.category_slugs IS DISTINCT FROM public.event_category_slugs(e.id);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_event_category_slugs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_event_categories_sync_slugs ON public.event_categories;
CREATE TRIGGER trg_event_categories_sync_slugs
  AFTER INSERT OR UPDATE OR DELETE ON public.event_categories
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_category_slugs();

-- Trigger 1b: slug kategori diganti (mis. 'karya-tulis' → 'esai'). Tanpa ini
-- semua event di kategori itu hilang dari filter bidang yang baru.
CREATE OR REPLACE FUNCTION public.sync_category_slug_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.events e
  SET category_slugs = public.event_category_slugs(e.id)
  WHERE e.id IN (SELECT ec.event_id FROM public.event_categories ec WHERE ec.category_id = NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_category_slug_rename() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_categories_sync_slug_rename ON public.categories;
CREATE TRIGGER trg_categories_sync_slug_rename
  AFTER UPDATE OF slug ON public.categories
  FOR EACH ROW
  WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION public.sync_category_slug_rename();

-- Backfill satu kali. Menulis kolom memicu trigger 2, yang menghitung nilai
-- sebenarnya — nilai di SET hanya pemicu. Dibatasi ke event yang punya
-- kategori supaya event tanpa kategori tidak ikut di-UPDATE (dan tidak
-- menaikkan `updated_at`-nya tanpa alasan).
UPDATE public.events e
SET category_slugs = '{}'
WHERE EXISTS (SELECT 1 FROM public.event_categories ec WHERE ec.event_id = e.id);

-- Melayani `category_slugs && ARRAY[…]` (filter bidang di /events). Tidak
-- partial: view dipanggil juga oleh admin untuk status selain APPROVED.
CREATE INDEX IF NOT EXISTS idx_events_category_slugs ON public.events USING GIN (category_slugs);

-- Nama, tipe, dan posisi kolom identik dengan 20260926150001 → CREATE OR
-- REPLACE sah tanpa DROP; hak akses dan security_invoker tetap utuh.
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
  e.search_vector
FROM events e
LEFT JOIN event_deadlines d ON d.event_id = e.id AND d.is_primary;
