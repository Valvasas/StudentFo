import { CalendarClock, CalendarOff } from 'lucide-react';
import { getDeadlineState, type DeadlineUrgency } from '@/lib/deadline';
import { cn } from '@/lib/utils';

/**
 * <DeadlineTag /> — Blueprint §5.1.
 *
 * Catatan soal "dihitung ulang di client tiap render": komponen ini adalah
 * Server Component dan nilainya dihitung ULANG SETIAP REQUEST (halaman yang
 * memakainya dirender dinamis, bukan di-cache statis). Maksud aturan itu
 * adalah melarang H-n yang membeku di build output atau di database — itu
 * terpenuhi, tanpa mengirim JavaScript apa pun ke browser dan tanpa risiko
 * ketidakcocokan hidrasi antara jam server dan jam perangkat user.
 *
 * Warna TIDAK PERNAH jadi satu-satunya pembawa makna: setiap tag punya
 * ikon + teks. Sekitar 1 dari 12 laki-laki mengalami defisiensi penglihatan
 * warna; "yang merah itu mendesak" bukan informasi yang sampai ke mereka.
 */
const URGENCY_CLASS: Record<DeadlineUrgency, string> = {
  safe: 'bg-due-safe-soft text-due-safe',
  warning: 'bg-due-warning-soft text-due-warning',
  urgent: 'bg-due-urgent-soft text-due-urgent',
  closed: 'bg-panel-nested text-ink-muted line-through decoration-1',
  unknown: 'bg-panel-nested text-ink-muted',
};

export interface DeadlineTagProps {
  deadlineAt: string | null;
  className?: string;
}

export function DeadlineTag({ deadlineAt, className }: DeadlineTagProps) {
  const state = getDeadlineState(deadlineAt);
  const Icon = state.urgency === 'closed' ? CalendarOff : CalendarClock;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-sm font-medium',
        URGENCY_CLASS[state.urgency],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {state.shortLabel}
      {/* Teks lengkap untuk pembaca layar; badge visual terlalu ringkas. */}
      <span className="sr-only">— {state.longLabel}</span>
    </span>
  );
}
