'use client';

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const SkipContext = createContext<(() => void) | null>(null);

const subscribeNothing = () => () => {};

/**
 * Pembungkus kartu hasil yang bisa dilewati (ADR-057). Melewati hanya
 * menyembunyikan kartu di halaman ini — tidak ada yang disimpan dan lawannya
 * tidak diberi tahu; muat ulang halaman menampilkannya lagi.
 *
 * Tanpa JavaScript tombol "Lewati" tidak dirender sama sekali (lihat
 * `SkipMatchButton`), jadi daftar tetap utuh dan tidak ada tombol mati.
 * Setelah kartu hilang, fokus dipindah ke wadah hasil supaya pengguna
 * keyboard tidak terlempar ke awal halaman.
 */
export function DismissibleMatch({ children, focusTargetId, className }: { children: ReactNode; focusTargetId: string; className?: string }) {
  const [phase, setPhase] = useState<'shown' | 'leaving' | 'gone'>('shown');
  if (phase === 'gone') return null;
  return (
    <SkipContext.Provider value={() => setPhase('leaving')}>
      <div
        className={cn(phase === 'leaving' && 'card-out', className)}
        onAnimationEnd={(event) => {
          if (phase !== 'leaving' || event.target !== event.currentTarget) return;
          setPhase('gone');
          document.getElementById(focusTargetId)?.focus();
        }}
      >
        {children}
      </div>
    </SkipContext.Provider>
  );
}

export function SkipMatchButton({ name }: { name: string }) {
  const skip = useContext(SkipContext);
  // Snapshot server `false`: HTML dari server tidak memuat tombol, jadi tanpa
  // JavaScript (atau sebelum hidrasi) tidak ada tombol yang tak berfungsi.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!skip || !hydrated) return null;
  return (
    <button
      type="button"
      onClick={skip}
      className="press inline-flex min-h-11 items-center gap-1.5 rounded-sm px-3 text-[13.5px] font-medium text-ink-muted hover:bg-panel-nested hover:text-ink"
    >
      <EyeOff aria-hidden className="size-4" />
      Lewati<span className="sr-only"> {name}</span>
    </button>
  );
}
