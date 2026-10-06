import type { CSSProperties } from 'react';
import { HIGHLIGHT, PAPER, PAPER_SHADE, PENCIL, Svg } from '@/components/ui/illustrations';
import type { RouteSceneKey } from '@/lib/route-scene';

/**
 * Sketsa mini untuk kartu pemuat navigasi (ADR-055) — satu per tujuan.
 * Aturan ilustrasi ADR-053 berlaku: tinta `currentColor`, isian token, satu
 * aksen stabilo, tanpa teks. Yang bergerak hanya bagian kecil di dalamnya
 * (`bob`, `fly`, `sweep`, `turn`, `dash-flow`, `typing-dot`); di
 * reduced-motion semuanya diam di keadaan awal dan tetap terbaca.
 *
 * Ukurannya kecil (64×48) dan dikirim di bundel klien setiap halaman, jadi
 * bentuknya sengaja sederhana: tiga sampai enam garis per adegan.
 */

const STUDIO_BARS = [
  { x: 12, top: 26 },
  { x: 24, top: 16 },
  { x: 36, top: 22 },
  { x: 48, top: 10 },
] as const;

const wait = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

function Scene({ scene }: { scene: RouteSceneKey }) {
  switch (scene) {
    case 'home':
      return (
        <>
          <path d="M14 22 L32 9 L50 22 V40 H14 Z" fill={PAPER} />
          <rect x="27" y="28" width="10" height="12" rx="2" fill={HIGHLIGHT} />
          <path d="M44 6 Q47 9 44 12 Q41 9 44 6 Z" fill={HIGHLIGHT} strokeWidth="1.4" className="twinkle" />
        </>
      );
    case 'catalog':
      return (
        <>
          <rect x="8" y="8" width="22" height="15" rx="3" fill={PAPER} />
          <rect x="34" y="8" width="22" height="15" rx="3" fill={PAPER_SHADE} />
          <rect x="8" y="27" width="22" height="15" rx="3" fill={PAPER_SHADE} />
          <rect x="34" y="27" width="22" height="15" rx="3" fill={PAPER} />
          <g className="sweep">
            <circle cx="32" cy="24" r="8" fill={HIGHLIGHT} fillOpacity="0.55" />
            <path d="M38 30 L45 37" strokeWidth="3" />
          </g>
        </>
      );
    case 'event':
      return (
        <>
          <path d="M16 6 H40 L48 14 V42 H16 Z" fill={PAPER} />
          <path d="M40 6 V14 H48" />
          <path d="M22 22 H40 M22 29 H36 M22 36 H31" stroke={PENCIL} />
          <path d="M42 26 V40 L46 37 L50 40 V26 Z" fill={HIGHLIGHT} strokeWidth="1.6" className="bob" />
        </>
      );
    case 'register':
      return (
        <>
          <path d="M4 40 Q16 44 26 36" strokeDasharray="2 5" className="dash-flow" />
          <g className="fly">
            <path d="M22 26 L58 10 L46 40 L38 30 Z" fill={PAPER} />
            <path d="M38 30 L58 10" />
          </g>
        </>
      );
    case 'tracker':
      return (
        <>
          <path d="M6 8 H58 V42 H6 Z" fill={PAPER_SHADE} stroke="none" />
          <path d="M23 10 V40 M41 10 V40" stroke={PENCIL} />
          <rect x="9" y="12" width="11" height="8" rx="2" fill={PAPER} />
          <rect x="9" y="23" width="11" height="8" rx="2" fill={PAPER} />
          <rect x="27" y="12" width="11" height="8" rx="2" fill={HIGHLIGHT} className="bob" />
          <rect x="45" y="12" width="11" height="8" rx="2" fill={PAPER} className="bob" style={wait(500)} />
        </>
      );
    case 'teams':
      return (
        <>
          {[14, 32, 50].map((cx, index) => (
            <g key={cx} className="bob" style={wait(index * 180)}>
              <circle cx={cx} cy="20" r="6.5" fill={index === 1 ? HIGHLIGHT : PAPER} />
              <path d={`M${cx - 9} 40 Q${cx - 9} 29 ${cx} 29 Q${cx + 9} 29 ${cx + 9} 40`} fill={PAPER_SHADE} />
            </g>
          ))}
        </>
      );
    case 'network':
      return (
        <>
          <path d="M14 34 L32 14 L50 32 M14 34 L50 32" strokeDasharray="3 5" className="dash-flow" stroke={PENCIL} />
          <circle cx="14" cy="34" r="6" fill={PAPER} />
          <circle cx="50" cy="32" r="6" fill={PAPER} />
          <circle cx="32" cy="14" r="7" fill={HIGHLIGHT} className="bob" />
        </>
      );
    case 'inbox':
      return (
        <>
          <path d="M10 10 H46 Q52 10 52 16 V28 Q52 34 46 34 H24 L14 42 L16 34 H10 Q4 34 4 28 V16 Q4 10 10 10 Z" fill={PAPER} />
          {[18, 28, 38].map((cx, index) => (
            <circle key={cx} cx={cx} cy="22" r="2.6" fill="currentColor" stroke="none" className="typing-dot" style={wait(index * 160)} />
          ))}
          <circle cx="54" cy="10" r="4" fill={HIGHLIGHT} strokeWidth="1.6" className="twinkle" />
        </>
      );
    case 'profile':
      return (
        <>
          <rect x="8" y="10" width="48" height="30" rx="5" fill={PAPER} />
          <circle cx="22" cy="23" r="6" fill={HIGHLIGHT} />
          <path d="M14 35 Q22 28 30 35" />
          <path d="M36 20 H50 M36 27 H46" stroke={PENCIL} />
          <path d="M52 4 Q53 8 57 9 Q53 10 52 14 Q51 10 47 9 Q51 8 52 4 Z" fill={HIGHLIGHT} strokeWidth="1.4" className="twinkle" />
        </>
      );
    case 'settings':
      return (
        <>
          <g className="turn">
            <path
              d="M32 10 L35 15 L41 13 L41 19 L47 21 L44 26 L47 31 L41 33 L41 39 L35 37 L32 42 L29 37 L23 39 L23 33 L17 31 L20 26 L17 21 L23 19 L23 13 L29 15 Z"
              fill={PAPER}
            />
            <circle cx="32" cy="26" r="5.5" fill={HIGHLIGHT} />
          </g>
        </>
      );
    case 'admin':
      return (
        <>
          <rect x="8" y="24" width="34" height="18" rx="3" fill={PAPER} />
          <path d="M14 31 H30 M14 36 H24" stroke={PENCIL} />
          <g className="bob">
            <path d="M40 6 H52 V14 H49 V20 H56 V26 H36 V20 H43 V14 H40 Z" fill={HIGHLIGHT} strokeWidth="1.8" />
          </g>
          <path d="M44 34 L48 38 L56 29" strokeWidth="2.6" />
        </>
      );
    case 'studio':
      return (
        <>
          <path d="M8 42 H56" />
          {STUDIO_BARS.map((bar, index) => (
            <rect key={bar.x} x={bar.x} y={bar.top} width="8" height={42 - bar.top} rx="2" fill={index === 3 ? HIGHLIGHT : PAPER} className="bob" style={wait(index * 140)} />
          ))}
        </>
      );
    case 'submit':
      return (
        <>
          <rect x="6" y="18" width="30" height="24" rx="3" fill={PAPER} />
          <path d="M6 20 L21 32 L36 20" />
          <g className="fly" style={wait(200)}>
            <path d="M30 16 L58 4 L49 28 L43 20 Z" fill={HIGHLIGHT} fillOpacity="0.7" />
            <path d="M43 20 L58 4" />
          </g>
        </>
      );
    case 'auth':
      return (
        <>
          <rect x="16" y="22" width="32" height="20" rx="4" fill={PAPER} />
          <path d="M22 22 V16 Q22 7 32 7 Q42 7 42 16 V22" className="bob" />
          <circle cx="32" cy="31" r="3" fill={HIGHLIGHT} />
          <path d="M32 34 V37" strokeWidth="2.6" />
        </>
      );
    case 'page':
      return (
        <>
          <rect x="12" y="6" width="34" height="36" rx="3" fill={PAPER} />
          <path d="M18 16 H38 M18 23 H36 M18 30 H30" stroke={PENCIL} />
          <g className="sweep">
            <path d="M42 22 L54 10 L58 14 L46 26 L40 28 Z" fill={HIGHLIGHT} strokeWidth="1.8" />
          </g>
        </>
      );
  }
}

export function RouteSceneArt({ scene, className }: { scene: RouteSceneKey; className?: string }) {
  return (
    <Svg viewBox="0 0 64 48" className={className}>
      <Scene scene={scene} />
    </Svg>
  );
}
