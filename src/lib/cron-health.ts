import type { CronJobHealth } from '@/types/domain';

/**
 * Status job pg_cron untuk beranda admin (ADR-062). Aturan "telat jalan"
 * sengaja di SQL (`overdue`) supaya watchdog luar memakai aturan yang sama;
 * di sini hanya urutan prioritas dan teks.
 */
export type CronJobState = 'failed' | 'overdue' | 'inactive' | 'never' | 'ok';

/** Apa yang berhenti bila job itu mati — itulah yang perlu dibaca admin, bukan nama teknisnya. */
export const CRON_JOB_PURPOSE: Readonly<Record<string, string>> = {
  'studentfo-expire-past-events': 'Menutup kegiatan yang tenggatnya sudah lewat',
  'studentfo-deadline-notifications': 'Membuat pengingat tenggat H-3 & H-1',
  'studentfo-purge-rate-limit-hits': 'Membersihkan catatan pembatas laju',
  'studentfo-purge-event-view-dedup': 'Membersihkan data hitung kunjungan',
  'studentfo-purge-old-notifications': 'Retensi notifikasi (dijanjikan Kebijakan privasi)',
  'studentfo-redact-submission-emails': 'Retensi email pengirim kiriman (dijanjikan Kebijakan privasi)',
};

export const CRON_STATE_TEXT: Readonly<Record<CronJobState, { label: string; variant: 'danger' | 'warning' | 'neutral' | 'success' }>> = {
  failed: { label: 'Gagal', variant: 'danger' },
  overdue: { label: 'Telat jalan', variant: 'warning' },
  // Semua job StudentFo memang harus aktif; yang nonaktif dimatikan seseorang.
  inactive: { label: 'Nonaktif', variant: 'warning' },
  never: { label: 'Belum pernah jalan', variant: 'neutral' },
  ok: { label: 'Sehat', variant: 'success' },
};

const PRIORITY: readonly CronJobState[] = ['failed', 'overdue', 'inactive', 'never', 'ok'];

export function cronJobState(job: CronJobHealth): CronJobState {
  if (!job.active) return 'inactive';
  if (job.lastStatus === 'failed') return 'failed';
  if (job.overdue) return 'overdue';
  if (job.lastStartedAt === null) return 'never';
  return 'ok';
}

export function needsAttention(state: CronJobState): boolean {
  return state === 'failed' || state === 'overdue' || state === 'inactive';
}

/** Yang bermasalah di atas; sisanya urut nama supaya posisinya tidak melompat. */
export function sortByUrgency(jobs: readonly CronJobHealth[]): { job: CronJobHealth; state: CronJobState }[] {
  return jobs
    .map((job) => ({ job, state: cronJobState(job) }))
    .sort((a, b) => PRIORITY.indexOf(a.state) - PRIORITY.indexOf(b.state) || a.job.jobName.localeCompare(b.job.jobName));
}
