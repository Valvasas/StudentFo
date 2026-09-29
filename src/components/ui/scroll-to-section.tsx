'use client';

import { useEffect } from 'react';

/**
 * Gulir ke satu bagian halaman setelah navigasi dari Server Action.
 *
 * Redirect Server Action di Next membuang #fragmen saat JavaScript aktif
 * (tanpa JavaScript, 303 + Location#fragmen tetap dihormati browser). Maka
 * tujuan membawa `?fokus=` juga, dan komponen ini menuntaskannya: gulir ke
 * judul bagian dan pindahkan fokus ke sana supaya pembaca layar ikut sampai.
 */
export function ScrollToSection({ id }: { id: string | null }) {
  useEffect(() => {
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }, [id]);
  return null;
}
