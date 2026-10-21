'use client';

import { useCallback, useEffect, useState } from 'react';
import { NudgeArrowDoodle } from '@/components/ui/illustrations';
import { isMotionReduced } from '@/lib/motion-pref';

const HINTED_KEY = 'sf-deck-hinted';
const MOVING_MS = 2400;
const STATIC_MS = 4000;

/**
 * Petunjuk "Geser kartunya": sekali per sesi tab (sessionStorage — opsional,
 * halaman benar tanpanya). `showing` juga dipakai deck untuk menggoyang kartu
 * depan dua kali; di reduced-motion tidak ada goyangan, hanya panah + teks
 * statis 4 detik. Hilang pada sentuhan pertama.
 */
export function useNudgeHint(enabled: boolean, delayMs: number): { showing: boolean; stop: () => void } {
  const [showing, setShowing] = useState(false);
  const stop = useCallback(() => setShowing(false), []);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (window.sessionStorage.getItem(HINTED_KEY)) return;
    } catch {
      return;
    }
    const start = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(HINTED_KEY, '1');
      } catch {
        // Tanpa penyimpanan petunjuk bisa muncul lagi di muat ulang; tidak berbahaya.
      }
      setShowing(true);
    }, delayMs);
    return () => window.clearTimeout(start);
  }, [enabled, delayMs]);

  useEffect(() => {
    if (!showing) return;
    const end = window.setTimeout(() => setShowing(false), isMotionReduced() ? STATIC_MS : MOVING_MS);
    return () => window.clearTimeout(end);
  }, [showing]);

  return { showing, stop };
}

/** Tempat petunjuk selalu dipesan (tinggi tetap) supaya kemunculannya tidak menggeser tata letak. */
export function NudgeHint({ showing }: { showing: boolean }) {
  return (
    <div aria-hidden className="flex h-8 items-center justify-center gap-2 text-[13px] font-medium text-ink-muted">
      {showing && (
        <>
          <span>Geser kartunya</span>
          <NudgeArrowDoodle className="nudge" />
        </>
      )}
    </div>
  );
}
