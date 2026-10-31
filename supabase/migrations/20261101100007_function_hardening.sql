-- =====================================================================
-- Temuan Security Advisor Supabase di project staging (ADR-062 #8):
--
-- 1. Fungsi TRIGGER handle_new_user() & sync_saved_count() masih bisa
--    dipanggil anon/authenticated lewat /rest/v1/rpc (hak EXECUTE bawaan
--    PUBLIC dari migration 0002, sebelum aturan ADR-020). Postgres menolak
--    pemanggilan langsung fungsi trigger, tapi hak itu tidak boleh ada.
--    Trigger tetap jalan: EXECUTE hanya diperiksa saat CREATE TRIGGER.
-- 2. Empat fungsi tanpa search_path tetap. `extensions` ikut disebut karena
--    di Supabase pgcrypto (digest) ada di schema itu; di Postgres polos
--    schema yang tidak ada diabaikan.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_saved_count() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.slugify(TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.compute_dedup_hash(TEXT, TEXT) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.events_fill_derived() SET search_path = public, extensions, pg_temp;
