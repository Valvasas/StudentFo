import { getDeadlineState, type DeadlineUrgency } from '@/lib/deadline';
import { cn } from '@/lib/utils';

/**
 * <DeadlineRing /> — Blueprint §5.2.
 *
 * Cincin diisi berdasarkan waktu yang sudah berlalu dalam jendela H-30,
 * bukan durasi total kompetisi (data itu jarang tersedia dari sumber).
 * Memakai token warna yang SAMA dengan <DeadlineTag /> supaya "merah" di
 * kartu dan "merah" di badge berarti hal yang persis sama.
 *
 * Dipakai terbatas — hanya di "Sorotan Minggu Ini" dan kartu unggulan.
 * Kalau setiap item punya cincin, tidak ada lagi yang menonjol dan
 * komponennya berubah jadi dekorasi.
 */
const RING_STROKE: Record<DeadlineUrgency, string> = {
  safe: 'stroke-due-safe',
  warning: 'stroke-due-warning',
  urgent: 'stroke-due-urgent',
  closed: 'stroke-ink-faint',
  unknown: 'stroke-ink-faint',
};

const RING_TEXT: Record<DeadlineUrgency, string> = {
  safe: 'text-due-safe',
  warning: 'text-due-warning',
  urgent: 'text-due-urgent',
  closed: 'text-ink-muted',
  unknown: 'text-ink-muted',
};

export interface DeadlineRingProps {
  deadlineAt: string | null;
  size?: number;
  className?: string;
}

export function DeadlineRing({ deadlineAt, size = 52, className }: DeadlineRingProps) {
  const state = getDeadlineState(deadlineAt);
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * state.ringProgress;

  const display =
    state.daysLeft === null ? '–' : state.daysLeft < 0 ? '×' : String(state.daysLeft);

  return (
    <div
      role="img"
      aria-label={state.longLabel}
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-line-strong"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          // Mulai dari pukul 12 dan berjalan searah jarum jam — arah baca
          // yang sudah jadi konvensi untuk "waktu berjalan".
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={cn('transition-[stroke-dasharray] duration-200 ease-snap', RING_STROKE[state.urgency])}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-sm font-semibold leading-none tabular-nums', RING_TEXT[state.urgency])}>
          {display}
        </span>
        <span className="text-[10px] leading-none text-ink-faint">
          {state.daysLeft !== null && state.daysLeft >= 0 ? 'hari' : ''}
        </span>
      </div>
    </div>
  );
}
