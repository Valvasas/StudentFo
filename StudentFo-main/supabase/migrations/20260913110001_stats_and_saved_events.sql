-- =====================================================================
-- Migration 0006: stats_and_saved_events
--
-- Menambahkan:
-- 1. RPC `get_distinct_organizer_count()` untuk getStats() di
--    SupabaseEventRepository (menyelesaikan backlog Phase 1 di TASKS.md:
--    COUNT(DISTINCT organizer) untuk organizerCount yang sebelumnya 0).
-- 2. Memastikan hak akses execute RPC untuk anon, authenticated, dan service_role.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_distinct_organizer_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(DISTINCT organizer)::integer
  FROM public.events
  WHERE status = 'APPROVED';
$$;

COMMENT ON FUNCTION public.get_distinct_organizer_count() IS
  'Menghitung jumlah penyelenggara unik yang memiliki event aktif (status APPROVED). Dipakai oleh SupabaseEventRepository.getStats().';

GRANT EXECUTE ON FUNCTION public.get_distinct_organizer_count() TO anon, authenticated, service_role;

