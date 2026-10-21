'use client';

import type { ReactNode } from 'react';
import { LayoutGrid, Layers, RotateCcw, Undo2 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DeckView = 'stack' | 'grid';

const TICKS = 6;

const segmentClass =
  "relative inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-pill px-3 text-[13px] font-semibold transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']";

/**
 * Bilah di atas tumpukan. Judul (h2) datang dari server lewat `heading` dan
 * selalu ada; kontrolnya (progres, Urungkan, Kembalikan, pilihan tampilan)
 * hanya dirender bila `live`, jadi tanpa JS bilah ini cukup berupa judul.
 */
export function DeckBar({
  heading,
  live,
  remaining,
  total,
  skippedCount,
  canUndo,
  onUndo,
  onRestoreAll,
  view,
  onView,
}: {
  heading: ReactNode;
  live: boolean;
  remaining: number;
  total: number;
  skippedCount: number;
  canUndo: boolean;
  onUndo: () => void;
  onRestoreAll: () => void;
  view: DeckView;
  onView: (view: DeckView) => void;
}) {
  const decided = total === 0 ? 0 : Math.round((TICKS * (total - remaining)) / total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        {heading}
        {live && (
          <div className="flex items-center gap-2.5 text-[13px] text-ink-muted">
            <span aria-hidden className="flex gap-1">
              {Array.from({ length: TICKS }, (_, index) => (
                <span key={index} className={cn('h-1.5 w-4 rounded-pill transition-colors duration-200', index < decided ? 'bg-brand' : 'bg-line-strong/50')} />
              ))}
            </span>
            <span className="tabular-nums">Sisa {remaining} kartu</span>
            {skippedCount > 0 && <span className="tabular-nums">· Dilewati {skippedCount}</span>}
          </div>
        )}
      </div>

      {live && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <button type="button" onClick={onUndo} disabled={!canUndo} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-3')}>
            <Undo2 aria-hidden /> Urungkan
          </button>
          {skippedCount > 0 && (
            <button type="button" onClick={onRestoreAll} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-3')}>
              <RotateCcw aria-hidden /> Kembalikan<span className="sr-only"> semua yang dilewati</span>
            </button>
          )}
          <div role="group" aria-label="Tampilan hasil" className="ml-1 flex gap-0.5 rounded-pill border border-line bg-panel-nested p-0.5">
            <button
              type="button"
              aria-pressed={view === 'stack'}
              onClick={() => onView('stack')}
              className={cn(segmentClass, view === 'stack' ? 'bg-brand text-on-brand' : 'text-ink-soft hover:bg-panel')}
            >
              <Layers aria-hidden className="size-3.5" /> Tumpukan
            </button>
            <button
              type="button"
              aria-pressed={view === 'grid'}
              onClick={() => onView('grid')}
              className={cn(segmentClass, view === 'grid' ? 'bg-brand text-on-brand' : 'text-ink-soft hover:bg-panel')}
            >
              <LayoutGrid aria-hidden className="size-3.5" /> Semua kartu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
