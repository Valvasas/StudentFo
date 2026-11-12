'use client';

import { useEffect, useRef } from 'react';
import { FIELD_MEMORY_PREFIX } from '@/lib/form-data';

type Restorable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Saved = Record<string, string | readonly string[]>;

function restorable(element: Element | RadioNodeList | null): Restorable | null {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element;
  // Sandi, kotak centang, dan isian tersembunyi TIDAK PERNAH disimpan lewat `fields`.
  if (element instanceof HTMLInputElement && !['password', 'hidden', 'checkbox', 'radio', 'file'].includes(element.type)) return element;
  return null;
}

/** Kotak centang & radio bernama `name` — hanya untuk nama yang didaftarkan lewat `choices`. */
function choiceInputs(form: HTMLFormElement, name: string): HTMLInputElement[] {
  return [...form.elements].filter(
    (element): element is HTMLInputElement => element instanceof HTMLInputElement && element.name === name && (element.type === 'checkbox' || element.type === 'radio'),
  );
}

/**
 * Setter bawaan prototipe + event, bukan `element.value = …` saja: React
 * membungkus properti `value`, sehingga penugasan biasa tidak terlihat oleh
 * komponen yang menggemakan isiannya (`DateInput`) atau menjaganya
 * (`UnsavedChangesGuard`).
 */
function fill(element: Restorable, value: string): void {
  if (element instanceof HTMLSelectElement) {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Isian yang dipulihkan tidak boleh tersembunyi di bagian terlipat. */
function reveal(element: Element): void {
  element.closest('details')?.setAttribute('open', '');
}

/**
 * Penahan isian form panjang (daftar akun, kirim kegiatan). Form ini tanpa
 * JavaScript klien: galat server (CAPTCHA kedaluwarsa, email sudah terdaftar,
 * poster ditolak) = redirect, dan semua isian — termasuk "bukti peran" 1.000
 * karakter — hilang. Saat kirim, kolom di `fields` disalin ke
 * `sessionStorage` (hanya tab ini, hilang saat tab ditutup); bila halaman
 * kembali dengan `?error=`, kolom yang masih kosong diisi lagi. Kembali tanpa
 * galat = salinannya dibuang.
 *
 * `choices` = nama kelompok kotak centang/radio yang ikut dipulihkan. Daftar
 * eksplisit, bukan "semua kotak centang": persetujuan (syarat, usia, kebijakan
 * privasi) TIDAK BOLEH pernah tercentang sendiri, jadi form akun tidak
 * mendaftarkan apa pun di sini. Berkas tidak pernah bisa dipulihkan —
 * peramban melarang mengisinya lewat skrip.
 *
 * Penyimpanan bisa tidak tersedia (mode privat, diblokir) — semua akses
 * dibungkus try/catch dan form tetap berfungsi seperti biasa.
 */
export function FieldMemory({
  storageKey,
  fields,
  choices = NO_CHOICES,
  restore,
}: {
  storageKey: string;
  fields: readonly string[];
  choices?: readonly string[];
  restore: boolean;
}) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchor.current?.closest('form');
    if (!form) return;
    const key = `${FIELD_MEMORY_PREFIX}${storageKey}`;

    try {
      const saved = restore ? (JSON.parse(sessionStorage.getItem(key) ?? 'null') as unknown) : null;
      if (saved && typeof saved === 'object') {
        const values = saved as Record<string, unknown>;
        for (const name of fields) {
          const value = values[name];
          const element = restorable(form.elements.namedItem(name));
          if (element && typeof value === 'string' && value !== '' && element.value === '') {
            fill(element, value.slice(0, FIELD_LIMIT));
            reveal(element);
          }
        }
        for (const name of choices) {
          const value = values[name];
          if (!Array.isArray(value)) continue;
          for (const input of choiceInputs(form, name)) {
            const checked = value.includes(input.value);
            if (input.checked === checked) continue;
            input.checked = checked;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            if (checked) reveal(input);
          }
        }
      } else if (!restore) {
        sessionStorage.removeItem(key);
      }
    } catch {
      // Penyimpanan tidak tersedia atau isinya rusak: form tetap jalan tanpa pemulihan.
    }

    const save = () => {
      const values: Record<string, string | string[]> = {};
      for (const name of fields) {
        const element = restorable(form.elements.namedItem(name));
        if (element) values[name] = element.value;
      }
      for (const name of choices) {
        values[name] = choiceInputs(form, name)
          .filter((input) => input.checked)
          .map((input) => input.value);
      }
      try {
        sessionStorage.setItem(key, JSON.stringify(values satisfies Saved));
      } catch {
        // Penuh atau diblokir — kiriman tetap jalan.
      }
    };
    form.addEventListener('submit', save);
    return () => form.removeEventListener('submit', save);
  }, [storageKey, fields, choices, restore]);

  return <span ref={anchor} hidden />;
}

const NO_CHOICES: readonly string[] = [];
/** Deskripsi kegiatan (5.000 karakter) adalah kolom terpanjang yang diingat. */
const FIELD_LIMIT = 5000;
