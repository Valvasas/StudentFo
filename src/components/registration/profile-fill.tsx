'use client';

import { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ProfileFillItem } from '@/lib/profile-fill';

/** Setter bawaan + event, supaya `UnsavedChangesGuard` & komponen terkendali melihat isian baru (pola `FieldMemory`). */
function fillControl(element: Element, value: string): boolean {
  if (element instanceof HTMLSelectElement) {
    if (element.value !== '' || ![...element.options].some((option) => option.value === value)) return false;
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.value !== '') return false;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  return false;
}

/**
 * Tombol "Isi dari profilku" (ADR-094). Hanya mengisi kolom yang masih
 * KOSONG, tidak pernah mengirim apa pun, dan menyebutkan kolom mana yang
 * diisi supaya pendaftar memeriksanya. Tanpa JavaScript tombolnya tidak ada.
 */
export function ProfileFill({ items }: { items: readonly ProfileFillItem[] }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (items.length === 0) return null;

  const fill = () => {
    const form = anchor.current?.closest('form');
    if (!form) return;
    const filled: string[] = [];
    for (const item of items) {
      const target = form.elements.namedItem(item.name);
      if (target instanceof RadioNodeList) {
        const radio = [...target].find((node): node is HTMLInputElement => node instanceof HTMLInputElement && node.value === item.value);
        const anyChecked = [...target].some((node) => node instanceof HTMLInputElement && node.checked);
        if (radio && !anyChecked) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          filled.push(item.label);
        }
      } else if (target && fillControl(target, item.value)) {
        filled.push(item.label);
      }
    }
    setMessage(
      filled.length > 0
        ? `${filled.length} kolom diisi dari profilmu: ${filled.join(', ')}. Periksa lagi sebelum mengirim.`
        : 'Kolom yang cocok sudah terisi — tidak ada yang diubah.',
    );
  };

  return (
    <div ref={anchor} className="flex flex-col gap-2 rounded-card border border-dashed border-line-strong/70 bg-panel-nested px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-[13.5px] leading-snug text-ink-soft">
          <span className="font-semibold text-ink">Hemat waktu:</span> {items.map((item) => item.source).join(', ')} bisa diisi dari profilmu.
        </p>
        <button
          type="button"
          onClick={fill}
          className="press inline-flex min-h-11 items-center gap-1.5 rounded-card border border-line bg-panel px-3 text-sm font-semibold transition-colors duration-150 ease-snap hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Sparkles aria-hidden className="size-4" /> Isi dari profilku
        </button>
      </div>
      <p role="status" className={message ? 'text-[13px] text-ink-soft' : 'sr-only'}>
        {message}
      </p>
    </div>
  );
}
