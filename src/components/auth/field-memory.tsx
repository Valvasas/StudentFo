'use client';

import { useEffect, useRef } from 'react';

type Restorable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function restorable(element: Element | RadioNodeList | null): Restorable | null {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element;
  // Sandi, kotak centang, dan isian tersembunyi TIDAK PERNAH disimpan.
  if (element instanceof HTMLInputElement && !['password', 'hidden', 'checkbox', 'radio', 'file'].includes(element.type)) return element;
  return null;
}

/**
 * Penahan isian form akun yang panjang. Form ini tanpa JavaScript klien:
 * galat server (CAPTCHA kedaluwarsa, email sudah terdaftar) = redirect, dan
 * semua isian — termasuk "bukti peran" 1.000 karakter — hilang. Saat kirim,
 * kolom teks disalin ke `sessionStorage` (hanya tab ini, hilang saat tab
 * ditutup); bila halaman kembali dengan `?error=`, kolom yang masih kosong
 * diisi lagi. Kembali tanpa galat = salinannya dibuang.
 *
 * Penyimpanan bisa tidak tersedia (mode privat, diblokir) — semua akses
 * dibungkus try/catch dan form tetap berfungsi seperti biasa.
 */
export function FieldMemory({ storageKey, fields, restore }: { storageKey: string; fields: readonly string[]; restore: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchor.current?.closest('form');
    if (!form) return;
    const key = `sf_form:${storageKey}`;

    try {
      const saved = restore ? (JSON.parse(sessionStorage.getItem(key) ?? 'null') as unknown) : null;
      if (saved && typeof saved === 'object') {
        for (const name of fields) {
          const value = (saved as Record<string, unknown>)[name];
          const element = restorable(form.elements.namedItem(name));
          if (element && typeof value === 'string' && element.value === '') element.value = value.slice(0, 2000);
        }
      } else if (!restore) {
        sessionStorage.removeItem(key);
      }
    } catch {
      // Penyimpanan tidak tersedia atau isinya rusak: form tetap jalan tanpa pemulihan.
    }

    const save = () => {
      const values: Record<string, string> = {};
      for (const name of fields) {
        const element = restorable(form.elements.namedItem(name));
        if (element) values[name] = element.value;
      }
      try {
        sessionStorage.setItem(key, JSON.stringify(values));
      } catch {
        // Penuh atau diblokir — kiriman tetap jalan.
      }
    };
    form.addEventListener('submit', save);
    return () => form.removeEventListener('submit', save);
  }, [storageKey, fields, restore]);

  return <span ref={anchor} hidden />;
}
