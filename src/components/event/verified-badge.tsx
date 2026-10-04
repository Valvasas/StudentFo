import { useId } from 'react';
import { Landmark, School, UsersRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  VERIFICATION_BADGE_DESCRIPTION,
  VERIFICATION_BADGE_LABEL,
  type VerificationBadge,
} from '@/types/domain';

const ICON: Record<VerificationBadge, LucideIcon> = {
  OFFICIAL_GOV: Landmark,
  CAMPUS_VERIFIED: School,
  COMMUNITY: UsersRound,
};

/**
 * Lencana otoritas penyelenggara (ADR-049) + tooltip penjelasan.
 *
 * Tooltip CSS murni (hover / fokus), tanpa JavaScript: pemicunya <button>
 * sungguhan, jadi bisa dicapai keyboard, dan di layar sentuh ketukan
 * memfokuskannya sehingga penjelasan ikut tampil. `aria-describedby`
 * membuat pembaca layar membacakan penjelasan yang sama — `title` saja
 * tidak terbaca konsisten dan tidak pernah tampil di ponsel.
 *
 * Bentuk ikon yang membedakan jenis lencana, bukan warna (CONVENTIONS:
 * warna tidak pernah satu-satunya pembawa makna). Tooltip rata kiri ke
 * pemicunya: lencana SELALU diletakkan di sisi kiri (awal baris / di bawah
 * nama) supaya kotak penjelasan tidak melewati tepi kanan layar 320px.
 */
export function VerifiedBadge({
  badge,
  showLabel = false,
  className,
}: {
  badge: VerificationBadge;
  showLabel?: boolean;
  className?: string;
}) {
  const tipId = useId();
  const Icon = ICON[badge];
  const label = VERIFICATION_BADGE_LABEL[badge];

  return (
    <span className={cn('group relative z-10 inline-flex shrink-0 items-center', className)}>
      <button
        type="button"
        aria-describedby={tipId}
        aria-label={showLabel ? undefined : label}
        className={cn(
          "relative inline-flex items-center gap-1 rounded-pill text-ink-soft transition-colors duration-150 ease-snap after:absolute after:content-[''] hover:text-ink",
          showLabel ? 'min-h-6 border border-line px-2 text-xs font-medium after:-inset-y-2.5 after:-inset-x-1' : 'size-6 justify-center after:-inset-2.5',
        )}
      >
        <Icon aria-hidden className="size-3.5" />
        {showLabel && <span>{label}</span>}
      </button>
      <span
        id={tipId}
        role="tooltip"
        // `hidden`, bukan invisible/opacity-0: elemen tak terlihat tetap ikut
        // tata letak dan melebarkan halaman 320px. Lebar 100vw-5rem: muat dari
        // posisi lencana paling kanan yang dipakai (≈76px dari tepi kiri).
        className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[min(16rem,calc(100vw-5rem))] rounded-card border border-line bg-panel p-3 text-left text-xs font-normal leading-relaxed text-ink-soft shadow-card group-focus-within:block group-hover:block"
      >
        <strong className="block font-semibold text-ink">{label}</strong>
        {VERIFICATION_BADGE_DESCRIPTION[badge]}
      </span>
    </span>
  );
}
