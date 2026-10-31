import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, ExternalLink, Flag, UserRound, X } from 'lucide-react';
import { resolveReportAction } from '@/app/admin/actions';
import { AdminNav } from '@/components/admin/admin-nav';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { TextArea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { adminMetadata, requireAdmin } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import { MODERATION_SUBJECT_TEXT, REPORT_REASON_TEXT } from '@/lib/moderation-labels';
import type { RawSearchParams } from '@/lib/search-params';
import { MODERATION_NOTE_MAX } from '@/lib/trust-safety';
import type { ContentReport } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const generateMetadata = (): Promise<Metadata> => adminMetadata('Laporan pengguna');

const QUEUE_LIMIT = 100;

function SubjectLink({ report }: { report: ContentReport }) {
  if (report.subjectLabel === null) {
    return (
      <span className="text-ink-muted">
        {report.subjectType === 'event' ? 'Kegiatan' : report.subjectType === 'question' ? 'Pertanyaan' : 'Akun'} sudah tidak ada
      </span>
    );
  }
  if (report.subjectType === 'question' && report.subjectSlug) {
    return (
      <Link
        href={`/events/${report.subjectSlug}?tab=tanya#q-${report.subjectId}`}
        target="_blank"
        className="inline-flex min-h-11 items-center gap-1 break-words font-semibold underline underline-offset-[3px]"
      >
        “{report.subjectLabel}” <ExternalLink aria-hidden className="size-3.5 shrink-0" />
        <span className="sr-only">(tab baru)</span>
      </Link>
    );
  }
  if (report.subjectType === 'event' && report.subjectSlug) {
    return (
      <Link href={`/events/${report.subjectSlug}`} target="_blank" className="inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-[3px]">
        {report.subjectLabel} <ExternalLink aria-hidden className="size-3.5" />
        <span className="sr-only">(tab baru)</span>
      </Link>
    );
  }
  return (
    <Link href={`/admin/pengguna?q=${report.subjectId}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold underline underline-offset-[3px]">
      <UserRound aria-hidden className="size-4" /> {report.subjectLabel}
    </Link>
  );
}

/**
 * Antrean laporan pengguna (ADR-061). Laporan tertua dulu — yang paling lama
 * menunggu paling mungkin sedang merugikan orang. Setiap keputusan tercatat di
 * Riwayat moderasi; "turunkan kegiatan" memakai jalur moderasi biasa sehingga
 * bisa dikembalikan dari Riwayat bila keliru.
 */
export default async function ReportsQueuePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  await requireAdmin();
  const reports = await (await getEventRepository()).listOpenReports(QUEUE_LIMIT);
  const openPerSubject = new Map<string, number>();
  for (const report of reports) {
    const key = `${report.subjectType}:${report.subjectId}`;
    openPerSubject.set(key, (openPerSubject.get(key) ?? 0) + 1);
  }

  return (
    <div className="container-page py-8">
      <AdminNav active="laporan" reportsOpen={reports.length} />
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl">
          <Flag aria-hidden className="size-7 text-ink-muted" />
          Laporan pengguna
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Penipuan dan pelecehan lebih dulu. Cek kegiatan ke sumber resminya sebelum menurunkannya, dan untuk laporan akun lihat
          riwayatnya di Pengguna sebelum menangguhkan. Pelapor tidak pernah diberitahukan ke pihak yang dilaporkan; pelapor
          sendiri menerima notifikasi umum tentang hasilnya, tanpa catatan keputusanmu.
        </p>
      </header>

      <ActionFeedback params={params} className="mb-6" />

      {reports.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-card border border-dashed border-line bg-panel px-6 py-10 text-center text-sm text-ink-muted">
          <Check aria-hidden className="size-4 text-success" />
          Tidak ada laporan yang menunggu.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reports.map((report) => {
            const othersOpen = (openPerSubject.get(`${report.subjectType}:${report.subjectId}`) ?? 1) - 1;
            return (
            <li key={report.id} className="flex flex-col gap-3 rounded-card border border-line bg-panel p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                <span>
                  {formatDateTimeId(report.createdAt)} · dilaporkan {report.reporterName ? `oleh ${report.reporterName}` : 'oleh akun yang sudah dihapus'}
                </span>
                <span className="flex flex-wrap gap-2">
                  <Badge variant="neutral">{MODERATION_SUBJECT_TEXT[report.subjectType]}</Badge>
                  <Badge variant={report.reason === 'scam' || report.reason === 'harassment' ? 'danger' : 'warning'}>
                    {REPORT_REASON_TEXT[report.reason].label}
                  </Badge>
                </span>
              </div>
              <SubjectLink report={report} />
              {othersOpen > 0 && (
                <p className="text-sm text-ink-soft">
                  Ada {othersOpen} laporan terbuka lain atas {report.subjectType === 'event' ? 'kegiatan' : report.subjectType === 'question' ? 'pertanyaan' : 'akun'} ini. Semuanya ikut
                  ditutup (dan setiap pelapornya dikabari) bila kamu menandai yang ini sudah ditindak.
                </p>
              )}
              {report.details && (
                <div className="rounded-card bg-panel-nested p-3 text-sm">
                  <p className="mb-1 font-medium text-ink-muted">Keterangan pelapor</p>
                  <p className="whitespace-pre-line break-words">{report.details}</p>
                </div>
              )}

              <form action={resolveReportAction} className="flex flex-col gap-3 border-t border-line/70 pt-3">
                <input type="hidden" name="reportId" value={report.id} />
                <label htmlFor={`note-${report.id}`} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Catatan keputusan (internal, tercatat di riwayat)</span>
                  <TextArea id={`note-${report.id}`} name="note" rows={2} maxLength={MODERATION_NOTE_MAX} />
                </label>
                {report.subjectType === 'event' && report.subjectSlug && (
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
                    <input type="checkbox" name="takedownEventId" value={report.subjectId} className="check mt-px" />
                    <span>
                      Turunkan kegiatan ini dari katalog <span className="text-ink-muted">(bisa dikembalikan dari Riwayat moderasi)</span>
                    </span>
                  </label>
                )}
                {report.subjectType === 'question' && report.subjectLabel !== null && (
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
                    <input type="checkbox" name="hideQuestionId" value={report.subjectId} className="check mt-px" />
                    <span>
                      Sembunyikan pertanyaan ini dari halaman kegiatan <span className="text-ink-muted">(tercatat di Riwayat moderasi)</span>
                    </span>
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="outcome" value="RESOLVED" className={buttonVariants({ variant: 'success', size: 'sm' })}>
                    <Check aria-hidden /> Tandai sudah ditindak
                  </SubmitButton>
                  <SubmitButton name="outcome" value="DISMISSED" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    <X aria-hidden /> Abaikan
                  </SubmitButton>
                </div>
              </form>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
