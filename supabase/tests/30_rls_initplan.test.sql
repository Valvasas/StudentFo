-- Regresi: policy RLS memanggil auth.uid()/is_admin() lewat subquery
-- skalar `(select …)` supaya Postgres mengevaluasinya SEKALI per query
-- (InitPlan), bukan sekali per baris yang dipindai.
BEGIN;

-- 1) Audit statis: setiap kemunculan auth.uid() / is_admin() di policy
--    public harus berada di dalam `SELECT …`.
DO $$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(format('%s.%s', tablename, policyname), ', ')
    INTO offenders
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (length(coalesce(qual, '') || coalesce(with_check, ''))
        - length(replace(coalesce(qual, '') || coalesce(with_check, ''), 'auth.uid()', ''))) / length('auth.uid()')
      <>
      (length(coalesce(qual, '') || coalesce(with_check, ''))
        - length(replace(coalesce(qual, '') || coalesce(with_check, ''), 'SELECT auth.uid()', ''))) / length('SELECT auth.uid()')
      OR
      (length(coalesce(qual, '') || coalesce(with_check, ''))
        - length(replace(coalesce(qual, '') || coalesce(with_check, ''), 'is_admin()', ''))) / length('is_admin()')
      <>
      (length(coalesce(qual, '') || coalesce(with_check, ''))
        - length(replace(coalesce(qual, '') || coalesce(with_check, ''), 'SELECT is_admin()', ''))) / length('SELECT is_admin()')
    );

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'RLS per-baris: auth.uid()/is_admin() tanpa (select …) di: %', offenders;
  END IF;
END$$;

-- 2) Bukti dinamis: rencana eksekusi benar-benar memakai InitPlan.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000000a1', 'a@example.com');
INSERT INTO public.events
  (id, title, organizer, event_type, registration_link, source_url, status, reviewed_at)
VALUES
  ('00000000-0000-4000-8000-0000000000e1', 'Lomba InitPlan', 'Org', 'LOMBA',
   'https://x.example', 'https://x.example', 'APPROVED', now());
INSERT INTO public.saved_events (user_id, event_id)
VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1');

CREATE TEMP TABLE plan_lines (tbl TEXT, line TEXT) ON COMMIT DROP;
GRANT ALL ON plan_lines TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
-- Paksa seq scan: dengan index scan, pembanding auth.uid() dievaluasi sekali
-- sebagai kunci index baik dibungkus maupun tidak — justru di seq scan (tabel
-- kecil, filter non-index) perbedaan per-baris vs InitPlan terlihat.
SET LOCAL enable_indexscan = off;
SET LOCAL enable_bitmapscan = off;

DO $$
DECLARE
  target TEXT;
  r RECORD;
BEGIN
  FOREACH target IN ARRAY ARRAY['saved_events', 'application_tracker', 'notifications', 'users'] LOOP
    FOR r IN EXECUTE format('EXPLAIN (FORMAT TEXT) SELECT * FROM public.%I', target) LOOP
      INSERT INTO plan_lines VALUES (target, r."QUERY PLAN");
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM plan_lines WHERE tbl = target AND line ~ 'InitPlan') THEN
      RAISE EXCEPTION 'RLS %: rencana tanpa InitPlan — auth.uid() dievaluasi per baris:%',
        target, (SELECT string_agg(line, E'\n') FROM plan_lines WHERE tbl = target);
    END IF;
  END LOOP;
END$$;

ROLLBACK;
