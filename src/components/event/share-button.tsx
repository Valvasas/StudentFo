'use client';

import { useEffect, useState } from 'react';
import { Check, Share2 } from 'lucide-react';

/**
 * Bagikan (kanvas desain Detail). Memakai lembar bagikan bawaan ponsel bila
 * ada, kalau tidak menyalin tautan. Dirender setelah hidrasi — tanpa
 * JavaScript tombol ini tidak bisa melakukan apa pun.
 */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Pengguna membatalkan lembar bagikan, atau clipboard ditolak: diam saja.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-card px-3.5 text-sm font-medium transition-colors duration-150 ease-snap hover:bg-panel-nested"
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Share2 aria-hidden className="size-4" />}
      <span aria-live="polite">{copied ? 'Tautan disalin' : 'Bagikan'}</span>
    </button>
  );
}
