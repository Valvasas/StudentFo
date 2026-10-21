/**
 * Matematika gestur tumpukan kartu (ADR-058), tanpa DOM supaya bisa diuji.
 * Semua jarak dalam piksel, kecepatan dalam piksel/milidetik.
 */

/** Gerak horizontal minimum sebelum gestur dianggap seretan. */
export const DRAG_START_PX = 10;
/** Sentuhan sedekat ini ke tepi layar diserahkan ke gestur "kembali" peramban (iOS). */
export const EDGE_DEAD_ZONE_PX = 16;
export const TAP_MAX_DISTANCE_PX = 6;
export const TAP_MAX_MS = 300;
export const FLICK_VELOCITY = 0.5;
export const FLICK_MIN_DISTANCE_PX = 32;
/** Seret kanan pada kartu yang tak bisa diajak tidak pernah melewati batas ini. */
export const BLOCKED_DRAG_CAP_PX = 24;

const RUBBER_START = 1.25;
const RUBBER_FACTOR = 0.35;
const TILT_MAX_DEG = 14;
const PROGRESS_LIMIT = 1.2;
const STAMP_DEAD_ZONE = 0.15;
const STAMP_RAMP = 0.6;
const VELOCITY_WINDOW_MS = 100;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function thresholdFor(width: number): number {
  return Math.max(88, Math.round(0.26 * width));
}

/** -1.2..1.2: |1| = tepat di ambang. */
export function dragProgress(dx: number, threshold: number): number {
  return clamp(dx / threshold, -PROGRESS_LIMIT, PROGRESS_LIMIT);
}

/** Melewati 1,25x ambang, sisa gerak hanya diteruskan 35% — kartu terasa tertahan karet. */
export function rubberBand(dx: number, threshold: number): number {
  const limit = RUBBER_START * threshold;
  const distance = Math.abs(dx);
  if (distance <= limit) return dx;
  return Math.sign(dx) * (limit + (distance - limit) * RUBBER_FACTOR);
}

/**
 * Posisi kartu untuk gerak jari `dx`. Kartu yang tak bisa diajak hanya ikut ke
 * kanan sampai `BLOCKED_DRAG_CAP_PX` (menyentak, bukan menolak diam-diam);
 * `reduced` mematikan karet tetapi tidak pernah melonggarkan batas itu.
 */
export function dragOffset(dx: number, options: { threshold: number; canInvite: boolean; reduced: boolean }): number {
  if (dx > 0 && !options.canInvite) {
    return options.reduced ? Math.min(dx, BLOCKED_DRAG_CAP_PX) : BLOCKED_DRAG_CAP_PX * (1 - Math.exp(-dx / 48));
  }
  return options.reduced ? dx : rubberBand(dx, options.threshold);
}

export function tiltFor(dx: number, width: number, reduced: boolean): number {
  if (reduced || width <= 0) return 0;
  return clamp((dx / width) * TILT_MAX_DEG, -TILT_MAX_DEG, TILT_MAX_DEG);
}

/** Keterlihatan stempel 0..1: 'left' = LEWATI (dx negatif), 'right' = AJAK? (dx positif). */
export function stampStrength(progress: number, side: 'left' | 'right'): number {
  const signed = side === 'left' ? -progress : progress;
  return clamp((signed - STAMP_DEAD_ZONE) / STAMP_RAMP, 0, 1);
}

export function isArmed(progress: number): boolean {
  return Math.abs(progress) >= 1;
}

export interface VelocitySample {
  readonly x: number;
  readonly t: number;
}

/** Kecepatan dari sampel terakhir dalam jendela 100 ms; 0 bila tak cukup data. */
export function estimateVelocity(samples: readonly VelocitySample[]): number {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS);
  if (!first || last.t <= first.t) return 0;
  return (last.x - first.x) / (last.t - first.t);
}

export type ReleaseDecision = 'skip' | 'invite' | 'blocked' | 'cancel';

/**
 * Keputusan saat jari dilepas. Melewati ambang ATAU lemparan cepat searah
 * gerak. Ke kanan hanya membuka tinjauan ajakan (tidak pernah mengirim);
 * kartu yang tak bisa diajak menghasilkan 'blocked' supaya pengguna diberi tahu.
 */
export function decideRelease(input: { dx: number; vx: number; width: number; canInvite: boolean }): ReleaseDecision {
  const { dx, vx, width, canInvite } = input;
  const flick = Math.abs(vx) > FLICK_VELOCITY && Math.abs(dx) > FLICK_MIN_DISTANCE_PX && Math.sign(vx) === Math.sign(dx);
  if (!(Math.abs(dx) > thresholdFor(width) || flick)) return 'cancel';
  if (dx < 0) return 'skip';
  return canInvite ? 'invite' : 'blocked';
}

export function isTap(input: { dist: number; ms: number }): boolean {
  return input.dist < TAP_MAX_DISTANCE_PX && input.ms < TAP_MAX_MS;
}

export type MoveIntent = 'pending' | 'horizontal' | 'vertical';

/** Horizontal harus jelas dominan (1,5x); selain itu gulir halaman dibiarkan menang. */
export function classifyMove(dx: number, dy: number): MoveIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > DRAG_START_PX && ax > 1.5 * ay) return 'horizontal';
  if (ay > DRAG_START_PX) return 'vertical';
  return 'pending';
}

export function isInEdgeDeadZone(clientX: number, viewportWidth: number): boolean {
  return clientX < EDGE_DEAD_ZONE_PX || clientX > viewportWidth - EDGE_DEAD_ZONE_PX;
}
