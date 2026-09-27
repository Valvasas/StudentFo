'use client';

import { useEffect } from 'react';

/**
 * Menandai bab yang sedang dibaca di daftar isi (kanvas Kebijakan Privasi).
 * Daftar isinya tautan jangkar biasa — pulau ini hanya menambah
 * `aria-current`, jadi tanpa JavaScript navigasinya tetap utuh.
 */
export function TocSpy({ navId, prefix, count }: { navId: string; prefix: string; count: number }) {
  useEffect(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(`#${navId} a[href^="#${prefix}"]`));
    let frame = 0;
    const update = () => {
      frame = 0;
      let active = 1;
      for (let index = 1; index <= count; index++) {
        const section = document.getElementById(`${prefix}${index}`);
        if (section && section.getBoundingClientRect().top < 160) active = index;
      }
      links.forEach((link) => {
        if (link.getAttribute('href') === `#${prefix}${active}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [navId, prefix, count]);
  return null;
}
