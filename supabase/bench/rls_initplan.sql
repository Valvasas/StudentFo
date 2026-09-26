-- Benchmark RLS InitPlan (tidak dijalankan db:test). Pakai pada database uji
-- hasil `KEEP_DB=1 npm run db:test`:
--   psql …/studentfo_migration_test -f supabase/bench/rls_initplan.sql
-- Hasil 2026-09-26 (PG16, 100k baris, seq scan): 41.9 ms → 5.0 ms.
BEGIN;
INSERT INTO auth.users (id, email) SELECT gen_random_uuid(), 'u'||g||'@x' FROM generate_series(1,500) g;
INSERT INTO public.events (title, organizer, event_type, registration_link, source_url, status, reviewed_at)
  SELECT 'E'||g, 'O'||g, 'LOMBA', 'https://x.example', 'https://x.example', 'APPROVED', now() FROM generate_series(1,200) g;
INSERT INTO public.saved_events (user_id, event_id)
  SELECT u.id, e.id FROM public.users u CROSS JOIN public.events e;
ANALYZE public.saved_events;
SELECT count(*) AS rows_total FROM public.saved_events;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000000';
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM public.users LIMIT 1), true);
SET LOCAL ROLE authenticated;
SET LOCAL enable_indexscan = off; SET LOCAL enable_bitmapscan = off;
\echo '--- SESUDAH (select auth.uid())'
EXPLAIN (ANALYZE, COSTS OFF, TIMING ON, SUMMARY ON) SELECT count(*) FROM public.saved_events;
RESET ROLE;
ALTER POLICY saved_events_own ON public.saved_events USING (auth.uid() = user_id);
SET LOCAL ROLE authenticated;
\echo '--- SEBELUM auth.uid() telanjang'
EXPLAIN (ANALYZE, COSTS OFF, TIMING ON, SUMMARY ON) SELECT count(*) FROM public.saved_events;
ROLLBACK;
