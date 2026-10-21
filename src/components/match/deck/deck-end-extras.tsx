'use client';

import { RotateCcw } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDeck } from './deck-context';

/**
 * Ringkasan akhir tumpukan. Bagian "diajak" datang dari server; "dilewati"
 * hanya diketahui klien (sessionStorage), jadi tanpa JS kalimatnya tetap utuh
 * tanpa angka itu.
 */
export function EndSummary({ shownCount, qualifiedCount, outgoingCount }: { shownCount: number; qualifiedCount: number; outgoingCount: number }) {
  const skipped = useDeck()?.skippedCount ?? 0;
  const tally = [outgoingCount > 0 ? `${outgoingCount} diajak` : null, skipped > 0 ? `${skipped} dilewati` : null].filter(Boolean).join(', ');
  return (
    <p className="text-[14.5px] leading-relaxed text-ink-soft">
      Kamu sudah lihat {shownCount} kartu teratas dari {qualifiedCount} yang lolos.{tally && ` ${tally}.`}
    </p>
  );
}

/** Tombol Kembalikan + catatan privasi: hanya ada setelah hidrasi dan bila ada yang dilewati. */
export function EndRestore({ className }: { className?: string }) {
  const deck = useDeck();
  if (!deck?.live || deck.skippedCount === 0) return null;
  return (
    <>
      <button type="button" onClick={deck.restoreAll} className={cn(buttonVariants({ variant: 'secondary' }), className)}>
        <RotateCcw aria-hidden />
        Kembalikan yang dilewati ({deck.skippedCount})
      </button>
      <p className="basis-full text-[12.5px] leading-snug text-ink-muted">Yang kamu lewati cuma disembunyikan di tab ini. Orangnya tidak diberi tahu.</p>
    </>
  );
}
