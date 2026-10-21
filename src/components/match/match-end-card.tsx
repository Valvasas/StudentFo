import Link from 'next/link';
import { RefreshCw, Send, Sparkles } from 'lucide-react';
import { EndRestore, EndSummary } from '@/components/match/deck/deck-end-extras';
import { buttonVariants } from '@/components/ui/button';
import { PocketSketch } from '@/components/ui/feature-illustrations';
import { cn } from '@/lib/utils';

/**
 * Slot terakhir tumpukan: kantong kertas berisi ringkasan. Sengaja <section>,
 * bukan <article> — hanya kartu kandidat yang boleh menjadi <article>.
 * Semua tautan adalah <a> biasa, jadi tetap berfungsi tanpa JS.
 */
export function MatchEndCard({
  shownCount,
  qualifiedCount,
  outgoingCount,
  moreHref,
  moreCount,
  rescanHref,
  maxed,
}: {
  shownCount: number;
  qualifiedCount: number;
  outgoingCount: number;
  moreHref: string | null;
  moreCount: number;
  rescanHref: string;
  maxed: boolean;
}) {
  return (
    <section aria-labelledby="akhir-judul" className="mc-end flex h-full flex-col justify-center gap-5 rounded-[24px] border border-line bg-panel p-5 @min-[560px]:flex-row @min-[560px]:items-center @min-[560px]:gap-8 @min-[560px]:p-8">
      <div className="dot-grid flex shrink-0 items-center justify-center rounded-[18px] bg-panel-nested px-4 py-3 text-ink @min-[560px]:w-[220px]">
        <PocketSketch className="w-40 max-w-full @min-[560px]:w-full" />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <h3 id="akhir-judul" tabIndex={-1} className="font-display text-[26px] font-bold leading-tight tracking-[-0.03em] outline-none">
          Tumpukan habis
        </h3>
        <EndSummary shownCount={shownCount} qualifiedCount={qualifiedCount} outgoingCount={outgoingCount} />
        {maxed && <p className="text-[13.5px] text-ink-muted">Itu semua 24 kartu teratas. Longgarkan saringan untuk melihat lebih banyak.</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {moreHref && (
            <Link href={moreHref} scroll={false} className={cn(buttonVariants({ variant: 'primary' }), 'max-sm:w-full')}>
              <Sparkles aria-hidden /> Tarik {moreCount} kartu lagi
            </Link>
          )}
          <Link href={rescanHref} className={cn(buttonVariants({ variant: 'secondary' }), 'max-sm:w-full')}>
            <RefreshCw aria-hidden /> Kocok ulang tumpukan
          </Link>
          {outgoingCount > 0 && (
            <Link href="/connections?tab=ajakan" className={cn(buttonVariants({ variant: 'secondary' }), 'max-sm:w-full')}>
              <Send aria-hidden /> Lihat ajakanku
            </Link>
          )}
          <EndRestore className="max-sm:w-full" />
        </div>
      </div>
    </section>
  );
}
