'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { isMotionReduced } from '@/lib/motion-pref';

/**
 * Animasi tata letak (FLIP) untuk daftar yang diurutkan ulang server
 * (ADR-099): Papan lamaran diurutkan menurut perubahan terakhir, jadi kartu
 * yang tahapnya baru diubah naik ke atas. Tanpa ini ia "teleport"; dengan
 * ini kartu meluncur ke tempat barunya dan tetangganya bergeser — orang
 * melihat KE MANA kartunya pergi.
 *
 * Cara kerja: posisi anak `[data-flip-key]` (relatif ke daftar, jadi notice
 * yang muncul di atas halaman tidak dihitung sebagai perpindahan) dicatat
 * setiap render; saat render berikutnya, anak yang berpindah digeser balik
 * ke posisi lamanya lalu dilepas dengan transisi `transform` (`flip-move`,
 * 320ms). Hanya `transform`; reduced-motion = langsung di tempat baru.
 * Tanpa JS = daftar biasa.
 */
export function FlipList({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const origin = root.getBoundingClientRect().top;
    const reduce = isMotionReduced();
    const next = new Map<string, number>();

    for (const element of root.querySelectorAll<HTMLElement>(':scope > [data-flip-key]')) {
      const key = element.dataset.flipKey ?? '';
      const top = element.getBoundingClientRect().top - origin;
      next.set(key, top);
      const previous = positions.current.get(key);
      if (reduce || previous === undefined || Math.abs(previous - top) < 1) continue;

      element.classList.remove('flip-move');
      element.style.transform = `translateY(${previous - top}px)`;
      // Yang naik melintas DI ATAS tetangga yang turun.
      element.style.zIndex = previous > top ? '2' : '1';
      // Paksa tata letak dengan posisi lama sebelum transisinya dilepas.
      void element.offsetHeight;
      element.classList.add('flip-move');
      element.style.transform = '';
      // `transitionend` menggelembung dari anak (isian tahap, warna tombol):
      // hanya akhir transisi `transform` milik kartu ini yang menutupnya.
      const settle = (end: TransitionEvent) => {
        if (end.target !== element || end.propertyName !== 'transform') return;
        element.removeEventListener('transitionend', settle);
        element.classList.remove('flip-move');
        element.style.zIndex = '';
      };
      element.addEventListener('transitionend', settle);
    }
    positions.current = next;
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
