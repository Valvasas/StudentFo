import { HIGHLIGHT, PENCIL, Svg } from '@/components/ui/illustrations';
import { cn } from '@/lib/utils';
import { MATCH_COMPONENTS, type Match } from '@/lib/matchmaking';

const CENTER = 70;
const AXIS_RADIUS = 66;
const RINGS = [22, 44, 66] as const;
const MIN_RADIUS = 14;
const SPAN = 52;

const n = (value: number) => value.toFixed(2);

const SIN60 = 0.8660254;
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, -1],
  [SIN60, -0.5],
  [SIN60, 0.5],
  [0, 1],
  [-SIN60, 0.5],
  [-SIN60, -0.5],
];

/** Tabel arah tetap, bukan Math.cos/sin: engine server & klien boleh beda di digit terakhir, dan itu cukup untuk galat hidrasi. */
function vertex(index: number, radius: number): [number, number] {
  const [dx, dy] = DIRECTIONS[index] ?? [0, 0];
  return [CENTER + radius * dx, CENTER + radius * dy];
}

function outline(points: readonly (readonly [number, number])[]) {
  return `${points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`).join(' ')} Z`;
}

function clamp01(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * "Sidik jari" kecocokan: segi enam enam sumbu (urutan `MATCH_COMPONENTS`,
 * sumbu pertama ke atas lalu searah jarum jam). Hiasan `aria-hidden`;
 * maknanya tetap ada di ScoreBars (daftar angka).
 *
 * Bawaannya tergambar penuh. `hex-poly` ber-`pathLength=1` supaya CSS
 * kartu bisa menggambarnya ulang saat muka belakang terbuka — tanpa itu pun
 * gambarnya tidak pernah tersembunyi.
 */
export function ScoreHex({ components, className }: { components: Match['components']; className?: string }) {
  const scores = MATCH_COMPONENTS.map((key) => clamp01(components.find((component) => component.key === key)?.score));
  const points = scores.map((score, index) => vertex(index, MIN_RADIUS + score * SPAN));
  const axes = MATCH_COMPONENTS.map((_, index) => vertex(index, AXIS_RADIUS));
  return (
    <Svg viewBox="0 0 140 140" className={cn('size-[132px]', className)}>
      {RINGS.map((radius, ring) => (
        <path
          key={radius}
          d={outline(MATCH_COMPONENTS.map((_, index) => vertex(index, radius)))}
          stroke={PENCIL}
          strokeWidth={1.6}
          strokeDasharray={ring === 1 ? '2 5' : undefined}
        />
      ))}
      <path d={axes.map(([x, y]) => `M${CENTER} ${CENTER} L${n(x)} ${n(y)}`).join(' ')} stroke={PENCIL} strokeWidth={1.4} />
      <path d={outline(points)} pathLength={1} fill={HIGHLIGHT} fillOpacity={0.55} className="hex-poly" />
      {points.map(([x, y]) => (
        <circle key={`${n(x)}-${n(y)}`} cx={n(x)} cy={n(y)} r="2.6" fill="currentColor" stroke="none" />
      ))}
    </Svg>
  );
}
