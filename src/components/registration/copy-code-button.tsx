'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Salin kode pendaftaran. Dirender setelah hidrasi dan hanya bila Clipboard
 * API tersedia (konteks aman) — tanpa itu kodenya tetap bisa diseleksi
 * dengan satu ketukan (`select-all` di pemanggil).
 */
export function CopyCodeButton({ code, className }: { code: string; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setSupported(typeof navigator !== 'undefined' && Boolean(navigator.clipboard)), []);
  if (!supported) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Izin clipboard ditolak: kodenya tetap terlihat dan bisa diseleksi.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'press inline-flex h-11 shrink-0 items-center gap-2 rounded-card border border-line bg-panel px-3.5 text-sm font-semibold transition-colors duration-150 ease-snap hover:border-line-strong',
        className,
      )}
    >
      {copied ? <Check aria-hidden className="size-4 text-success" /> : <Copy aria-hidden className="size-4" />}
      <span aria-live="polite">
        {copied ? 'Disalin' : 'Salin'}
        <span className="sr-only"> kode pendaftaran</span>
      </span>
    </button>
  );
}
