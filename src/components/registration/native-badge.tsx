import { ClipboardCheck } from 'lucide-react';
import { PriceBadge } from '@/components/event/price-badge';
import { cn } from '@/lib/utils';
import type { EventSummary } from '@/types/domain';

/**
 * Penanda "bisa didaftar langsung di StudentFo" (ADR-055). Satu-satunya
 * lencana kartu berwarna stabilo — warna yang sama dengan sorotan judul —
 * karena ini AKSI yang tersedia, bukan sekadar fakta seperti biaya.
 */
export function NativeRegistrationBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm bg-highlight-soft px-2 py-0.5 text-xs font-semibold leading-5 text-ink', className)}>
      <ClipboardCheck aria-hidden className="size-3.5" />
      Daftar di StudentFo
    </span>
  );
}

/** Lencana biaya + pendaftaran langsung dalam satu baris yang membungkus; kosong bila keduanya tidak ada. */
export function CardBadges({
  event,
  native = false,
  className,
}: {
  event: Pick<EventSummary, 'isFree' | 'priceAmount'>;
  native?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5 empty:hidden', className)}>
      {native && <NativeRegistrationBadge />}
      <PriceBadge event={event} />
    </span>
  );
}
