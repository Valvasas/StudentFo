import { initialsOf } from '@/lib/initials';
import { tintOf, type Tint } from '@/lib/tint';
import { cn } from '@/lib/utils';

/** Nama kelas ditulis utuh: Tailwind hanya membangkitkan kelas yang terbaca literal di sumber. */
export const TINT_BG: Record<Tint, string> = {
  sun: 'bg-tint-sun',
  mint: 'bg-tint-mint',
  peach: 'bg-tint-peach',
  sky: 'bg-tint-sky',
  lilac: 'bg-tint-lilac',
};

const SIZE = {
  xs: 'size-6 text-[10px]',
  sm: 'size-9 text-[12px]',
  md: 'size-11 text-[13.5px]',
  lg: 'size-14 text-base',
  xl: 'size-20 text-[22px]',
} as const;

export type AvatarSize = keyof typeof SIZE;

/**
 * Inisial di atas tint catatan tempel (ADR-054). `seed` = id yang stabil
 * (userId, id grup, id percakapan) supaya warnanya tidak berubah ketika
 * nama diganti; nama hanya dipakai bila id tidak ada.
 *
 * Selalu `aria-hidden`: nama orangnya sudah tertulis di sebelah avatar.
 * Inisial yang ikut dibacakan ("R P, Rani Prameswari") hanya menambah gema.
 */
export function Avatar({
  name,
  seed,
  label,
  size = 'md',
  shape = 'circle',
  ring = false,
  className,
}: {
  name: string;
  seed?: string;
  /** Huruf yang tampil bila bukan inisial nama orang (mis. `monogramOf` untuk grup). */
  label?: string;
  size?: AvatarSize;
  shape?: 'circle' | 'square';
  /** Cincin selebar kertas: untuk avatar yang ditumpuk atau menimpa sampul. */
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 select-none items-center justify-center font-display font-semibold tracking-[-0.02em] text-ink',
        SIZE[size],
        TINT_BG[tintOf(seed ?? name)],
        shape === 'circle' ? 'rounded-pill' : 'rounded-[30%]',
        ring && 'ring-[3px] ring-panel',
        className,
      )}
    >
      {label ?? initialsOf(name)}
    </span>
  );
}

/** Tumpukan avatar bertumpuk (anggota tim, peserta utas). Sisa dihitung, bukan dipotong diam-diam. */
export function AvatarStack({
  people,
  max = 4,
  size = 'sm',
  className,
}: {
  people: readonly { readonly name: string; readonly seed?: string }[];
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span aria-hidden className={cn('flex items-center', className)}>
      {shown.map((person, index) => (
        <Avatar key={`${person.seed ?? person.name}-${index}`} name={person.name} seed={person.seed} size={size} ring className={index > 0 ? '-ml-2' : undefined} />
      ))}
      {rest > 0 && (
        <span className={cn('-ml-2 flex items-center justify-center rounded-pill bg-panel-nested font-mono font-medium text-ink-soft ring-[3px] ring-panel', SIZE[size])}>
          +{rest}
        </span>
      )}
    </span>
  );
}
