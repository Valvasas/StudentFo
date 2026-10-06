'use client';

import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { controlClass } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/**
 * Isian kata sandi dengan tombol Tampilkan/Sembunyikan (kanvas desain Login).
 *
 * Tombolnya baru dirender setelah hidrasi: tanpa JavaScript tombol itu tidak
 * bisa berbuat apa-apa, dan tombol mati di tengah form lebih membingungkan
 * daripada tidak ada tombol sama sekali.
 */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <span className="relative block">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn(controlClass, 'pr-28')}
      />
      {ready && (
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-pressed={visible}
          aria-controls={props.id}
          className="absolute right-1 top-1 flex h-9 min-w-11 items-center justify-center rounded-[9px] px-2.5 text-[13px] font-semibold text-ink-muted transition-colors duration-150 ease-snap after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-panel-nested hover:text-ink"
        >
          {visible ? 'Sembunyikan' : 'Tampilkan'}
          <span className="sr-only"> kata sandi</span>
        </button>
      )}
    </span>
  );
}
