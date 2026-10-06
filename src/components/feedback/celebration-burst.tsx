'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { RouteSceneArt } from '@/components/layout/route-scene-art';
import { CelebrateSketch, Confetti } from '@/components/ui/feature-illustrations';
import { PaperPlaneDoodle, TrophyDoodle } from '@/components/ui/illustrations';
import type { Celebration, CelebrationArt } from '@/lib/celebration';
import { cn } from '@/lib/utils';

const VISIBLE_MS = 3200;
const EXIT_MS = 260;
/** Mount sedekat ini setelah tombol Kembali/Maju = halaman lama dipulihkan, bukan hasil aksi baru. */
const AFTER_POPSTATE_MS = 1500;

const seenBursts = new Set<string>();
let lastPopstateAt = -Infinity;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    lastPopstateAt = performance.now();
  });
}

const subscribeNothing = () => () => {};

function Art({ art }: { art: CelebrationArt }) {
  switch (art) {
    case 'party':
      return <CelebrateSketch className="max-w-[64px]" />;
    case 'plane':
      return <PaperPlaneDoodle className="launch h-11 w-[52px]" />;
    case 'trophy':
      return <TrophyDoodle className="bob size-14" />;
    case 'connect':
      return <RouteSceneArt scene="network" className="h-12 w-16" />;
  }
}

/**
 * Perayaan sekali jalan untuk hasil aksi (ADR-055): kartu dengan cap,
 * sketsa, dan (untuk momen besar) konfeti, turun dari atas lalu pergi sendiri.
 *
 * Dirender oleh `ActionFeedback`/`AuthFeedback` di server dengan `burstKey`
 * unik per request, jadi:
 *  - kirim ulang ke URL yang SAMA (dua kegiatan berturut-turut ditandai
 *    "Sudah daftar") tetap dirayakan — kuncinya baru;
 *  - Kembali/Maju memakai payload lama (kunci sama) atau baru saja memicu
 *    `popstate` → tidak diputar ulang;
 *  - muat ulang halaman: komponen lahir saat HIDRASI dokumen yang jenis
 *    navigasinya `reload` → tidak diputar ulang. Hidrasi dibedakan dari
 *    pemasangan biasa lewat snapshot server `useSyncExternalStore`.
 *
 * `aria-hidden` dan tidak menangkap klik: kalimat lengkapnya sudah
 * dibacakan `FormAlert` di halaman. Tanpa JavaScript kartu ini tidak ada,
 * dan tidak ada yang hilang.
 */
export function CelebrationBurst({ celebration, burstKey }: { celebration: Celebration; burstKey: string }) {
  const hydrating = useSyncExternalStore(
    subscribeNothing,
    () => false,
    () => true,
  );
  const bornInHydration = useRef(hydrating);
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');

  useEffect(() => {
    if (seenBursts.has(burstKey)) return;
    seenBursts.add(burstKey);
    if (performance.now() - lastPopstateAt < AFTER_POPSTATE_MS) return;
    if (bornInHydration.current) {
      const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (entry && entry.type !== 'navigate') return;
    }
    setPhase('in');
  }, [burstKey]);

  // Pewaktu di efek terpisah yang mengikuti fase: di Strict Mode efek di atas
  // jalan dua kali dan putaran keduanya berhenti di `seenBursts` — pewaktu
  // yang dipasang di sana ikut terhapus dan kartu tidak pernah pergi.
  useEffect(() => {
    if (phase === 'hidden') return;
    const timer = setTimeout(() => setPhase(phase === 'in' ? 'out' : 'hidden'), phase === 'in' ? VISIBLE_MS : EXIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'hidden') return null;

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex justify-center px-4">
      <div
        className={cn(
          'relative flex w-full max-w-[400px] items-center gap-4 rounded-[22px] border border-line bg-panel p-2.5 pr-6 shadow-overlay',
          phase === 'out' ? 'celebrate-out' : 'celebrate-in',
        )}
      >
        {celebration.confetti && <Confetti />}
        <span className="dot-grid flex size-[68px] shrink-0 items-center justify-center rounded-[16px] bg-highlight-soft text-ink">
          <Art art={celebration.art} />
        </span>
        <span className="flex min-w-0 flex-col items-start gap-1.5">
          <span
            className="stamp rounded-[6px] border-2 border-current px-2 py-px font-mono text-[10.5px] font-medium tracking-[.14em]"
            style={{ '--d': '240ms' } as CSSProperties}
          >
            {celebration.stamp}
          </span>
          <span className="font-display text-[17px] font-bold leading-tight tracking-[-0.02em] text-ink">{celebration.title}</span>
        </span>
      </div>
    </div>,
    document.body,
  );
}
