import Link from 'next/link';
import { ArrowRight, Ban, CircleSlash } from 'lucide-react';
import { RegistrationStatusBadge } from '@/components/organizer/registration-row';
import { cn } from '@/lib/utils';
import type { RegistrationCta } from './registration-view';

const solid =
  'group flex h-12 items-center justify-center gap-2 rounded-card bg-brand text-[15px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover active:pt-0.5';
const outline =
  'press group flex h-12 items-center justify-center gap-2 rounded-card border border-line-strong/70 bg-panel text-[15px] font-semibold transition-colors duration-150 ease-snap hover:border-brand';
const muted = 'flex h-12 items-center justify-center gap-2 rounded-card bg-panel-nested text-[15px] font-semibold text-ink-muted';

export function registrationHref(registrationId: string): string {
  return `/pembayaran/${encodeURIComponent(registrationId)}`;
}

/**
 * Ajakan daftar lewat formulir StudentFo di panel samping (ADR-056).
 * Tab yang sama, `<Link>` biasa — formulirnya bagian dari situs ini, jadi
 * tidak ada alasan membuka tab baru seperti tautan resmi luar.
 */
export function RegistrationCtaPanel({ cta, formHref }: { cta: RegistrationCta; formHref: string }) {
  switch (cta.kind) {
    case 'mine':
      return (
        <div className="flex flex-col gap-2">
          <Link href={registrationHref(cta.registrationId)} className={cta.status === 'AWAITING_PAYMENT' ? solid : outline}>
            Lihat pendaftaranmu
            <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
          </Link>
          <p className="flex items-center justify-center gap-2 text-[13px] text-ink-muted">
            Status <RegistrationStatusBadge status={cta.status} />
          </p>
        </div>
      );
    case 'open':
      return (
        <div className="flex flex-col gap-2">
          <Link href={formHref} className={solid}>
            Daftar sekarang
            <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
          </Link>
          {cta.remaining !== null && (
            <p className="text-center text-[13px] text-ink-muted">Sisa kuota {cta.remaining.toLocaleString('id-ID')}</p>
          )}
        </div>
      );
    case 'full':
      return (
        <span className={muted}>
          <CircleSlash aria-hidden className="size-4" />
          Kuota pendaftaran penuh
        </span>
      );
    case 'closed':
      return (
        <span className={muted}>
          <Ban aria-hidden className="size-4" />
          Pendaftaran sudah ditutup
        </span>
      );
  }
}

/** Padanan di bilah bawah ponsel — nama aksesibel sama dengan panel samping (yang tersembunyi di lebar ini). */
export function RegistrationCtaBarAction({ cta, formHref }: { cta: RegistrationCta; formHref: string }) {
  const button = 'flex h-12 shrink-0 items-center justify-center rounded-card px-[18px] text-[15px] font-semibold active:pt-0.5';
  switch (cta.kind) {
    case 'mine':
      return (
        <Link
          href={registrationHref(cta.registrationId)}
          aria-label="Lihat pendaftaranmu"
          className={cn(
            button,
            cta.status === 'AWAITING_PAYMENT' ? 'bg-brand text-on-brand' : 'press border border-line-strong/70 bg-panel',
          )}
        >
          Lihat
        </Link>
      );
    case 'open':
      return (
        <Link href={formHref} aria-label="Daftar sekarang" className={cn(button, 'bg-brand text-on-brand')}>
          Daftar
        </Link>
      );
    case 'full':
      return <span className="shrink-0 px-1 text-sm font-semibold text-ink-muted">Kuota penuh</span>;
    case 'closed':
      return <span className="shrink-0 px-1 text-sm font-semibold text-ink-muted">Ditutup</span>;
  }
}
