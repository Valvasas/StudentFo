import Link from 'next/link';
import { CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react';
import { formatDateId } from '@/lib/deadline';
import { buildEventHref } from '@/lib/search-params';
import { EVENT_TYPE_LABEL, type EventStatus, type Submission } from '@/types/domain';

const STATUS: Record<EventStatus, { label: string; icon: LucideIcon; tone: string }> = {
  PENDING: { label: 'Menunggu moderator', icon: Clock, tone: 'text-caution' },
  APPROVED: { label: 'Tayang', icon: CheckCircle2, tone: 'text-success' },
  REJECTED: { label: 'Tidak disetujui', icon: XCircle, tone: 'text-danger' },
  EXPIRED: { label: 'Sudah lewat', icon: Clock, tone: 'text-ink-muted' },
};

/**
 * Kiriman milik pengguna yang sedang masuk (/submit & studio penyelenggara).
 *
 * Tanpa ini pengirim hanya punya satu sinyal: notifikasi saat diputuskan.
 * Kiriman yang lama menunggu terlihat sama dengan kiriman yang hilang, dan
 * orang mengirim ulang — yang justru memicu batas laju dan duplikat di antrean.
 *
 * Status selalu ikon + teks, bukan warna saja. Alasan penolakan belum
 * disimpan di skema, jadi yang ditulis adalah penyebab umum, bukan dugaan
 * spesifik yang bisa keliru.
 */
export function MySubmissions({ submissions, title = 'Kirimanmu' }: { submissions: readonly Submission[]; title?: string }) {
  if (submissions.length === 0) return null;
  const hasRejected = submissions.some((submission) => submission.status === 'REJECTED');

  return (
    <section aria-labelledby="kirimanmu" className="flex flex-col gap-3">
      <h2 id="kirimanmu" className="text-lg font-semibold">
        {title}
      </h2>
      <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-panel">
        {submissions.map((submission) => {
          const status = STATUS[submission.status];
          const payload = submission.payload;
          const searchHref = payload ? buildEventHref({ search: payload.title.slice(0, 120) }) : null;
          return (
            <li key={submission.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">{payload?.title ?? 'Kiriman tanpa judul'}</span>
                <span className="text-xs text-ink-muted">
                  {payload ? `${EVENT_TYPE_LABEL[payload.eventType]} · ` : ''}dikirim {formatDateId(submission.createdAt)}
                </span>
              </span>
              <span className="flex items-center gap-3 text-sm">
                <span className={`flex items-center gap-1.5 font-medium ${status.tone}`}>
                  <status.icon aria-hidden className="size-4" />
                  {status.label}
                </span>
                {submission.status === 'APPROVED' && searchHref && (
                  <Link href={searchHref} className="flex min-h-11 items-center font-medium underline underline-offset-[3px]">
                    Lihat<span className="sr-only"> {payload?.title}</span>
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {hasRejected && (
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Kiriman biasanya tidak disetujui karena tautan pendaftaran tidak bisa dicek ke sumber resmi, tenggatnya sudah
          lewat, atau kegiatannya sudah ada di StudentFo. Silakan kirim ulang dengan tautan resmi.
        </p>
      )}
    </section>
  );
}
