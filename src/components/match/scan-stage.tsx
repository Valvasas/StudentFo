import type { CSSProperties } from 'react';
import { MatchRadar, type RadarBlip } from '@/components/match/match-radar';

const SCAN_LINES = [
  'Memindai pemain yang kartunya terbuka…',
  'Menimbang keahlian, jarak, dan portofolio…',
  'Mengocok tumpukan kartumu…',
] as const;

/**
 * Lapisan radar yang menutup panggung tumpukan selama ±2,9 detik. Murni
 * hiasan (`aria-hidden`); bawaannya tersembunyi dan hanya animasi
 * `scan-overlay` yang memunculkannya (gagal-aman, §10 globals.css).
 *
 * Padding atas membuat radar jatuh di bawah kartu perayaan yang `fixed`
 * (CelebrationBurst, ±176px dari atas) alih-alih tertimpa olehnya.
 */
export function ScanStage({ you, blips }: { you: RadarBlip; blips: readonly RadarBlip[] }) {
  return (
    <div aria-hidden className="scan-overlay absolute inset-0 z-10 overflow-x-clip rounded-[28px] border border-line bg-panel">
      <div className="flex flex-col items-center gap-6 px-4 pb-8 pt-[clamp(96px,22vh,160px)]">
        <MatchRadar you={you} blips={blips} />
        <div className="relative h-6 w-full max-w-md text-center text-[15px] font-medium text-ink-soft">
          {SCAN_LINES.map((line, index) => (
            <p key={line} className="scan-line absolute inset-x-0" style={{ '--i': index } as CSSProperties}>
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
