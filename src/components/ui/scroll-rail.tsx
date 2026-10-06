'use client';

import { useEffect, useRef, type HTMLAttributes } from 'react';

/**
 * `<nav>` bergulir horizontal yang memastikan tautan `aria-current="page"`
 * terlihat (ADR-055). Di ponsel tab terakhir (Koneksi → Pengaturan, Admin →
 * Lencana & promosi) berada di luar layar; tanpa ini orang yang membuka tab
 * itu tidak melihat penanda di mana ia berada.
 *
 * Menggeser `scrollLeft` rel saja, BUKAN `scrollIntoView` — yang kedua ikut
 * menggulir halaman secara vertikal ke rel. Tanpa JavaScript rel tetap bisa
 * digeser manual seperti sebelumnya.
 */
export function ScrollRail({ children, ...props }: HTMLAttributes<HTMLElement> & { 'aria-label': string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const rail = ref.current;
    const active = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!rail || !active || rail.scrollWidth <= rail.clientWidth) return;
    const railBox = rail.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    if (box.left >= railBox.left && box.right <= railBox.right) return;
    rail.scrollLeft += box.left - railBox.left - (railBox.width - box.width) / 2;
  });

  return (
    <nav ref={ref} {...props}>
      {children}
    </nav>
  );
}
