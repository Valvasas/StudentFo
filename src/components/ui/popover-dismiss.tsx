'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const OPEN_POPOVERS = 'details[data-popover][open]';
/** Jarak panel ke tepi bawah layar saat tingginya dihitung ulang. */
const BOTTOM_GAP = 12;

function openPopovers(): HTMLDetailsElement[] {
  return [...document.querySelectorAll<HTMLDetailsElement>(OPEN_POPOVERS)];
}

function closeAll(except?: Element) {
  for (const popover of openPopovers()) {
    if (popover !== except && !popover.contains(except ?? null)) popover.open = false;
  }
}

/**
 * Tinggi panel = sisa layar di bawah posisinya yang SEBENARNYA. Batas CSS
 * (`--popover-max` belum diisi) hanya mengurangi tinggi header, jadi spanduk
 * di atas header (demo, pembaruan kebijakan) bisa mendorong ujung panel
 * keluar layar di ponsel 568px.
 */
function fitToViewport(popover: HTMLDetailsElement) {
  const panel = popover.querySelector<HTMLElement>(':scope > :not(summary)');
  if (!panel) return;
  const viewport = window.visualViewport?.height ?? window.innerHeight;
  const room = Math.floor(viewport - panel.getBoundingClientRect().top - BOTTOM_GAP);
  panel.style.setProperty('--popover-max', `${Math.max(room, 240)}px`);
}

/**
 * "Light dismiss" untuk menu `<details data-popover>` (lonceng, menu akun,
 * Urutkan): tertutup saat mengetuk di luar, menekan Escape (fokus kembali ke
 * pemicunya), membuka menu lain, memilih item, atau pindah halaman.
 *
 * Opt-in lewat atribut, seperti `data-search-shortcut`: `<details>` lain —
 * rincian, form lapor, panel Saring yang SENGAJA tetap terbuka saat memilih
 * beberapa filter — tidak tersentuh. Tanpa JavaScript menu tetap buka-tutup
 * lewat ringkasannya; ini hanya penyempurnaan.
 */
export function PopoverDismiss() {
  const pathname = usePathname();

  // Navigasi Next mempertahankan elemen header yang sama — tanpa ini menu
  // yang dipakai untuk berpindah halaman tetap terbuka di halaman tujuan.
  useEffect(() => {
    closeAll();
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target instanceof Node ? event.target : null;
      for (const popover of openPopovers()) {
        if (!target || !popover.contains(target)) popover.open = false;
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Dialog konfirmasi di dalam menu menangani Escape-nya sendiri.
      if (event.target instanceof Element && event.target.closest('dialog')) return;
      const open = openPopovers();
      const active = document.activeElement;
      const popover = open.find((item) => active && item.contains(active)) ?? open.at(-1);
      if (!popover) return;
      popover.open = false;
      popover.querySelector<HTMLElement>(':scope > summary')?.focus();
    }

    function onToggle(event: Event) {
      const popover = event.target;
      if (!(popover instanceof HTMLDetailsElement) || !popover.hasAttribute('data-popover') || !popover.open) return;
      closeAll(popover);
      fitToViewport(popover);
    }

    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const popover = target.closest<HTMLDetailsElement>('details[data-popover]');
      if (!popover?.open || popover.querySelector(':scope > summary')?.contains(target)) return;
      const link = target.closest('a[href]');
      const submit = target.closest('button[type="submit"], button:not([type]), input[type="submit"]');
      if (!link && !submit) return;
      // Setelah aksi bawaannya berjalan. Tautan selalu menutup (Link Next
      // memanggil preventDefault untuk navigasi klien); tombol yang dicegat —
      // mis. ConfirmSubmit yang membuka dialog di dalam menu — membiarkannya.
      window.setTimeout(() => {
        if (!link && event.defaultPrevented) return;
        popover.open = false;
      }, 0);
    }

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('toggle', onToggle, true);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('toggle', onToggle, true);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return null;
}
