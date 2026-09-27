'use client';

import { useEffect, useState, type InputHTMLAttributes } from 'react';

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
        className="h-11 w-full rounded-sm border border-line-strong/70 bg-panel pl-3 pr-28 text-base text-ink transition-colors duration-150 ease-snap placeholder:text-ink-faint hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      {ready && (
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-pressed={visible}
          aria-controls={props.id}
          className="absolute right-0 top-0 flex h-11 min-w-11 items-center justify-center rounded-sm px-3 text-[13px] font-medium text-ink-muted transition-colors duration-150 ease-snap hover:text-ink"
        >
          {visible ? 'Sembunyikan' : 'Tampilkan'}
          <span className="sr-only"> kata sandi</span>
        </button>
      )}
    </span>
  );
}
