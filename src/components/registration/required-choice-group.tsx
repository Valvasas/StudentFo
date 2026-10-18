'use client';

import { useEffect } from 'react';

/**
 * "Pilih minimal satu" untuk grup kotak centang wajib. HTML tidak punya
 * padanannya (`required` di tiap kotak = SEMUA wajib dicentang), padahal grup
 * kosong yang lolos ke server dibalas pengalihan galat yang mengosongkan
 * seluruh isian. Pesan dipasang di kotak pertama supaya peramban menahan
 * kiriman dan menunjuk grupnya; tanpa JS, server tetap menolak.
 */
export function RequiredChoiceGroup({ name, message }: { name: string; message: string }) {
  useEffect(() => {
    const boxes = Array.from(document.getElementsByName(name)).filter(
      (element): element is HTMLInputElement => element instanceof HTMLInputElement && element.type === 'checkbox',
    );
    const first = boxes[0];
    if (!first) return;
    const sync = () => first.setCustomValidity(boxes.some((box) => box.checked) ? '' : message);
    sync();
    for (const box of boxes) box.addEventListener('change', sync);
    return () => {
      for (const box of boxes) box.removeEventListener('change', sync);
      first.setCustomValidity('');
    };
  }, [name, message]);
  return null;
}
