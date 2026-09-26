-- Regresi: SupabaseEventRepository.listEvents memfilter
-- `events_listing.search_vector` (textSearch). View tanpa kolom itu membuat
-- SETIAP pencarian di produksi gagal dengan 42703 → "Gagal memuat daftar
-- event". Ditemukan oleh integration test (npm run test:integration).
BEGIN;
INSERT INTO public.events (title, organizer, description, event_type, registration_link, source_url, status, reviewed_at)
VALUES ('Perlombaan Desain Poster', 'Kampus', NULL, 'LOMBA', 'https://a.example', 'https://a.example', 'APPROVED', now());

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.events_listing
      WHERE search_vector @@ websearch_to_tsquery('indonesian', 'lomba desain')) <> 1 THEN
    RAISE EXCEPTION 'events_listing.search_vector harus bisa dicari anon (stemming indonesian)';
  END IF;
END$$;
ROLLBACK;
