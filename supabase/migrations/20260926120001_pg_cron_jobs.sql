-- =====================================================================
-- Job terjadwal pindah dari GitHub Actions ke pg_cron.
--
-- Kenapa: `schedule` GitHub Actions bisa telat puluhan menit saat antrean
-- padat, kadang dilewati, dan OTOMATIS DINONAKTIFKAN setelah 60 hari repo
-- publik tanpa commit — job expiry dan notifikasi tenggat berhenti diam-diam.
-- pg_cron berjalan di dalam database yang sama dengan datanya.
--
-- Bersyarat: di Postgres tanpa pg_cron (job CI `database` memakai
-- postgres:15 polos) migration ini hanya memberi NOTICE. Di Supabase pg_cron
-- selalu tersedia. Workflow GitHub tetap ada untuk dijalankan manual
-- (workflow_dispatch) — ketiga fungsi idempoten, jadi berjalan ganda aman.
--
-- Jadwal dalam UTC (zona pg_cron): 17:05 UTC = 00:05 WIB, 00:00 UTC = 07:00 WIB.
-- cron.schedule(nama, …) meng-upsert berdasarkan nama, jadi aman diulang.
-- =====================================================================
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     OR current_setting('shared_preload_libraries', true) NOT LIKE '%pg_cron%' THEN
    RAISE NOTICE 'pg_cron tidak tersedia — jadwalkan expire_past_events(), create_deadline_notifications(), purge_rate_limit_hits() dari luar.';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;

  PERFORM cron.schedule(
    'studentfo-expire-past-events', '5 17 * * *', 'SELECT public.expire_past_events()'
  );
  PERFORM cron.schedule(
    'studentfo-deadline-notifications', '0 0 * * *', 'SELECT public.create_deadline_notifications()'
  );
  -- Menit ganjil supaya tidak berebut dengan job lain yang biasanya di :00.
  PERFORM cron.schedule(
    'studentfo-purge-rate-limit-hits', '17 18 * * *', 'SELECT public.purge_rate_limit_hits()'
  );
END
$migration$;
