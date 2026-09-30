import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, BadgeCheck, Check, CheckCircle2, History, RotateCcw, Scale, ShieldCheck, Users } from 'lucide-react';
import { EventReviewCard } from '@/components/admin/event-review-card';
import { SubmissionReviewCard } from '@/components/admin/submission-review-card';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatWait, REVIEW_SLA_HOURS, summarizeDecisions, summarizeQueue, type QueueHealth } from '@/lib/admin-health';
import { checkAdminAccess } from '@/lib/auth';
import { DEMO_DATA_TTL_MS, demoDataCreatedAt, getEventRepository } from '@/lib/data';
import { formatDateTimeId, formatTimeId } from '@/lib/deadline';
import { dataMode } from '@/lib/env';
import { resetDemoDataAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Antrean moderasi',
  robots: { index: false, follow: false },
};

const QUEUE_LIMIT = 50;

const STATUS_MESSAGE: Record<string, string> = {
  forbidden: 'Kamu tidak punya izin untuk meninjau kiriman ini.',
  invalid: 'Permintaan tidak dikenali. Muat ulang halaman lalu coba lagi.',
  failed: 'Keputusan gagal disimpan. Coba lagi sebentar lagi.',
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const statusKey = Array.isArray(params.status) ? params.status[0] : params.status;
  // hasOwn, bukan akses indeks biasa: `?status=constructor` akan membaca
  // properti prototype Object dan mencoba merender sebuah fungsi.
  const statusMessage =
    statusKey && Object.hasOwn(STATUS_MESSAGE, statusKey) ? STATUS_MESSAGE[statusKey] : undefined;
  const gate = await checkAdminAccess();

  if (!gate.allowed) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <ShieldCheck aria-hidden className="size-10 text-ink-faint" />
        <h1 className="text-2xl">Akses terbatas</h1>
        <p className="max-w-md text-ink-muted">
          {gate.reason === 'unauthenticated'
            ? 'Masuk dengan akun admin untuk membuka antrean moderasi.'
            : 'Akunmu tidak punya peran admin. Hubungi pengelola kalau ini keliru.'}
        </p>
        {gate.reason === 'unauthenticated' && (
          <Button asChild>
            <Link href="/login?next=%2Fadmin">Masuk</Link>
          </Button>
        )}
      </div>
    );
  }

  const repository = await getEventRepository();
  const demoCreatedAt = demoDataCreatedAt();
  const [pending, submissions, organizerQueue, claimQueue, revisionQueue, categories, recentLog] = await Promise.all([
    repository.listByStatus('PENDING', QUEUE_LIMIT),
    repository.listSubmissions('PENDING', QUEUE_LIMIT),
    repository.listOrganizerApplications('PENDING', QUEUE_LIMIT),
    repository.listClaims('PENDING', QUEUE_LIMIT),
    repository.listRevisions('PENDING', QUEUE_LIMIT),
    repository.listCategories(),
    repository.listModerationLog(300),
  ]);
  const categoryNames = Object.fromEntries(categories.map((category) => [category.slug, category.name]));
  const submitterStatuses = await repository.listOrganizerStatuses(
    submissions.flatMap((submission) => (submission.submittedBy ? [submission.submittedBy] : [])),
  );
  const verifiedOrgOf = (userId: string | null) => {
    const entry = userId ? submitterStatuses.get(userId) : undefined;
    return entry?.status === 'VERIFIED' ? entry.orgName : null;
  };
  const trustWaiting = organizerQueue.length + claimQueue.length + revisionQueue.length;
  const now = new Date();
  const health = {
    events: summarizeQueue(pending.map((event) => event.createdAt), now),
    submissions: summarizeQueue(submissions.map((submission) => submission.createdAt), now),
    trust: summarizeQueue([...organizerQueue, ...claimQueue, ...revisionQueue].map((item) => item.createdAt), now),
  };
  const decisions = summarizeDecisions(recentLog, now);

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Antrean moderasi</h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Hasil ekstraksi otomatis menunggu verifikasi manusia. Setujui hanya setelah tautan
            pendaftaran dan tenggatnya dicek ke sumber aslinya.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/penyelenggara">
              <BadgeCheck aria-hidden /> Penyelenggara
              {trustWaiting > 0 && (
                <span className="rounded-pill bg-caution-soft px-1.5 text-xs font-semibold text-caution">
                  {trustWaiting}
                  <span className="sr-only"> menunggu</span>
                </span>
              )}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/riwayat">
              <History aria-hidden /> Riwayat moderasi
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/kalibrasi">
              <Scale aria-hidden /> Kalibrasi rekomendasi
            </Link>
          </Button>
        </div>
      </header>

      {statusMessage && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-card border border-danger-line bg-danger-soft p-4 text-sm text-danger"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{statusMessage}</p>
        </div>
      )}

      <ActionFeedback params={params} className="mb-6" />

      <section aria-labelledby="kondisi-antrean" className="mb-10">
        <h2 id="kondisi-antrean" className="mb-3 text-sm font-medium text-ink-muted">
          Kondisi antrean · batas tunggu {REVIEW_SLA_HOURS} jam
        </h2>
        <ul className="grid gap-px overflow-hidden rounded-card border border-line bg-line [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
          <QueueTile href="#antrean-acara" label="Acara hasil scraping" health={health.events} capped={pending.length >= QUEUE_LIMIT} />
          <QueueTile href="#kiriman-komunitas" label="Kiriman komunitas" health={health.submissions} capped={submissions.length >= QUEUE_LIMIT} />
          <QueueTile href="/admin/penyelenggara" label="Penyelenggara, klaim & revisi" health={health.trust} capped={false} />
          <li className="bg-panel">
            <Link href="/admin/riwayat" className="flex h-full flex-col gap-1 px-5 py-4 transition-colors duration-150 ease-snap hover:bg-panel-nested">
              <span className="text-[13px] text-ink-muted">Keputusan {decisions.windowDays} hari terakhir</span>
              <span className="text-2xl font-semibold tracking-[-0.03em]">{decisions.approved + decisions.rejected}</span>
              <span className="text-[13px] text-ink-soft">
                {decisions.approved} disetujui · {decisions.rejected} ditolak
              </span>
            </Link>
          </li>
        </ul>
      </section>

      {gate.reason === 'demo' && (
        <div
          role="note"
          className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-card border border-caution-line bg-caution-soft p-4 text-sm text-caution"
        >
          <p className="flex max-w-2xl items-start gap-2">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-semibold">Admin demo.</strong> Keputusanmu mengubah data contoh
              yang dilihat semua pengunjung pratinjau, dan data itu diatur ulang otomatis setiap 6 jam
              {demoCreatedAt
                ? ` (terakhir ${formatDateTimeId(demoCreatedAt.toISOString())}, berikutnya pukul ${formatTimeId(
                    new Date(demoCreatedAt.getTime() + DEMO_DATA_TTL_MS).toISOString(),
                  )})`
                : ''}.
              Di produksi, halaman ini mensyaratkan akun berperan{' '}
              <code className="rounded-sm bg-panel-nested px-1">ADMIN</code>.
            </span>
          </p>
          <form action={resetDemoDataAction}>
            <Button type="submit" variant="secondary" size="sm">
              <RotateCcw aria-hidden />
              Atur ulang data demo
            </Button>
          </form>
        </div>
      )}

      <h2 id="antrean-acara" className="mb-4 scroll-mt-24 text-2xl">
        Acara hasil scraping
      </h2>
      {pending.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-panel px-6 py-16 text-center">
          <Check aria-hidden className="mx-auto size-8 text-success" />
          <h2 className="mt-3 text-lg font-semibold">Antrean bersih</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Tidak ada kiriman yang menunggu. Scraper berikutnya jalan pukul 02:00 WIB.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((event) => (
            <EventReviewCard key={event.id} event={event} categoryNames={categoryNames} />
          ))}
        </ul>
      )}

      <section aria-labelledby="kiriman-komunitas" className="mt-12 scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="kiriman-komunitas" className="flex items-center gap-2 text-2xl">
            <Users aria-hidden className="size-5 text-ink-muted" />
            Kiriman komunitas
          </h2>
          <Badge variant={submissions.length > 0 ? 'warning' : 'success'}>
            {submissions.length} menunggu
          </Badge>
        </div>
        {submissions.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-panel px-6 py-8 text-center text-sm text-ink-muted">
            Tidak ada kiriman dari halaman /submit yang menunggu.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {submissions.map((submission) => (
              <SubmissionReviewCard key={submission.id} submission={submission} verifiedOrg={verifiedOrgOf(submission.submittedBy)} />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-ink-faint">
        Sumber data saat ini: <code>{dataMode === 'supabase' ? 'Supabase' : 'seed lokal'}</code>
      </p>
    </div>
  );
}

/**
 * Satu antrean = satu angka + satu kalimat keadaan. Yang lewat batas tunggu
 * ditulis dengan ikon + teks (bukan hanya warna) karena itulah satu-satunya
 * hal di panel ini yang menuntut tindakan.
 */
function QueueTile({ href, label, health, capped }: { href: string; label: string; health: QueueHealth; capped: boolean }) {
  return (
    <li className="bg-panel">
      <Link href={href} className="flex h-full flex-col gap-1 px-5 py-4 transition-colors duration-150 ease-snap hover:bg-panel-nested">
        <span className="text-[13px] text-ink-muted">{label}</span>
        <span className="text-2xl font-semibold tracking-[-0.03em]">
          {health.count}
          {capped && '+'}
          <span className="sr-only"> menunggu</span>
        </span>
        {health.count === 0 ? (
          <span className="flex items-center gap-1.5 text-[13px] text-success">
            <CheckCircle2 aria-hidden className="size-3.5" /> Kosong
          </span>
        ) : health.overdue > 0 ? (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-caution">
            <AlertTriangle aria-hidden className="size-3.5" />
            {health.overdue} lewat batas · tertua {formatWait(health.oldestHours)}
          </span>
        ) : (
          <span className="text-[13px] text-ink-soft">Tertua {formatWait(health.oldestHours)}</span>
        )}
      </Link>
    </li>
  );
}
