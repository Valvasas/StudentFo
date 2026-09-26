-- Job terjadwal berjalan di database (pg_cron), bukan di GitHub Actions.
-- Di Postgres tanpa pg_cron (job CI `database`, postgres:15 polos) test ini
-- dilewati dengan NOTICE; ia benar-benar menguji hanya kalau pg_cron
-- dimuat — seperti di Supabase, dan di mesin lokal yang menyalakannya
-- (lihat README § Uji → pg_cron).
DO $$
DECLARE
  expected RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF current_setting('shared_preload_libraries', true) LIKE '%pg_cron%'
       AND current_setting('cron.database_name', true) = current_database() THEN
      RAISE EXCEPTION 'pg_cron tersedia di server ini tapi extension-nya tidak dibuat migration';
    END IF;
    RAISE NOTICE 'pg_cron tidak dimuat di server ini — test job terjadwal dilewati.';
    RETURN;
  END IF;

  FOR expected IN
    SELECT * FROM (VALUES
      ('studentfo-expire-past-events',        '5 17 * * *',  'SELECT public.expire_past_events()'),
      ('studentfo-deadline-notifications',    '0 0 * * *',   'SELECT public.create_deadline_notifications()'),
      ('studentfo-purge-rate-limit-hits',     '17 18 * * *', 'SELECT public.purge_rate_limit_hits()')
    ) AS t(jobname, schedule, command)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM cron.job
      WHERE jobname = expected.jobname
        AND schedule = expected.schedule
        AND command = expected.command
        AND active
    ) THEN
      RAISE EXCEPTION 'pg_cron: job % (%) tidak terdaftar/aktif', expected.jobname, expected.schedule;
    END IF;
  END LOOP;

  -- Satu nama = satu job: migration yang dijalankan ulang tidak boleh menggandakan jadwal.
  IF (SELECT count(*) FROM cron.job WHERE jobname LIKE 'studentfo-%') <> 3 THEN
    RAISE EXCEPTION 'pg_cron: job studentfo-* ganda';
  END IF;
END$$;
