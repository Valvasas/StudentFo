'use client';

import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Tombol kirim `<form>` Server Action yang tahu dirinya sedang diproses.
 *
 * Tanpa ini klik tidak memberi tanda apa pun sampai redirect selesai —
 * di Supabase sungguhan 0,3–2 detik — dan orang mengeklik lagi (ajakan
 * ganda, simpan-batal-simpan). Peningkatan progresif: tanpa JavaScript ini
 * tetap `<button type="submit">` biasa, jadi alur form + URL (AGENTS §9)
 * tidak berubah.
 *
 * Label tetap di tempatnya (hanya disembunyikan) supaya lebar tombol tidak
 * melompat; nama aksesibelnya berganti jadi "Memproses…" selama menunggu.
 */
export function SubmitButton({
  children,
  className,
  disabled,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      data-pending={pending ? '' : undefined}
      className={cn('relative', pending && 'cursor-progress', className)}
    >
      {/* `contents`: anak tetap ikut tata letak flex/gap tombol. `invisible` diwariskan ke node teks juga. */}
      <span className={cn('contents', pending && 'invisible')}>{children}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          <span className="sr-only">Memproses…</span>
        </span>
      )}
    </button>
  );
}
