import { LogoMark } from '@/components/ui/logo';
import { cn } from '@/lib/utils';

/**
 * Logotipe "StudentFo" (ADR-095): potongan display Bricolage yang dirapatkan
 * + coretan stabilo gambar tangan di "Fo" — dua bahan yang sama dengan logo
 * toga-map milik pemilik (tinta + stabilo). Teksnya HTML biasa, jadi nama
 * aksesibelnya tetap "StudentFo" dan tajam di ukuran berapa pun.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('wordmark', className)}>
      Student<span className="marker marker-draw">Fo</span>
    </span>
  );
}

/**
 * Logo + logotipe untuk tautan beranda (navbar, footer). Pakai di dalam
 * elemen ber-`group`: saat disentuh stabilonya ditarik ulang dan toganya
 * terangkat sedikit — satu gerakan, lalu diam (reduced-motion: tanpa gerak).
 */
export function BrandLockup({ markClassName, textClassName }: { markClassName?: string; textClassName?: string }) {
  return (
    <>
      <LogoMark
        className={cn(
          'transition-transform duration-300 ease-[var(--easing-spring)] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:-rotate-6',
          markClassName,
        )}
      />
      <Wordmark className={textClassName} />
    </>
  );
}
