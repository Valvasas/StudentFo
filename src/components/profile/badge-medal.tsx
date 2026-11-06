import type { CSSProperties, ReactNode } from 'react';
import { HIGHLIGHT, PAPER, PAPER_SHADE, PENCIL, Svg } from '@/components/ui/illustrations';
import type { BadgeKey, BadgeTier } from '@/lib/achievements';
import type { Tint } from '@/lib/tint';
import { cn } from '@/lib/utils';

/**
 * Medali lencana (ADR-068) — aturan ilustrasi ADR-053 tetap: tinta
 * `currentColor`, isian token (ikut tema gelap), tanpa teks, `aria-hidden`
 * (nama & tingkatnya selalu tertulis di sebelahnya).
 *
 * Tingkat dibawa BENTUK, bukan warna saja: 1 = lingkaran polos, 2 = roset
 * bergerigi + pita, 3 = roset emas (sorot) + pita + kilau, ditambah 1–3
 * titik di tepi bawah. Tint = identitas jenis lencana (seperti tint tim),
 * bukan makna; satu tint dipakai dua lencana yang tidak pernah tampil
 * bersama di akun peserta.
 */

const C = { x: 60, y: 58 };

const BADGE_TINT: Record<BadgeKey, Tint> = {
  kompetitor: 'sun',
  pembelajar: 'sky',
  penjelajah: 'mint',
  kontributor: 'peach',
  terverifikasi: 'lilac',
  'tuan-rumah': 'sky',
};

const tint = (name: Tint) => `var(--color-tint-${name})`;

/** Tepi roset: `bumps` tonjolan setengah lingkaran di sekeliling radius `r`. */
function rosettePath(r: number, bumps: number, depth: number): string {
  const point = (angle: number, radius: number) => `${(C.x + Math.cos(angle) * radius).toFixed(2)} ${(C.y + Math.sin(angle) * radius).toFixed(2)}`;
  const step = (Math.PI * 2) / bumps;
  let d = `M${point(-Math.PI / 2, r)}`;
  for (let index = 0; index < bumps; index += 1) {
    const start = -Math.PI / 2 + index * step;
    d += ` Q${point(start + step / 2, r + depth * 2)} ${point(start + step, r)}`;
  }
  return `${d} Z`;
}

function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? outer : inner;
    points.push(`${(cx + Math.cos(angle) * radius).toFixed(2)} ${(cy + Math.sin(angle) * radius).toFixed(2)}`);
  }
  return `M${points.join(' L')} Z`;
}

const ROSETTE = rosettePath(40, 18, 2.6);

/** Gambar di tengah medali, dirancang di sekitar (60, 54) lalu digeser ke pusat. */
function Glyph({ badge }: { badge: BadgeKey }) {
  switch (badge) {
    case 'kompetitor':
      return (
        <>
          <path d="M50 41h20v8c0 6.6-4.5 11-10 11s-10-4.4-10-11z" fill={PAPER} />
          <path d="M50 44.5h-4.5c0 5.6 2.6 8.6 6.4 9M70 44.5h4.5c0 5.6-2.6 8.6-6.4 9" />
          <path d="M60 60v5" />
          <path d="M54 65.2h12v3.6H54z" fill="currentColor" />
          <path d="M57.2 47.5l1.8-2.4" strokeWidth={1.6} />
        </>
      );
    case 'pembelajar':
      return (
        <>
          <path d="M60 45.5c-4-3-9.5-4-15-3v21c5.5-1 11 0 15 3z" fill={PAPER} />
          <path d="M60 45.5c4-3 9.5-4 15-3v21c-5.5-1-11 0-15 3z" fill={PAPER} />
          <path d="M60 45.5v21" />
          <path d="M49 49c2.6-.3 5 .1 7 1M49 53.5c2.6-.3 5 .1 7 1M64 50c2-.9 4.4-1.3 7-1M64 54.5c2-.9 4.4-1.3 7-1" strokeWidth={1.6} />
        </>
      );
    case 'penjelajah':
      return (
        <>
          <circle cx="60" cy="54" r="14" fill={PAPER} />
          <path d="M60 43l4.5 11-4.5 11-4.5-11z" />
          <path d="M60 43l4.5 11h-9z" fill="currentColor" />
          <path d="M60 37.5v2.5M60 68v2.5M43.5 54H46M74 54h2.5" strokeWidth={1.8} />
        </>
      );
    case 'kontributor':
      return (
        <>
          <path d="M46 50.5v7l6 .5 13 7V43l-13 7z" fill={PAPER} />
          <path d="M52 58l2.2 7.5h4.3L57 58.6" />
          <path d="M69.5 48.5c2.2 3.3 2.2 7.7 0 11M73.5 45.5c3.6 5 3.6 12 0 17" strokeWidth={1.8} />
        </>
      );
    case 'terverifikasi':
      return (
        <>
          <path d="M60 40l13 4.8v9c0 8-5.6 13.2-13 15.5-7.4-2.3-13-7.5-13-15.5v-9z" fill={PAPER} />
          <path d="M54.2 54.6l4.2 4.2 7.6-8.4" strokeWidth={2.6} />
        </>
      );
    case 'tuan-rumah':
      return (
        <>
          <path d="M45 46h30v5a3.5 3.5 0 0 0 0 7v5H45v-5a3.5 3.5 0 0 0 0-7z" fill={PAPER} />
          <path d="M66 47v15" strokeDasharray="2 3" strokeWidth={1.6} />
          <path d={starPath(55.5, 54.5, 5, 2.2)} fill="currentColor" strokeWidth={1.2} />
        </>
      );
  }
}

function Ribbons({ fill }: { fill: string }) {
  return (
    <>
      <path d="M44 86l-10 40 10-6 7 9 8-37z" fill={fill} />
      <path d="M76 86l10 40-10-6-7 9-8-37z" fill={fill} />
    </>
  );
}

function Pips({ tier }: { tier: BadgeTier }) {
  if (tier === 0) return null;
  const xs = tier === 1 ? [60] : tier === 2 ? [56, 64] : [52, 60, 68];
  return (
    <>
      {xs.map((x) => (
        <circle key={x} cx={x} cy={C.y + 33} r={2.2} fill="currentColor" stroke="none" />
      ))}
    </>
  );
}

function Sparkle({ x, y, scale, wait }: { x: number; y: number; scale: number; wait: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M0 -10 Q1.4 -1.4 10 0 Q1.4 1.4 0 10 Q-1.4 1.4 -10 0 Q-1.4 -1.4 0 -10 Z"
        fill={HIGHLIGHT}
        strokeWidth={1.8}
        className="twinkle"
        style={{ '--d': `${wait}ms` } as CSSProperties}
      />
    </g>
  );
}

export function BadgeMedal({ badge, tier, className }: { badge: BadgeKey; tier: BadgeTier; className?: string }) {
  const center = tint(BADGE_TINT[badge]);
  let body: ReactNode;

  if (tier === 0) {
    body = (
      <g stroke={PENCIL}>
        <circle cx={C.x} cy={C.y} r={40} fill={PAPER_SHADE} strokeDasharray="4 6" />
        <circle cx={C.x} cy={C.y} r={28} fill={PAPER} />
        <g transform="translate(0 4)" strokeWidth={2}>
          <Glyph badge={badge} />
        </g>
      </g>
    );
  } else {
    const gold = tier === 3;
    body = (
      <>
        {tier >= 2 && <Ribbons fill={gold ? HIGHLIGHT : center} />}
        {tier === 1 ? <circle cx={C.x} cy={C.y} r={40} fill={PAPER} /> : <path d={ROSETTE} fill={gold ? HIGHLIGHT : PAPER} />}
        <circle cx={C.x} cy={C.y} r={tier === 1 ? 35 : 37} fill="none" strokeDasharray="1.5 4" strokeWidth={1.6} />
        <circle cx={C.x} cy={C.y} r={28} fill={center} />
        {/* Kilap enamel di kiri atas cakram. Token teks-inverse: terang di KEDUA tema
            (PAPER menjadi goresan gelap di tema gelap). */}
        <path d="M39.6 47.5a23 23 0 0 1 11-12.4" stroke="var(--color-inverse-text)" strokeWidth={3} opacity={0.75} />
        <g transform="translate(0 4)">
          <Glyph badge={badge} />
        </g>
        <Pips tier={tier} />
        {gold && (
          <>
            <Sparkle x={16} y={20} scale={0.75} wait={0} />
            <Sparkle x={104} y={30} scale={0.55} wait={900} />
          </>
        )}
      </>
    );
  }

  return (
    <Svg viewBox="0 0 120 132" className={cn('h-auto', className)}>
      {body}
    </Svg>
  );
}
