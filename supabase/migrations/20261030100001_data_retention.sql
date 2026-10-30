-- =====================================================================
-- Retensi data (ADR-060) — angka disetujui pemilik 2026-09-30
-- (docs/rencana-produksi.md § 5.1), kini dijalankan, bukan hanya ditulis.
--
-- UU 27/2022 (PDP) Pasal 43–44: data pribadi dihapus/dimusnahkan setelah
-- masa retensinya habis. Kebijakan privasi menyebut angka-angka ini; tanpa
-- job di bawah, pernyataan itu tidak benar.
--
--   notifications   : sudah dibaca > 180 hari, atau apa pun > 365 hari → DELETE
--   ugc_submissions : email pengirim kiriman yang sudah diputuskan
--                     > 90 hari → diganti penanda tetap (bukan NULL)
--
-- Kenapa penanda, bukan NULL: kolom `submitted_by_email` NOT NULL dan
-- dipakai kontrak tipe (Submission.submittedByEmail: string) di aplikasi.
-- `.invalid` dicadangkan RFC 2606 — tidak pernah bisa dikirimi email — dan
-- tetap lolos CHECK `ugc_submissions_email_shape`. Kiriman PENDING tidak
-- pernah disentuh: moderator masih butuh kontaknya.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.purge_old_notifications() RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH gone AS (
    DELETE FROM public.notifications
    WHERE (is_read AND sent_at < now() - interval '180 days')
       OR sent_at < now() - interval '365 days'
    RETURNING 1
  )
  SELECT count(*)::int FROM gone;
$$;

CREATE OR REPLACE FUNCTION public.redact_decided_submission_emails() RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH redacted AS (
    UPDATE public.ugc_submissions
    SET submitted_by_email = 'dihapus@retensi.invalid'
    WHERE status <> 'PENDING'
      -- Baris dari sebelum `reviewed_at` ada (migration 20260926130001) jatuh ke created_at.
      AND coalesce(reviewed_at, created_at) < now() - interval '90 days'
      AND submitted_by_email <> 'dihapus@retensi.invalid'
    RETURNING 1
  )
  SELECT count(*)::int FROM redacted;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redact_decided_submission_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_notifications() TO service_role;
GRANT EXECUTE ON FUNCTION public.redact_decided_submission_emails() TO service_role;

-- Penjaga yang sama dengan 20260926120001: tanpa pg_cron hanya NOTICE.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     OR coalesce(current_setting('shared_preload_libraries', true), '') NOT LIKE '%pg_cron%'
     OR coalesce(current_setting('cron.database_name', true), 'postgres') <> current_database() THEN
    RAISE NOTICE 'pg_cron tidak tersedia — jadwalkan purge_old_notifications() dan redact_decided_submission_emails() dari luar.';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;
  -- 01:29 dan 01:41 WIB: menit ganjil, tidak berebut dengan job harian lain.
  PERFORM cron.schedule('studentfo-purge-old-notifications', '29 18 * * *', 'SELECT public.purge_old_notifications()');
  PERFORM cron.schedule('studentfo-redact-submission-emails', '41 18 * * *', 'SELECT public.redact_decided_submission_emails()');
END
$migration$;
