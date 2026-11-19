'use client';

import { Heart } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Tombol Suka (ADR-092) — pola `BookmarkSubmit` (ADR-064): selama Server
 * Action berjalan, ikon & angka langsung menampilkan HASIL ketukan, bukan
 * pemutar. Suka/batal hampir tidak pernah gagal; menunggu dengan pemutar
 * membuat orang mengetuk lagi (= batal tanpa sengaja). Bila aksinya gagal,
 * halaman dirender ulang dari data sungguhan dan keadaannya kembali benar.
 *
 * Tombol toggle: namanya TETAP "Suka", keadaannya lewat `aria-pressed` dan
 * hati terisi (bentuk, bukan warna saja). Tanpa JavaScript tetap
 * `<button type="submit">` biasa.
 */
export function LikeSubmit({ liked, likes, className }: { liked: boolean; likes: number; className?: string }) {
  const { pending } = useFormStatus();
  const showLiked = pending ? !liked : liked;
  const count = pending ? Math.max(likes + (liked ? -1 : 1), 0) : likes;

  return (
    <button
      type="submit"
      disabled={pending}
      aria-pressed={showLiked}
      aria-busy={pending || undefined}
      aria-label={`Suka, ${count.toLocaleString('id-ID')} orang menyukai`}
      className={cn(
        'inline-flex h-11 items-center gap-1.5 rounded-pill border px-3 text-sm font-medium transition-colors duration-150 ease-snap sm:gap-2 sm:px-4',
        showLiked ? 'border-like-line bg-like-soft text-like hover:border-like' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink',
        pending && 'cursor-progress',
        className,
      )}
    >
      <Heart aria-hidden className={cn('size-4', showLiked && 'fill-current', pending && showLiked && 'save-pop')} />
      <span aria-hidden>Suka</span>
      {/* Nol tidak ditampilkan: "Suka 0" terbaca sebagai "tidak ada yang tertarik" (bukti sosial negatif). */}
      {count > 0 && (
        <span aria-hidden className="tabular-nums">
          {count.toLocaleString('id-ID')}
        </span>
      )}
    </button>
  );
}
