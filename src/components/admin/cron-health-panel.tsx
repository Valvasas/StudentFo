import { AlertTriangle, CircleCheck, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getEventRepository } from '@/lib/data';
import { CRON_JOB_PURPOSE, CRON_STATE_TEXT, needsAttention, sortByUrgency } from '@/lib/cron-health';
import { formatDateTimeId } from '@/lib/deadline';
import { dataMode } from '@/lib/env';
import type { CronJobHealth } from '@/types/domain';

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-card bg-caution-soft p-3 text-sm text-caution">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Job pg_cron di beranda admin (ADR-062): kegiatan kedaluwarsa, pengingat
 * tenggat, dan retensi data yang dijanjikan Kebijakan privasi berhenti
 * diam-diam bila job-nya gagal — tidak ada yang membaca cron.job_run_details.
 */
export async function CronHealthPanel() {
  // undefined = gagal dibaca (mis. migration belum diterapkan); null = tidak ada pg_cron.
  let jobs: readonly CronJobHealth[] | null | undefined;
  try {
    jobs = await (await getEventRepository()).cronJobHealth();
  } catch {
    jobs = undefined;
  }

  const rows = jobs ? sortByUrgency(jobs) : [];
  const problems = rows.filter((row) => needsAttention(row.state)).length;

  return (
    <section aria-labelledby="job-terjadwal" className="mt-8 rounded-panel border border-line bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="job-terjadwal" className="flex items-center gap-2 text-xl">
          <Clock aria-hidden className="size-5 text-ink-muted" />
          Job terjadwal
        </h2>
        {jobs && (
          <p className={problems > 0 ? 'text-sm font-medium text-danger' : 'flex items-center gap-1.5 text-sm text-ink-muted'}>
            {problems > 0 ? (
              `${problems} perlu dicek`
            ) : (
              <>
                <CircleCheck aria-hidden className="size-4 text-success" /> Semua berjalan
              </>
            )}
          </p>
        )}
      </div>

      {jobs === undefined ? (
        <Notice>Status job tidak bisa dibaca. Pastikan migration `20261101100002_cron_job_health.sql` sudah diterapkan.</Notice>
      ) : jobs === null ? (
        dataMode === 'seed' ? (
          <p className="mt-3 text-sm text-ink-muted">Mode data contoh tidak menjalankan job terjadwal.</p>
        ) : (
          <Notice>
            pg_cron tidak aktif di database ini: kegiatan yang lewat tenggat tidak ditutup, pengingat H-3/H-1 tidak dibuat, dan retensi data
            tidak berjalan. Aktifkan extension pg_cron lalu jalankan ulang migration job (README § Menyiapkan Supabase).
          </Notice>
        )
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line border-t border-line">
          {rows.map(({ job, state }) => (
            <li key={job.jobName} className="flex flex-col gap-1.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{CRON_JOB_PURPOSE[job.jobName] ?? job.jobName}</span>
                  <span className="text-[13px] text-ink-muted">
                    <span className="break-all font-mono">{job.jobName}</span> ·{' '}
                    {job.lastStartedAt ? `terakhir ${formatDateTimeId(job.lastStartedAt)}` : 'belum pernah jalan'}
                    {job.failures7d > 0 && ` · ${job.failures7d} dari ${job.runs7d} run gagal dalam 7 hari`}
                  </span>
                </span>
                <Badge variant={CRON_STATE_TEXT[state].variant} className="shrink-0">
                  {CRON_STATE_TEXT[state].label}
                </Badge>
              </div>
              {state === 'failed' && job.lastMessage && (
                <p className="break-words rounded-card bg-panel-nested p-2 font-mono text-xs text-ink-soft">{job.lastMessage}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
