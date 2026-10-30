-- =====================================================================
-- Kesehatan job pg_cron untuk admin & watchdog luar (ADR-062 #2).
--
-- Job harian (kedaluwarsa acara, notifikasi tenggat, retensi data) bisa
-- gagal diam-diam: pg_cron hanya mencatat galatnya di cron.job_run_details,
-- yang tidak pernah dibaca siapa pun. Kebijakan privasi menjanjikan retensi,
-- dan pengingat tenggat yang tidak terbit adalah kegagalan paling merugikan
-- produk ini — jadi statusnya harus terlihat.
--
-- Tanpa pg_cron (database uji integrasi, Postgres polos) fungsi ini
-- mengembalikan himpunan kosong; aplikasi menampilkan "tidak tersedia",
-- bukan "semua sehat".
-- =====================================================================

CREATE OR REPLACE FUNCTION public.cron_job_health()
RETURNS TABLE (
  jobname         TEXT,
  schedule        TEXT,
  active          BOOLEAN,
  last_started_at TIMESTAMPTZ,
  last_status     TEXT,
  last_message    TEXT,
  runs_7d         INT,
  failures_7d     INT,
  -- Satu-satunya tempat aturan "telat jalan" — dibaca beranda admin DAN
  -- watchdog luar (.github/workflows/ops-watchdog.yml).
  overdue         BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('cron.job_run_details') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT j.jobname::TEXT, j.schedule::TEXT, j.active,
         last_run.start_time, last_run.status::TEXT,
         -- Pesan galat Postgres bisa memuat nilai baris; cukup awalnya untuk diagnosis.
         left(last_run.return_message, 300),
         COALESCE(week.runs, 0)::INT, COALESCE(week.failures, 0)::INT,
         -- Semua job StudentFo harian ('M H * * *'): 26 jam = sehari + kelonggaran.
         -- Belum pernah jalan ≠ telat (job baru dibuat); jadwal lain tidak dinilai.
         COALESCE(j.active AND j.schedule ~ '^\d+ \d+ \* \* \*$' AND last_run.start_time < now() - interval '26 hours', false)
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT d.start_time, d.status, d.return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
    ORDER BY d.start_time DESC NULLS LAST
    LIMIT 1
  ) last_run ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS runs, count(*) FILTER (WHERE d.status = 'failed') AS failures
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid AND d.start_time > now() - interval '7 days'
  ) week ON true
  WHERE j.jobname LIKE 'studentfo-%'
  ORDER BY j.jobname;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_job_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_job_health() TO service_role;
