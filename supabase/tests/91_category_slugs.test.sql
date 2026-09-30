-- `events.category_slugs` adalah turunan `event_categories` (migration
-- 20260930100001). Yang dikunci di sini: kolom selalu cermin relasi, tulisan
-- langsung tidak bisa membuatnya berbohong, dan filter bidang lewat view
-- benar-benar memakai index GIN (tujuan migration itu sejak awal).
BEGIN;
INSERT INTO public.events (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at)
VALUES ('00000000-0000-0000-0000-0000000000c1', 'Lomba Kategori', 'Kampus', 'LOMBA', 'https://c.example', 'https://c.example', 'APPROVED', now());

INSERT INTO public.event_categories (event_id, category_id)
SELECT '00000000-0000-0000-0000-0000000000c1', id FROM public.categories WHERE slug IN ('teknologi', 'desain');

DO $$
BEGIN
  IF (SELECT category_slugs FROM public.events WHERE id = '00000000-0000-0000-0000-0000000000c1')
     IS DISTINCT FROM ARRAY['desain', 'teknologi']::VARCHAR[] THEN
    RAISE EXCEPTION 'INSERT event_categories harus mengisi category_slugs terurut';
  END IF;
END$$;

DELETE FROM public.event_categories
WHERE event_id = '00000000-0000-0000-0000-0000000000c1'
  AND category_id = (SELECT id FROM public.categories WHERE slug = 'desain');

DO $$
BEGIN
  IF (SELECT category_slugs FROM public.events WHERE id = '00000000-0000-0000-0000-0000000000c1')
     IS DISTINCT FROM ARRAY['teknologi']::VARCHAR[] THEN
    RAISE EXCEPTION 'DELETE event_categories harus memperbarui category_slugs';
  END IF;
END$$;

UPDATE public.events SET category_slugs = ARRAY['palsu']::VARCHAR[] WHERE id = '00000000-0000-0000-0000-0000000000c1';

DO $$
BEGIN
  IF (SELECT category_slugs FROM public.events WHERE id = '00000000-0000-0000-0000-0000000000c1')
     IS DISTINCT FROM ARRAY['teknologi']::VARCHAR[] THEN
    RAISE EXCEPTION 'tulisan langsung ke category_slugs harus diabaikan dan dihitung ulang';
  END IF;
END$$;

UPDATE public.categories SET slug = 'teknologi-it' WHERE slug = 'teknologi';

DO $$
BEGIN
  IF (SELECT category_slugs FROM public.events WHERE id = '00000000-0000-0000-0000-0000000000c1')
     IS DISTINCT FROM ARRAY['teknologi-it']::VARCHAR[] THEN
    RAISE EXCEPTION 'ganti slug kategori harus ikut memperbarui event';
  END IF;
END$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.events_listing WHERE category_slugs && ARRAY['teknologi-it']::VARCHAR[]) <> 1 THEN
    RAISE EXCEPTION 'filter bidang lewat events_listing harus menemukan event';
  END IF;
END$$;
RESET ROLE;

-- seqscan dimatikan supaya hasilnya tidak bergantung pada ukuran tabel uji
-- yang kecil: yang diuji adalah apakah index BISA dipakai lewat view.
SET LOCAL enable_seqscan = off;
DO $$
DECLARE
  line TEXT;
  plan TEXT := '';
BEGIN
  FOR line IN EXECUTE
    'EXPLAIN SELECT id FROM public.events_listing WHERE category_slugs && ARRAY[''teknologi-it'']::VARCHAR[]'
  LOOP
    plan := plan || line || E'\n';
  END LOOP;
  IF plan NOT LIKE '%idx_events_category_slugs%' THEN
    RAISE EXCEPTION 'filter bidang lewat events_listing tidak memakai idx_events_category_slugs:%', E'\n' || plan;
  END IF;
END$$;
RESET enable_seqscan;

-- Hapus event: CASCADE ke event_categories tidak boleh gagal karena trigger
-- sinkron mencoba memperbarui baris yang sedang dihapus.
DELETE FROM public.events WHERE id = '00000000-0000-0000-0000-0000000000c1';
ROLLBACK;
