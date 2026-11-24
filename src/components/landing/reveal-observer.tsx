'use client';

import { useEffect } from 'react';

/**
 * Menjalankan animasi `[data-reveal]` (globals.css §5) dan penghitung
 * `[data-count-up]` (§14, `CountUp`) saat elemen masuk layar. CSS baru
 * menyembunyikan/mengganti apa pun setelah komponen ini menandai <html>,
 * jadi tanpa JS semuanya tetap tampil apa adanya.
 */
export function RevealObserver() {
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const root = document.documentElement;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-revealed', '');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -40px 0px' },
    );
    // Yang sudah terlihat saat halaman dibuka langsung ditandai terungkap,
    // supaya tidak berkedip hilang lalu muncul lagi.
    const viewportBottom = window.innerHeight;
    for (const element of document.querySelectorAll('[data-reveal], [data-count-up]')) {
      if (element.getBoundingClientRect().top < viewportBottom) element.setAttribute('data-revealed', '');
      else observer.observe(element);
    }
    root.setAttribute('data-reveal-ready', '');
    return () => {
      observer.disconnect();
      root.removeAttribute('data-reveal-ready');
    };
  }, []);

  return null;
}
