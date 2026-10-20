import type { CSSProperties } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** Posisi titik pemain di layar radar (persen dari sisi). Enam cukup; lebih dari itu terlihat ramai. */
const BLIP_SPOTS = [
  { x: 24, y: 27 },
  { x: 74, y: 20 },
  { x: 82, y: 64 },
  { x: 30, y: 79 },
  { x: 54, y: 10 },
  { x: 11, y: 56 },
] as const;

/** Setengah sisi avatar `md` (44px), untuk memusatkan titik tanpa `transform` yang bentrok dengan animasinya. */
const BLIP_HALF = 22;

export interface RadarBlip {
  readonly seed: string;
  readonly name: string;
}

/**
 * Layar radar pencarian (ADR-057): cincin, sapuan, gelombang, dan pemain yang
 * "terdeteksi" satu per satu. Murni hiasan — `aria-hidden`, tidak menangkap
 * klik — dan seluruh geraknya animasi CSS (§10 `globals.css`), jadi di
 * reduced-motion ia berhenti sebagai gambar diam yang tetap terbaca.
 *
 * Dibangun dari elemen HTML (bukan SVG) supaya sapuan bisa memakai
 * `conic-gradient` dan titik pemain bisa memakai komponen `Avatar` yang sama
 * dengan kartu hasil — yang muncul di radar adalah orang yang sama dengan
 * yang muncul di daftar.
 */
export function MatchRadar({ blips = [], you, className }: { blips?: readonly RadarBlip[]; you: RadarBlip; className?: string }) {
  return (
    // `overflow-hidden rounded-full`: sapuan adalah kotak persegi yang berputar; kotak pembatasnya
    // (±√2 kali sisi) melewati lebar layar di ponsel dan melebarkan halaman selama pemindaian.
    // Keenam titik pemain terletak di dalam lingkaran, jadi tak ada yang terpotong.
    <div aria-hidden className={cn('relative isolate aspect-square w-full max-w-[340px] overflow-hidden rounded-full text-ink', className)}>
      <div className="dot-grid absolute inset-0 rounded-full border border-line bg-panel" />
      {[34, 67, 100].map((size) => (
        <span
          key={size}
          className="absolute left-1/2 top-1/2 rounded-full border border-line-strong/50"
          style={{ width: `${size}%`, height: `${size}%`, transform: 'translate(-50%, -50%)' }}
        />
      ))}
      <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong/40" />
      <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong/40" />

      <span
        className="radar-sweep absolute inset-0 rounded-full"
        style={{ background: 'conic-gradient(from 0deg, transparent 0deg 292deg, color-mix(in oklab, var(--color-highlight) 80%, transparent) 360deg)' }}
      />
      {[0, 800, 1600].map((delay) => (
        <span
          key={delay}
          className="radar-ping absolute inset-[6%] rounded-full border-2 border-brand"
          style={{ '--d': `${delay}ms` } as CSSProperties}
        />
      ))}

      {blips.slice(0, BLIP_SPOTS.length).map((blip, index) => {
        const spot = BLIP_SPOTS[index]!;
        return (
          <span
            key={blip.seed}
            className="absolute"
            style={{ left: `${spot.x}%`, top: `${spot.y}%`, marginLeft: -BLIP_HALF, marginTop: -BLIP_HALF }}
          >
            <span className="blip block" style={{ '--i': index } as CSSProperties}>
              <Avatar name={blip.name} seed={blip.seed} size="md" ring />
            </span>
          </span>
        );
      })}

      <span className="absolute left-1/2 top-1/2" style={{ marginLeft: -BLIP_HALF, marginTop: -BLIP_HALF }}>
        <Avatar name={you.name} seed={you.seed} size="md" ring className="shadow-raised" />
      </span>
    </div>
  );
}
