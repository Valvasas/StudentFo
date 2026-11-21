-- Impor media otomatis ke antrean moderasi (ADR-095): daftar bawaan dari
-- stage_scraped_event, entri cacat dilewati, batas 8, klaim bersewa, dan
-- tabelnya tertutup untuk klien. Cermin: src/lib/media-import/process.test.ts.
BEGIN;

-- 1. Pipeline tanpa `media` → daftar bawaan (laman sumber + 4 gambar buatan).
SELECT public.stage_scraped_event(jsonb_build_object(
  'title', 'Lomba Media Otomatis', 'organizer', 'Himpunan Media',
  'event_type', 'LOMBA', 'registration_link', 'https://daftar.example/m1',
  'source_url', 'https://sumber.example/m1',
  'deadlines', jsonb_build_array(jsonb_build_object('label', 'registration', 'deadline_at', '2030-01-01T00:00:00Z', 'is_primary', true))
));
DO $$
DECLARE
  v_event UUID := (SELECT id FROM public.events WHERE title = 'Lomba Media Otomatis');
BEGIN
  IF (SELECT array_agg(kind || ':' || COALESCE(source_url, spec ->> 'template') ORDER BY position)
      FROM public.event_media_imports WHERE event_id = v_event)
     IS DISTINCT FROM ARRAY['URL:https://sumber.example/m1', 'GENERATED:poster', 'GENERATED:syarat', 'GENERATED:jadwal', 'GENERATED:cara-daftar'] THEN
    RAISE EXCEPTION 'daftar bawaan harus: laman sumber, poster, syarat, jadwal, cara-daftar';
  END IF;
  IF (SELECT array_agg(is_poster ORDER BY position) FROM public.event_media_imports WHERE event_id = v_event)
     IS DISTINCT FROM ARRAY[true, true, false, false, false] THEN
    RAISE EXCEPTION 'gambar resmi lalu poster buatan sama-sama calon poster';
  END IF;
END$$;

-- 2. `media: []` = sengaja tanpa media; entri cacat dilewati, maksimal 8.
SELECT public.stage_scraped_event(jsonb_build_object(
  'title', 'Lomba Tanpa Media', 'organizer', 'Himpunan Media',
  'event_type', 'LOMBA', 'registration_link', 'https://daftar.example/m2', 'source_url', 'https://sumber.example/m2',
  'media', '[]'::JSONB,
  'deadlines', jsonb_build_array(jsonb_build_object('label', 'registration', 'deadline_at', '2030-01-01T00:00:00Z', 'is_primary', true))
));
SELECT public.stage_scraped_event(jsonb_build_object(
  'title', 'Lomba Media Campur', 'organizer', 'Himpunan Media',
  'event_type', 'LOMBA', 'registration_link', 'https://daftar.example/m3', 'source_url', 'https://sumber.example/m3',
  'media', jsonb_build_array(
    jsonb_build_object('url', 'http://tidak-aman.example/a.jpg'),
    jsonb_build_object('url', 'javascript:alert(1)'),
    jsonb_build_object('spec', jsonb_build_object('template', 'tak-dikenal')),
    '"bukan objek"'::JSONB,
    jsonb_build_object('url', 'https://cdn.example/poster.jpg', 'is_poster', true, 'caption', E'  Poster\tresmi  '),
    jsonb_build_object('spec', jsonb_build_object('template', 'jadwal', 'rows', jsonb_build_array(jsonb_build_array('Daftar', '1 Jan')))),
    jsonb_build_object('url', 'https://cdn.example/2.jpg'), jsonb_build_object('url', 'https://cdn.example/3.jpg'),
    jsonb_build_object('url', 'https://cdn.example/4.jpg'), jsonb_build_object('url', 'https://cdn.example/5.jpg'),
    jsonb_build_object('url', 'https://cdn.example/6.jpg'), jsonb_build_object('url', 'https://cdn.example/7.jpg'),
    jsonb_build_object('url', 'https://cdn.example/8-lebih.jpg')
  ),
  'deadlines', jsonb_build_array(jsonb_build_object('label', 'registration', 'deadline_at', '2030-01-01T00:00:00Z', 'is_primary', true))
));
DO $$
DECLARE
  v_campur UUID := (SELECT id FROM public.events WHERE title = 'Lomba Media Campur');
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_media_imports i JOIN public.events e ON e.id = i.event_id WHERE e.title = 'Lomba Tanpa Media') THEN
    RAISE EXCEPTION 'media: [] tidak boleh memunculkan daftar bawaan';
  END IF;
  IF (SELECT count(*) FROM public.event_media_imports WHERE event_id = v_campur) <> 8 THEN
    RAISE EXCEPTION 'maksimal 8 media per kegiatan, entri cacat dilewati';
  END IF;
  IF (SELECT source_url || '|' || caption || '|' || is_poster FROM public.event_media_imports WHERE event_id = v_campur AND position = 0)
     IS DISTINCT FROM 'https://cdn.example/poster.jpg|Poster resmi|true' THEN
    RAISE EXCEPTION 'entri sah pertama di posisi 0 dengan keterangan dirapikan';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_media_imports WHERE source_url LIKE '%8-lebih%' OR source_url LIKE 'http:%') THEN
    RAISE EXCEPTION 'entri ke-9 dan URL non-https harus dilewati';
  END IF;
  -- Menambah lagi tidak melewati batas 8.
  IF public.stage_event_media(v_campur, jsonb_build_array(jsonb_build_object('url', 'https://cdn.example/9.jpg'))) <> 0 THEN
    RAISE EXCEPTION 'kegiatan yang sudah 8 media tidak menerima tambahan';
  END IF;
END$$;

-- 3. Klaim: bersewa, tidak diklaim dua kali selama sewa, batas per panggilan.
DO $$
DECLARE
  v_first INTEGER;
  v_second INTEGER;
BEGIN
  SELECT count(*) INTO v_first FROM public.claim_event_media_imports(3);
  SELECT count(*) INTO v_second FROM public.claim_event_media_imports(50);
  IF v_first <> 3 THEN
    RAISE EXCEPTION 'klaim pertama harus 3 baris, dapat %', v_first;
  END IF;
  IF v_second <> 10 THEN
    RAISE EXCEPTION 'klaim kedua harus sisa 10 baris (13 - 3), dapat %', v_second;
  END IF;
  IF EXISTS (SELECT 1 FROM public.claim_event_media_imports(50)) THEN
    RAISE EXCEPTION 'baris bersewa tidak boleh diklaim lagi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_media_imports WHERE attempts <> 1 OR claimed_at IS NULL) THEN
    RAISE EXCEPTION 'klaim menaikkan attempts dan mengisi claimed_at';
  END IF;
  -- Sewa habis → bisa diklaim lagi.
  UPDATE public.event_media_imports SET claimed_at = NOW() - INTERVAL '11 minutes' WHERE position = 0;
  IF (SELECT count(*) FROM public.claim_event_media_imports(50)) <> 2 THEN
    RAISE EXCEPTION 'baris yang sewanya habis harus bisa diklaim ulang';
  END IF;
END$$;

-- 4. CHECK: sumber harus cocok dengan jenisnya.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.event_media_imports (event_id, position, kind, source_url)
    SELECT id, 7, 'GENERATED', 'https://x.example/a.jpg' FROM public.events WHERE title = 'Lomba Tanpa Media';
    RAISE EXCEPTION 'GENERATED tanpa spec harus ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END$$;

-- 5. Tertutup untuk klien: tabel dan fungsinya.
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.event_media_imports LIMIT 1;
    RAISE EXCEPTION 'authenticated tidak boleh membaca event_media_imports';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.claim_event_media_imports(1);
    RAISE EXCEPTION 'authenticated tidak boleh mengklaim impor';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.stage_event_media(gen_random_uuid(), NULL);
    RAISE EXCEPTION 'authenticated tidak boleh mengantrekan media';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.event_media_imports LIMIT 1;
    RAISE EXCEPTION 'anon tidak boleh membaca event_media_imports';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

ROLLBACK;
