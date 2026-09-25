-- Regresi: pencarian ber-stemming & visibilitas publik event.
-- Setiap blok DO melempar exception kalau asumsinya patah, dan skrip
-- runner berhenti dengan exit code non-nol.
BEGIN;

INSERT INTO public.events
  (title, organizer, description, event_type, registration_link, source_url, status, reviewed_at)
VALUES
  ('Perlombaan Karya Tulis Mahasiswa', 'Kemdikbud', 'Beasiswanya untuk pemenang',
   'LOMBA', 'https://a.example', 'https://a.example', 'APPROVED', now()),
  ('Draft Belum Ditinjau', 'Org', 'rahasia', 'LOMBA',
   'https://b.example', 'https://b.example', 'PENDING', NULL);

DO $$
BEGIN
  -- Konfigurasi yang dipakai index harus sama dengan yang dipakai query
  -- aplikasi (`textSearch(..., { config: 'indonesian' })`).
  IF (SELECT count(*) FROM public.events
      WHERE search_vector @@ websearch_to_tsquery('indonesian', 'lomba')) <> 1 THEN
    RAISE EXCEPTION 'FTS: "lomba" harus menemukan "Perlombaan" (stemming)';
  END IF;
  IF (SELECT count(*) FROM public.events
      WHERE search_vector @@ websearch_to_tsquery('indonesian', 'beasiswa')) <> 1 THEN
    RAISE EXCEPTION 'FTS: "beasiswa" harus menemukan "Beasiswanya"';
  END IF;
END$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE status = 'PENDING') THEN
    RAISE EXCEPTION 'RLS: anon tidak boleh melihat event PENDING';
  END IF;
  IF (SELECT count(*) FROM public.events) <> 1 THEN
    RAISE EXCEPTION 'RLS: anon harus melihat tepat 1 event APPROVED';
  END IF;
END$$;

ROLLBACK;
