import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ReceiptText } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { RegistrationStatusBadge } from '@/components/organizer/registration-row';
import { registrationHref } from '@/components/registration/registration-cta';
import { ScrollToTop } from '@/components/registration/scroll-to-top';
import { groupRegistrations } from '@/components/registration/registration-view';
import { buttonVariants } from '@/components/ui/button';
import { EmptyNotebookSketch } from '@/components/ui/illustrations';
import { parseActionErrorCode, parseActionNoticeCode } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { formatRupiah } from '@/lib/currency';
import { getEventRepository } from '@/lib/data';
import { formatDateId } from '@/lib/deadline';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import type { EventRegistration } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pembayaran',
  robots: { index: false, follow: false },
};

const SELF = '/pembayaran';

/**
 * Menu Pembayaran (ADR-056): semua pendaftaran lewat formulir StudentFo,
 * dikelompokkan menurut apa yang perlu dilakukan pemiliknya. Yang perlu
 * dibayar di atas; riwayat (dibatalkan/ditolak) dilipat supaya daftar yang
 * tumbuh tidak menenggelamkan tagihan aktif (ADR-048).
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [query, user] = await Promise.all([searchParams, requireUser(SELF)]);
  const registrations = await (await getEventRepository()).listMyRegistrations(user.id);
  const groups = groupRegistrations(registrations);

  return (
    <div className="container-page pb-24 pt-6 sm:pt-10">
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-[clamp(30px,4.4vw,40px)] leading-[1.05] tracking-[-0.04em]">Pembayaran</h1>
          <p className="text-[15px] text-ink-muted">Pendaftaran acara lewat StudentFo dan status pembayarannya.</p>
        </header>

        <ActionFeedback params={query} />
        {(parseActionNoticeCode(query.notice) || parseActionErrorCode(query.error)) && <ScrollToTop key={randomUUID()} />}

        {registrations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-line bg-panel px-6 py-14 text-center">
            <EmptyNotebookSketch className="mb-1 text-ink-soft" />
            <h2 className="text-lg font-semibold">Belum ada pendaftaran</h2>
            <p className="max-w-sm text-sm text-ink-muted">Acara yang kamu daftari lewat StudentFo akan muncul di sini beserta tagihannya.</p>
            <Link href="/events" className={buttonVariants({ variant: 'secondary', className: 'mt-2' })}>
              Jelajahi kegiatan
            </Link>
          </div>
        ) : (
          <>
            <section aria-label="Ringkasan tagihan" className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-line bg-panel p-5 sm:p-6">
              <div className="flex flex-col gap-1">
                <span className="text-[13.5px] text-ink-muted">Tagihan aktif</span>
                <span className="text-[28px] font-bold tabular-nums tracking-[-0.03em]">{formatRupiah(groups.amountDue)}</span>
              </div>
              <p className="text-sm text-ink-soft">
                {groups.awaitingPayment.length > 0
                  ? `${groups.awaitingPayment.length} pendaftaran menunggu pembayaran`
                  : 'Tidak ada yang perlu dibayar sekarang'}
                {groups.inReview.length > 0 && ` · ${groups.inReview.length} sedang diperiksa`}
              </p>
            </section>

            <Group title="Perlu dibayar" items={groups.awaitingPayment} />
            <Group title="Sedang diperiksa" items={groups.inReview} />
            <Group title="Terkonfirmasi" items={groups.confirmed} />

            {groups.history.length > 0 && (
              <details className="group/history rounded-[20px] border border-line">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                  <span>
                    Riwayat <span className="font-normal text-ink-muted">({groups.history.length})</span>
                  </span>
                  <ChevronDown aria-hidden className="size-4 transition-transform duration-200 ease-snap group-open/history:rotate-180" />
                </summary>
                <ul className="flex flex-col gap-3 border-t border-line p-3 sm:p-4">
                  {groups.history.map((registration) => (
                    <li key={registration.id}>
                      <RegistrationCard registration={registration} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Group({ title, items }: { title: string; items: readonly EventRegistration[] }) {
  if (items.length === 0) return null;
  const id = `kelompok-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="flex items-baseline gap-2 text-[19px] font-bold tracking-[-0.02em]">
        {title}
        <span className="text-[14px] font-medium text-ink-muted">{items.length}</span>
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((registration) => (
          <li key={registration.id}>
            <RegistrationCard registration={registration} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Satu kartu = satu tautan (judul diregangkan menutup kartu). "Bayar" hanya
 * penanda visual tujuan yang sama — bukan tautan kedua yang dibacakan dua kali.
 */
function RegistrationCard({ registration }: { registration: EventRegistration }) {
  const payable = registration.status === 'AWAITING_PAYMENT';
  const deadline = registration.event.primaryDeadlineAt;
  return (
    <article className="relative flex flex-col gap-3 rounded-[16px] border border-line bg-panel p-4 transition-colors duration-150 ease-snap hover:border-line-strong sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <RegistrationStatusBadge status={registration.status} className="self-start" />
        <h3 className="text-[16px] font-semibold leading-snug">
          <Link
            href={registrationHref(registration.id)}
            className="after:absolute after:inset-0 after:rounded-[16px] after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
          >
            {registration.event.title}
          </Link>
        </h3>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-ink-muted">
          <span className="font-mono tracking-wide text-ink-soft">{registration.code}</span>
          <span>{registration.event.organizer}</span>
          {deadline && <span>Tutup {formatDateId(deadline)}</span>}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center sm:gap-2">
        <span className="text-[17px] font-bold tabular-nums">{registration.feeAmount ? formatRupiah(registration.feeAmount) : 'Gratis'}</span>
        {payable ? (
          <span aria-hidden className={cn(buttonVariants({ size: 'sm' }), 'pointer-events-none')}>
            Bayar <ArrowRight />
          </span>
        ) : (
          <span aria-hidden className="flex items-center gap-1 text-[13px] font-medium text-ink-muted">
            <ReceiptText className="size-3.5" /> Detail
          </span>
        )}
      </div>
    </article>
  );
}
