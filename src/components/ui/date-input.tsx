'use client';

import { useId, useState, type InputHTMLAttributes } from 'react';
import { TextInput } from '@/components/ui/field';
import { formatPickedDate } from '@/lib/date-input';

/**
 * `<input type="date">` bawaan peramban + gema tanggal panjang di bawahnya.
 * Tetap isian native (kalender, keyboard, pembaca layar), dan nilai terkirim
 * ISO seperti biasa; gema hanya menghapus keraguan mm/dd vs dd/mm. Tanpa
 * JavaScript gemanya tidak ada dan isiannya tetap berfungsi.
 */
export function DateInput({ defaultValue, onChange, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [value, setValue] = useState(typeof defaultValue === 'string' ? defaultValue : '');
  const echoId = useId();
  const echo = formatPickedDate(value);
  return (
    <>
      <TextInput
        {...props}
        type="date"
        defaultValue={defaultValue}
        className={className}
        aria-describedby={[props['aria-describedby'], echo ? echoId : undefined].filter(Boolean).join(' ') || undefined}
        onChange={(event) => {
          setValue(event.target.value);
          onChange?.(event);
        }}
      />
      <span id={echoId} aria-live="polite" className="min-h-[1.25em] text-[12.5px] text-ink-muted">
        {echo}
      </span>
    </>
  );
}
