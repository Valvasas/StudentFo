import { Pause, Play } from 'lucide-react';
import { getDeadlineState } from '@/lib/deadline';
import { EVENT_TYPE_LABEL, type EventSummary } from '@/types/domain';

/**
 * Pita tenggat terdekat yang berjalan horizontal.
 *
 * Dua hal yang menentukan komponen ini benar atau tidak:
 *
 * 1. DAFTARNYA DIRENDER DUA KALI. Animasinya menggeser track sejauh -50%,
 *    jadi separuh kedua harus identik dengan separuh pertama supaya titik
 *    sambungnya tidak terlihat. Salinan kedua `aria-hidden` — pembaca layar
 *    harus mendengar daftarnya sekali saja, bukan dobel.
 *
 * 2. TIDAK ADA ELEMEN INTERAKTIF DI DALAMNYA. Target yang bergerak mustahil
 *    diklik dengan andal, dan tidak bisa dijangkau keyboard dalam urutan
 *    yang masuk akal. Ini murni penanda "ada yang segera tutup" — jalur
 *    aslinya tetap lewat daftar di bawahnya.
 */
export interface DeadlineTickerProps {
  events: readonly EventSummary[];
}

export function DeadlineTicker({ events }: DeadlineTickerProps) {
  if (events.length === 0) return null;

  const items = events.map((event) => {
    const state = getDeadlineState(event.primaryDeadlineAt);
    return {
      id: event.id,
      type: EVENT_TYPE_LABEL[event.eventType],
      title: event.title,
      organizer: event.organizer,
      note: state.longLabel,
      isUrgent: state.urgency === 'urgent' || state.urgency === 'warning',
    };
  });

  const row = (keyPrefix: string, hidden: boolean) => (
    <ul className="flex" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li
          key={`${keyPrefix}-${item.id}`}
          className="flex items-center gap-2.5 whitespace-nowrap px-5 text-sm"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-text">
            {item.type}
          </span>
          <span className="font-medium">{item.title}</span>
          <span className="text-ink-muted">{item.organizer}</span>
          <span className={item.isUrgent ? 'font-medium text-due-warning' : 'text-ink-muted'}>
            {item.note}
          </span>
          <span aria-hidden className="text-line-strong">
            |
          </span>
        </li>
      ))}
    </ul>
  );

  // Sakelar jeda tanpa JavaScript: kotak centang + `:has(:checked)` (WCAG 2.2.2).
  return (
    <section aria-label="Tenggat terdekat" className="group/ticker border-y border-line bg-panel">
      <div className="flex h-12 items-center">
        <span className="flex h-12 shrink-0 items-center gap-2 border-r border-line pl-4 pr-4 text-[12.5px] font-semibold sm:pl-6">
          <span aria-hidden className="urgency-dot size-2 rounded-pill bg-due-warning" />
          <span className="hidden sm:inline">Segera tutup</span>
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="ticker-track group-hover/ticker:[animation-play-state:paused] group-has-[:checked]/ticker:[animation-play-state:paused]">
            {row('a', false)}
            {row('b', true)}
          </div>
        </div>
        <label className="flex h-12 min-w-11 shrink-0 cursor-pointer items-center justify-center border-l border-line px-3 text-ink-muted transition-colors duration-150 ease-snap hover:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus">
          <input type="checkbox" className="peer sr-only" aria-label="Jeda pita tenggat" />
          <Pause aria-hidden className="size-4 peer-checked:hidden" />
          <Play aria-hidden className="hidden size-4 fill-current peer-checked:block" />
        </label>
      </div>
    </section>
  );
}
