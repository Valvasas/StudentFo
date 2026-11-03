'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * Pintasan "/" ke kotak cari pertama yang ditandai `data-search-shortcut`
 * (konvensi GitHub, YouTube, MDN). Dipasang SEKALI di root layout; halaman
 * tanpa kotak cari bertanda tidak terpengaruh. Tidak pernah membajak "/"
 * yang sedang diketik di isian lain, dan dilewati bila ada pengubah (Ctrl/
 * Cmd/Alt) supaya pintasan peramban tetap jalan. Tanpa JavaScript: kotak
 * cari tetap bisa diklik — ini hanya jalan pintas.
 */
export function SearchShortcut() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.closest(EDITABLE)) return;
      const input = document.querySelector<HTMLInputElement>('input[data-search-shortcut]');
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}

/**
 * Penanda tombol "/" di dalam kotak cari. Hanya untuk penunjuk presisi (di
 * layar sentuh tidak ada papan ketik fisik) dan hanya selama kotaknya kosong
 * & tidak difokus — setelah itu ia menutupi teks dan tombol hapus bawaan.
 * Wajib diletakkan SETELAH `<input className="peer …">` di wadah yang sama.
 */
export function SearchShortcutHint({ className }: { className?: string }) {
  return (
    <kbd
      aria-hidden
      className={cn(
        'pointer-events-none hidden h-6 min-w-6 items-center justify-center rounded-[6px] border border-line bg-panel-nested px-1.5 text-xs font-semibold text-ink-muted pointer-fine:peer-[:placeholder-shown:not(:focus)]:inline-flex',
        className,
      )}
    >
      /
    </kbd>
  );
}
