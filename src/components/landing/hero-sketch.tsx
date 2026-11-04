import type { CSSProperties } from 'react';
import { HIGHLIGHT, PAPER, PAPER_SHADE, PENCIL } from '@/components/ui/illustrations';
import { cn } from '@/lib/utils';

const at = (ms: number, from = 0, to = 0) => ({ '--d': `${ms}ms`, '--r0': `${from}deg`, '--r1': `${to}deg` }) as CSSProperties;

/**
 * Kolase hero beranda (ADR-062): tumpukan kartu kegiatan yang "digambar"
 * pulpen, kaca pembesar di atasnya (= cari), label tenggat di kartu depan
 * (= sisa waktu, sama dengan DeadlineTag), penanda buku (= simpan), pesawat kertas
 * yang terbang ke tumpukan (= kiriman masuk katalog). Setiap benda adalah
 * fitur yang benar-benar ada — bukan dekorasi generik.
 *
 * Garis tergambar sekali (`ink-draw`, path ber-`pathLength="1"`), lalu
 * bagian-bagian kecil melayang (`drift`, `twinkle`, `dash-flow`). Semuanya
 * `aria-hidden`, tanpa teks di SVG, warna dari token; reduced-motion =
 * langsung keadaan akhir.
 */
export function HeroSketch({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 440 380"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-auto w-full text-ink', className)}
    >
      <ellipse cx="226" cy="352" rx="168" ry="12" fill={PAPER_SHADE} stroke="none" />

      <g className="drift" style={at(400, -7, -5)}>
        <path pathLength={1} className="ink-draw" style={at(0)} d="M96 92 Q190 80 282 88 L286 300 Q190 308 100 302 Z" fill={PAPER_SHADE} />
      </g>

      <g className="drift" style={at(900, 4, 6)}>
        <path pathLength={1} className="ink-draw" style={at(150)} d="M150 70 Q246 62 336 72 L338 290 Q244 298 152 292 Z" fill={PAPER} />
        <path pathLength={1} className="ink-draw" style={at(450)} d="M174 104 Q240 98 306 102" />
        <path pathLength={1} className="ink-draw" style={at(550)} d="M174 128 Q230 124 282 126" stroke={PENCIL} />
        <path pathLength={1} className="ink-draw" style={at(650)} d="M174 148 Q224 145 262 147" stroke={PENCIL} />
      </g>

      <g className="drift" style={at(0, -2, 0)}>
        <path pathLength={1} className="ink-draw" style={at(250)} d="M118 150 Q222 140 322 148 L326 336 Q222 344 122 338 Z" fill={PAPER} />
        <path pathLength={1} className="ink-draw" style={at(700)} d="M144 184 Q228 176 300 180" strokeWidth="3" />
        <path pathLength={1} className="ink-draw" style={at(800)} d="M144 208 Q210 203 268 205" stroke={PENCIL} />
        <path pathLength={1} className="ink-draw" style={at(880)} d="M144 228 Q200 224 246 226" stroke={PENCIL} />
        <rect x="144" y="282" width="92" height="28" rx="7" stroke="none" style={{ fill: 'color-mix(in oklab, currentColor 14%, transparent)' }} />
        <path pathLength={1} className="ink-draw" style={at(1000)} d="M144 289 Q144 282 151 282 L229 282 Q236 282 236 289 L236 303 Q236 310 229 310 L151 310 Q144 310 144 303 Z" />
        <circle cx="160" cy="296" r="6.5" />
        <path d="M160 292.5 V296 L162.5 297.5" strokeWidth="1.8" />
        <path d="M174 296 h46" strokeWidth="3" />
        <path pathLength={1} className="ink-draw" style={at(1100)} d="M286 150 L306 150 L306 186 L296 178 L286 186 Z" fill={HIGHLIGHT} />
      </g>

      <g className="drift" style={at(1500, 8, 2)}>
        <circle pathLength={1} className="ink-draw" style={at(1150)} cx="320" cy="214" r="40" fill={HIGHLIGHT} fillOpacity="0.42" />
        <path d="M296 196 Q306 184 322 186" />
        <path pathLength={1} className="ink-draw" style={at(1300)} d="M348 244 L384 282" strokeWidth="9" />
      </g>

      <g className="drift" style={at(600, -6, 4)}>
        <path className="dash-flow" d="M18 128 Q52 92 92 112 Q118 126 132 104" strokeDasharray="2 8" stroke={PENCIL} />
        <path pathLength={1} className="ink-draw" style={at(1400)} d="M118 74 L184 46 L164 108 L150 88 Z" fill={PAPER} />
        <path pathLength={1} className="ink-draw" style={at(1500)} d="M150 88 L184 46" />
      </g>

      <path className="twinkle" style={at(0)} d="M382 64 Q384 80 400 82 Q384 84 382 100 Q380 84 364 82 Q380 80 382 64 Z" fill={HIGHLIGHT} strokeWidth="1.8" />
      <path className="twinkle" style={at(1200)} d="M60 236 Q61 246 71 247 Q61 248 60 258 Q59 248 49 247 Q59 246 60 236 Z" fill={PAPER} strokeWidth="1.6" />
      <circle className="twinkle" style={at(2000)} cx="398" cy="170" r="4" strokeWidth="1.8" />
      <path d="M40 40 l0 10 M35 45 l10 0" stroke={PENCIL} />
    </svg>
  );
}
