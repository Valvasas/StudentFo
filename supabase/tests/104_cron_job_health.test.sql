-- Kesehatan job pg_cron (ADR-062 #2). Bagian pg_cron hanya benar-benar diuji
-- bila extension-nya dimuat (lihat README § Uji → pg_cron), seperti 60_pg_cron_jobs.
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM * FROM public.cron_job_health();
  RAISE EXCEPTION 'pengguna biasa tidak boleh membaca status job';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END$$;
RESET ROLE;

DO $$
DECLARE
  job    RECORD;
  target BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM public.cron_job_health()) THEN
      RAISE EXCEPTION 'tanpa pg_cron hasilnya harus kosong (aplikasi menampilkan "tidak tersedia")';
    END IF;
    RAISE NOTICE 'pg_cron tidak dimuat — bagian job dari test kesehatan dilewati.';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.cron_job_health()) <> 6 THEN
    RAISE EXCEPTION 'semua job studentfo-* harus terlihat, dapat %', (SELECT count(*) FROM public.cron_job_health());
  END IF;
  IF EXISTS (SELECT 1 FROM public.cron_job_health() WHERE last_started_at IS NOT NULL OR runs_7d <> 0) THEN
    RAISE EXCEPTION 'job yang belum pernah jalan: tanpa waktu & tanpa hitungan';
  END IF;

  SELECT jobid INTO target FROM cron.job WHERE jobname = 'studentfo-deadline-notifications';
  INSERT INTO cron.job_run_details (jobid, runid, database, username, command, status, return_message, start_time, end_time) VALUES
    (target, nextval('cron.runid_seq'), current_database(), 'postgres', 'x', 'failed', 'lama, di luar jendela', now() - interval '9 days', now() - interval '9 days'),
    (target, nextval('cron.runid_seq'), current_database(), 'postgres', 'x', 'succeeded', '1 row', now() - interval '2 days', now() - interval '2 days'),
    (target, nextval('cron.runid_seq'), current_database(), 'postgres', 'x', 'failed', 'ERROR: ' || repeat('x', 400), now() - interval '1 hour', now() - interval '1 hour');

  SELECT * INTO job FROM public.cron_job_health() WHERE jobname = 'studentfo-deadline-notifications';
  IF job.last_status <> 'failed' OR job.last_started_at <> now() - interval '1 hour' THEN
    RAISE EXCEPTION 'status terakhir harus dari run terbaru: % %', job.last_status, job.last_started_at;
  END IF;
  IF job.runs_7d <> 2 OR job.failures_7d <> 1 THEN
    RAISE EXCEPTION 'hitungan 7 hari salah (run di luar jendela ikut?): % run, % gagal', job.runs_7d, job.failures_7d;
  END IF;
  IF char_length(job.last_message) <> 300 THEN
    RAISE EXCEPTION 'pesan galat dipangkas 300 karakter, dapat %', char_length(job.last_message);
  END IF;
  IF job.schedule <> '0 0 * * *' OR NOT job.active THEN
    RAISE EXCEPTION 'jadwal & status aktif ikut dikembalikan';
  END IF;
  IF job.overdue THEN RAISE EXCEPTION 'job yang jalan sejam lalu tidak telat'; END IF;

  -- Job harian yang terakhir jalan 30 jam lalu = telat (worker mati / dinonaktifkan diam-diam).
  SELECT jobid INTO target FROM cron.job WHERE jobname = 'studentfo-expire-past-events';
  INSERT INTO cron.job_run_details (jobid, runid, database, username, command, status, return_message, start_time, end_time)
  VALUES (target, nextval('cron.runid_seq'), current_database(), 'postgres', 'x', 'succeeded', '1 row', now() - interval '30 hours', now() - interval '30 hours');
  IF NOT (SELECT overdue FROM public.cron_job_health() WHERE jobname = 'studentfo-expire-past-events') THEN
    RAISE EXCEPTION 'job harian yang terakhir jalan 30 jam lalu harus ditandai telat';
  END IF;
  IF (SELECT overdue FROM public.cron_job_health() WHERE jobname = 'studentfo-purge-rate-limit-hits') THEN
    RAISE EXCEPTION 'job yang belum pernah jalan bukan "telat"';
  END IF;
  -- Job yang sengaja dinonaktifkan tidak ditagih.
  UPDATE cron.job SET active = false WHERE jobid = target;
  IF (SELECT overdue FROM public.cron_job_health() WHERE jobname = 'studentfo-expire-past-events') THEN
    RAISE EXCEPTION 'job nonaktif tidak boleh ditandai telat';
  END IF;
END$$;
ROLLBACK;
