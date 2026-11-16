'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const itemClass =
  'flex min-h-11 w-full items-center gap-2.5 rounded-sm px-3 text-left text-sm font-medium transition-colors duration-150 ease-snap hover:bg-panel-nested';

/**
 * "Salin tautan" + lembar bagikan bawaan ponsel (ADR-092). Server & render
 * pertama = isian tautan biasa (bisa dipilih & disalin manual tanpa
 * JavaScript); setelah hidrasi menjadi tombol. Clipboard yang ditolak
 * (http, izin) jatuh kembali ke isian yang sama — tautan selalu bisa diambil.
 */
export function ShareQuickActions({ title, url }: { title: string; url: string }) {
  const [ready, setReady] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setReady(true);
    setCanShare(typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    if (manual) input.current?.select();
  }, [manual]);

  if (!ready || manual) {
    return (
      <label className="flex flex-col gap-1 px-3 pb-2 pt-1 text-[12.5px] text-ink-muted">
        {manual ? 'Salin tautan ini:' : 'Tautan kegiatan'}
        <input
          ref={input}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 rounded-sm border border-line bg-panel px-2 text-[13px] text-ink"
        />
      </label>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setManual(true);
    }
  }

  async function share() {
    try {
      await navigator.share({ title, url });
    } catch {
      // Dibatalkan pengguna, atau ditolak peramban: menu tetap terbuka untuk pilihan lain.
    }
  }

  return (
    <>
      {canShare && (
        <button type="button" onClick={share} className={itemClass}>
          <Share2 aria-hidden className="size-4 shrink-0 text-ink-muted" />
          Bagikan lewat aplikasi…
        </button>
      )}
      <button type="button" onClick={copy} className={cn(itemClass, copied && 'text-success')}>
        {copied ? <Check aria-hidden className="size-4 shrink-0" /> : <Copy aria-hidden className="size-4 shrink-0 text-ink-muted" />}
        <span aria-live="polite">{copied ? 'Tautan disalin' : 'Salin tautan'}</span>
      </button>
    </>
  );
}
