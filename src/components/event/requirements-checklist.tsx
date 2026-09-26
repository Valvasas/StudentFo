'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Daftar cek syarat (kanvas desain Detail, tab Syarat). Kotak centang HTML
 * sungguhan: tanpa JavaScript tetap bisa dicentang, hanya ringkasan
 * "n dari m" yang butuh JS. Centangan tidak disimpan — ini alat bantu
 * membaca, bukan pernyataan kelayakan.
 */
export function RequirementsChecklist({ items }: { items: readonly string[] }) {
  const [checked, setChecked] = useState<readonly boolean[]>(() => items.map(() => false));
  const done = checked.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col border-t border-line">
        {items.map((item, index) => (
          <li key={item}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3.5 border-b border-line px-1 py-4 transition-colors duration-150 hover:bg-panel-nested/60">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={checked[index] ?? false}
                onChange={(event) => setChecked((current) => current.map((value, i) => (i === index ? event.target.checked : value)))}
              />
              <span
                aria-hidden
                className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px] border-line-strong text-on-brand transition-colors duration-150 peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
              >
                <Check className="size-3.5" strokeWidth={2.6} />
              </span>
              <span className={cn('text-[15px] leading-normal', checked[index] && 'text-ink-muted')}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-[13.5px] font-semibold" aria-live="polite">
        {done === items.length ? 'Semua syarat sudah kamu penuhi.' : `${done} dari ${items.length} syarat sudah kamu tandai.`}
      </p>
    </div>
  );
}
