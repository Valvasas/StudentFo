'use client';

import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Tombol kirim untuk form dengan DUA tujuan (form daftar: "Buat akun" dan
 * "Daftar dengan Google" lewat `formAction`). `SubmitButton` biasa membaca
 * status form, jadi kedua tombol akan sama-sama berputar; di sini hanya
 * tombol yang diklik.
 *
 * Tombol utama dikenali dari pasangan `intent` yang ikut terkirim. Tombol
 * ber-`formAction` Server Action TIDAK boleh diberi `name`: React memakai
 * atribut itu untuk id aksi (jalur tanpa JS), jadi ia dikenali sebagai
 * pengirim tanpa `intent`.
 */
export function IntentSubmitButton({
  intent,
  pendingLabel,
  children,
  className,
  disabled,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'name' | 'value'> & { intent?: string; pendingLabel: string }) {
  const { pending, data } = useFormStatus();
  const mine = pending && (intent ? data?.get('intent') === intent : !data?.has('intent'));

  return (
    <button
      {...props}
      type="submit"
      {...(intent ? { name: 'intent', value: intent } : {})}
      disabled={pending || disabled}
      aria-busy={mine || undefined}
      className={cn('relative', mine && 'cursor-progress', className)}
    >
      <span className={cn('contents', mine && 'invisible')}>{children}</span>
      {mine && (
        <span className="fade-in absolute inset-0 flex items-center justify-center gap-2 overflow-hidden px-3">
          <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
          <span className="truncate">{pendingLabel}</span>
        </span>
      )}
    </button>
  );
}
