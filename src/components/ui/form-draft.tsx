'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const storageKey = (name: string) => `sf-form-draft:${name}`;

function readEntries(key: string): [string, string][] | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data.filter((entry): entry is [string, string] => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string');
  } catch {
    return null;
  }
}

function forget(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* penyimpanan diblokir: draf memang hanya kenyamanan */
  }
}

/** Lewat setter bawaan + event: isian terkontrol React (mis. gema tanggal) ikut tahu nilainya berubah. */
function setValue(control: Control, value: string): void {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function restoreInto(form: HTMLFormElement, entries: readonly [string, string][], skip: ReadonlySet<string>): boolean {
  const values = new Map<string, string[]>();
  for (const [name, value] of entries) values.set(name, [...(values.get(name) ?? []), value]);
  let changed = false;
  for (const element of form.elements) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
    const { name } = element;
    if (!name || name.startsWith('$') || skip.has(name) || element.type === 'hidden' || element.type === 'file') continue;
    const wanted = values.get(name) ?? [];
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
      // click(), bukan `.checked =`: radio lain di grupnya ikut lepas dan onChange React ikut jalan.
      if (element.checked !== wanted.includes(element.value) && (element.type === 'checkbox' || !element.checked)) {
        element.click();
        changed = true;
      }
    } else if (element.value !== (wanted[0] ?? '')) {
      setValue(element, wanted[0] ?? '');
      changed = true;
    }
  }
  return changed;
}

/**
 * Memulihkan isian form TANPA state klien (mis. Kirim kegiatan) setelah
 * server menolaknya. Server Action hanya membalas dengan redirect + kode
 * galat, lalu halaman dirender ulang kosong — tanpa ini isian empat langkah
 * hilang karena satu kolom. Isian ditulis ke sessionStorage (per tab, hilang
 * saat tab ditutup) ketika form dikirim, dipulihkan SEKALI bila `restore`
 * (URL membawa galat), dan dihapus pada kunjungan lain. Kolom di `exclude`
 * (honeypot, token captcha sekali pakai) tidak pernah ditulis.
 *
 * Form dengan state React sendiri memakai draf bertipe (`useSeekerDraft`).
 */
export function FormDraft({
  name,
  restore,
  exclude = '',
  className,
}: {
  name: string;
  restore: boolean;
  /** Nama kolom yang tidak pernah disimpan, dipisah koma. */
  exclude?: string;
  /** Wadah status selalu ada (supaya pengumumannya terbaca); jarak antarkolom induk diatur pemanggil. */
  className?: string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const form = anchorRef.current?.closest('form');
    if (!form) return;
    const key = storageKey(name);
    const skip = new Set(exclude.split(',').filter(Boolean));
    const entries = restore ? readEntries(key) : null;
    forget(key);
    if (entries && restoreInto(form, entries, skip)) setRestored(true);

    const save = () => {
      const kept = [...new FormData(form)].filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && !entry[0].startsWith('$') && !skip.has(entry[0]),
      );
      try {
        window.sessionStorage.setItem(key, JSON.stringify(kept));
      } catch {
        /* penyimpanan penuh atau diblokir */
      }
    };
    form.addEventListener('submit', save);
    return () => form.removeEventListener('submit', save);
  }, [name, restore, exclude]);

  return (
    <div ref={anchorRef} role="status" className={className}>
      {restored && (
        <p className="fade-in flex items-start gap-2.5 rounded-card border border-line bg-panel-nested px-3.5 py-3 text-sm leading-relaxed text-ink">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          Isianmu kami kembalikan. Perbaiki yang ditandai lalu kirim lagi.
        </p>
      )}
    </div>
  );
}
