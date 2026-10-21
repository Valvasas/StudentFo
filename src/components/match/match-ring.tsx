import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * Cincin kecocokan 0–100. `pathLength="100"` membuat panjang busur = skornya
 * langsung, tanpa menghitung keliling. Satu-satunya pembawa makna adalah
 * ANGKA di tengah (warna bukan pembawa makna); busur hanya memperkuatnya.
 *
 * `delay` menunda pengisian — saat pemindaian berjalan, cincin baru terisi
 * ketika hasil muncul.
 */
export function MatchRing({
  score,
  size = 76,
  delayMs = 0,
  className,
  marked = false,
}: {
  score: number;
  size?: number;
  delayMs?: number;
  className?: string;
  /** Angka ditandai stabilo (skor tinggi). Hanya hiasan; makna tetap di angka dan aria-label. */
  marked?: boolean;
}) {
  const value = Math.min(100, Math.max(0, Math.round(score)));
  return (
    <div role="img" aria-label={`Kecocokan ${value} persen`} className={cn('relative shrink-0 text-brand-text', className)} style={{ width: size, height: size }}>
      <svg aria-hidden viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r="15.9155" pathLength="100" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="3.2" />
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          pathLength="100"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray={`${value} 100`}
          className="ring-fill"
          style={{ '--d': `${delayMs}ms` } as CSSProperties}
        />
      </svg>
      <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center font-display leading-none text-ink">
        <span className={cn('font-bold tracking-[-0.04em]', marked && 'marker')} style={{ fontSize: size * 0.3 }}>
          {value}
        </span>
        <span className="mt-0.5 font-medium text-ink-muted" style={{ fontSize: size * 0.14 }}>
          cocok
        </span>
      </span>
    </div>
  );
}
