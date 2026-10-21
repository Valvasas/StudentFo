'use client';

import type { ReactNode } from 'react';
import { EyeOff, FlipHorizontal2 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDeck } from './deck-context';

/*
 * Tombol hanya-JS di dalam kartu. Selama `live` false (HTML server, sebelum
 * hidrasi, atau JS mati) semuanya mengembalikan null/fallback — kartu tetap
 * utuh dengan form ajakannya, dan tidak ada tombol yang tidak berfungsi.
 */

export function SkipButton({ id, name }: { id: string; name: string }) {
  const deck = useDeck();
  if (!deck?.live) return null;
  return (
    <button
      type="button"
      onClick={() => deck.skip(id, 'button')}
      className={cn(buttonVariants({ variant: 'secondary' }), 'min-w-[96px] shrink-0 px-3.5 text-[13.5px] font-medium')}
    >
      <EyeOff aria-hidden />
      Lewati<span className="sr-only"> {name}</span>
    </button>
  );
}

/** Flap di pita kartu: 44x44, ikon saja. */
export function FlipButton({ id, name }: { id: string; name: string }) {
  const deck = useDeck();
  if (!deck?.live) return null;
  return (
    <button
      type="button"
      onClick={() => deck.flip(id)}
      aria-label={`Balik kartu ${name}`}
      className="press mc-flap inline-flex size-11 items-center justify-center rounded-pill border border-line-strong bg-panel text-ink hover:bg-panel-nested"
    >
      <FlipHorizontal2 aria-hidden className="size-[18px]" />
    </button>
  );
}

/**
 * Tombol "Ajak jadi partner". Setelah hidrasi ia hanya MEMBUKA lembar tinjau
 * (type="button"): pengiriman terjadi lewat tombol "Kirim ajakan" di lembar.
 * Sebelum hidrasi yang tampil adalah `fallback` — tombol submit server asli.
 */
export function InviteTrigger({ id, fallback, children }: { id: string; fallback: ReactNode; children: ReactNode }) {
  const deck = useDeck();
  if (!deck?.live) return <>{fallback}</>;
  return (
    <button type="button" onClick={() => deck.requestInvite(id, 'button')} className={cn(buttonVariants({ variant: 'primary' }), 'w-full')}>
      {children}
    </button>
  );
}
