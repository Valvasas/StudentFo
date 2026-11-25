import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, ExternalLink, ShieldCheck, Trophy, X } from 'lucide-react';
import { reviewAchievementAction } from '@/app/admin/actions';
import { AdminNav } from '@/components/admin/admin-nav';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { buttonVariants } from '@/components/ui/button';
import { TextArea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { adminMetadata, requireAdmin } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { LEADERBOARD_LIMITS } from '@/lib/data/repository';
import { formatDateTimeId } from '@/lib/deadline';
import { LEADERBOARD_RESULT_LABEL } from '@/lib/leaderboard';
import type { RawSearchParams } from '@/lib/search-params';
import { sanitizeExternalUrl } from '@/lib/utils';
import type { AchievementReviewItem } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const generateMetadata = (): Promise<Metadata> => adminMetadata('Verifikasi prestasi');

function Hidden({ item }: { item: AchievementReviewItem }) {
  return (
    <>
      <input type="hidden" name="userId" value={item.userId} />
      <input type="hidden" name="eventId" value={item.eventId} />
      <input type="hidden" name="requestedAt" value={item.requestedAt} />
    </>
  );
}

function ReviewCard({ item }: { item: AchievementReviewItem }) {
  const proof = sanitizeExternalUrl(item.proofUrl);
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-panel p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 text-base font-semibold leading-snug [overflow-wrap:anywhere]">
          {item.fullName} — {LEADERBOARD_RESULT_LABEL[item.result]}
        </h2>
        <span className="text-[12.5px] text-ink-muted">diajukan {formatDateTimeId(item.requestedAt)}</span>
      </div>
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-ink-muted">Lomba</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere]">
          <Link href={`/events/${item.event.slug}`} target="_blank" className="inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-[3px]">
            {item.event.title} <ExternalLink aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only">(tab baru)</span>
          </Link>
          <span className="block text-[13px] text-ink-muted">{item.event.organizer}</span>
        </dd>
        <dt className="text-ink-muted">Kampus saat mengajukan</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere]">{item.institutionName ?? 'Belum diisi — tidak masuk skor kampus'}</dd>
        <dt className="text-ink-muted">Bukti</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere]">
          {proof ? (
            <a href={proof} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-[3px]">
              {new URL(proof).hostname} <ExternalLink aria-hidden className="size-3.5 shrink-0" />
              <span className="sr-only">(tab baru, tautan dari pengaju)</span>
            </a>
          ) : (
            'Tautan tidak valid'
          )}
        </dd>
      </dl>
      <div className="flex flex-wrap items-start gap-2 border-t border-line/70 pt-3">
        <form action={reviewAchievementAction}>
          <Hidden item={item} />
          <input type="hidden" name="decision" value="VERIFIED" />
          <SubmitButton className={buttonVariants({ variant: 'success', size: 'sm' })} pendingLabel="Menyimpan…">
            <Check aria-hidden /> Verifikasi
          </SubmitButton>
        </form>
        {/* <details>: penolakan WAJIB beralasan, dan tetap berfungsi tanpa JavaScript (CONVENTIONS § konfirmasi). */}
        <details className="group min-w-0 flex-1">
          <summary className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'cursor-pointer list-none [&::-webkit-details-marker]:hidden' })}>
            <X aria-hidden /> Tolak…
          </summary>
          <form action={reviewAchievementAction} className="mt-3 flex max-w-xl flex-col gap-2">
            <Hidden item={item} />
            <input type="hidden" name="decision" value="REJECTED" />
            <label htmlFor={`alasan-${item.userId}-${item.eventId}`} className="text-[13.5px] font-semibold">
              Alasan untuk pengaju (wajib)
            </label>
            <TextArea
              id={`alasan-${item.userId}-${item.eventId}`}
              name="note"
              required
              minLength={5}
              maxLength={300}
              rows={2}
              placeholder="Mis. Nama di sertifikat tidak sama, atau tautan tidak menyebut pemenang."
            />
            <SubmitButton className={buttonVariants({ variant: 'danger', size: 'sm', className: 'self-start' })} pendingLabel="Menyimpan…">
              Tolak pengajuan
            </SubmitButton>
          </form>
        </details>
      </div>
    </li>
  );
}

/**
 * Antrean verifikasi prestasi (ADR-098). Moderator mencocokkan hasil yang
 * diklaim dengan buktinya — sertifikat atau pengumuman pemenang resmi. Hanya
 * yang terverifikasi masuk Peringkat; penolakan selalu beralasan.
 */
export default async function AchievementQueuePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  await requireAdmin();
  const repository = await getEventRepository();
  const [items, reportsOpen] = await Promise.all([repository.listPendingAchievementVerifications(LEADERBOARD_LIMITS.pending), repository.countOpenReports()]);

  return (
    <div className="container-page py-8">
      <AdminNav active="prestasi" reportsOpen={reportsOpen} />
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl">
          <Trophy aria-hidden className="size-7 text-ink-muted" />
          Verifikasi prestasi
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Buka buktinya dan cocokkan nama, lomba, dan peringkatnya dengan pengumuman resmi penyelenggara. Hanya yang kamu verifikasi
          dihitung di{' '}
          <Link href="/leaderboard" className="font-medium text-ink underline underline-offset-[3px]">
            Peringkat
          </Link>
          . Ragu? Tolak dengan alasan yang jelas — pengaju bisa memperbaiki dan mengajukan lagi.
        </p>
      </header>

      <ActionFeedback params={params} className="mb-6" />

      {items.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-card border border-dashed border-line bg-panel px-6 py-10 text-center text-sm text-ink-muted">
          <ShieldCheck aria-hidden className="size-4 text-success" />
          Tidak ada pengajuan yang menunggu.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <ReviewCard key={`${item.userId}-${item.eventId}`} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
