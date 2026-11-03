import type { CSSProperties } from 'react';
import { CalendarOff, Clock } from 'lucide-react';
import { daysLeftLabel, getDeadlineState, urgencyRamp, type DeadlineUrgency } from '@/lib/deadline';
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
 * Urgensi dibawa GRADIEN satu tinta, bukan warna baru (palet monokrom,
 * ADR-039; gradiennya ADR-061): aman = teks biasa; H-7..H-3 = pil bergaris
 * yang latar & garisnya makin pekat SETIAP hari (`due-ramp`, `urgencyRamp`);
 * H-2..hari ini = pil terisi penuh, dan di hari-H ditambah titik yang
 * berdenyut pelan. Dulu dua tingkat terakhir identik, sehingga baris
 * "Segera ditutup" berisi enam label hitam yang sama — kalau semuanya
 * mendesak, tidak ada yang terbaca mendesak. Teksnya selalu menyebut sisa
 * hari, jadi tidak ada informasi yang hanya ada di tampilan.
 */
const URGENCY_CLASS: Record<DeadlineUrgency, string> = {
  safe: 'px-0 text-due-safe',
  warning: 'due-ramp font-semibold',
  urgent: 'bg-brand font-semibold text-on-brand',
  closed: 'bg-panel-nested text-ink-muted line-through decoration-1',
  unknown: 'bg-panel-nested text-ink-muted',
};

export interface DeadlineTagProps {
  deadlineAt: string | null;
  now?: Date;
  className?: string;
}

export function DeadlineTag({ deadlineAt, now, className }: DeadlineTagProps) {
  const state = getDeadlineState(deadlineAt, now);
  const Icon = state.urgency === 'closed' ? CalendarOff : Clock;
  const showIcon = state.urgency !== 'safe';
  const ramp = urgencyRamp(state.daysLeft);

  return (
    <span
      style={state.urgency === 'warning' ? ({ '--ramp': ramp } as CSSProperties) : undefined}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 text-xs font-medium tabular-nums',
        URGENCY_CLASS[state.urgency],
        className,
      )}
    >
      {state.daysLeft === 0 ? (
        <span aria-hidden className="urgency-dot size-1.5 shrink-0 rounded-pill bg-on-brand" />
      ) : (
        showIcon && <Icon aria-hidden className="size-3" />
      )}
      {daysLeftLabel(state.daysLeft)}
      {/* Teks lengkap untuk pembaca layar; badge visual terlalu ringkas. */}
      <span className="sr-only">— {state.longLabel}</span>
    </span>
  );
}
