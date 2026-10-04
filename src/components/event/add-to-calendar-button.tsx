import { CalendarPlus, ChevronDown, Download, ExternalLink } from 'lucide-react';
import { generateGoogleCalendarUrl, upcomingDeadlines } from '@/lib/calendar';
import { formatShortDateId } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import { DEADLINE_LABEL_TEXT, type EventDetail } from '@/types/domain';

/**
 * "Tambah ke kalender" — dropdown <details>, tanpa JavaScript (pola yang
 * sama dengan FilterBar & OrganizerCallout). Panelnya mengalir di dalam
 * dokumen, bukan melayang (`absolute`): di panel samping yang `sticky` dan
 * di tab sempit, menu melayang terpotong tepi kontainer.
 *
 * Google: satu tautan per tenggat (format URL template-nya hanya satu acara).
 * .ics: satu berkas berisi semua tenggat + pengingat H-3/H-1, untuk Apple
 * Calendar & Outlook. <a> biasa, bukan <Link> — prefetch router tidak
 * boleh mengunduh berkas.
 */
export function AddToCalendarButton({
  event,
  now,
  className,
}: {
  event: EventDetail;
  now: Date;
  className?: string;
}) {
  const deadlines = upcomingDeadlines(event, now);
  if (deadlines.length === 0) return null;

  const linkClass =
    'flex min-h-11 items-center gap-2 rounded-[8px] px-3 text-sm transition-colors duration-150 ease-snap hover:bg-panel-nested';

  return (
    <details className={cn('group rounded-card border border-line', className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <CalendarPlus aria-hidden className="size-4" />
        Tambah ke kalender
        <ChevronDown aria-hidden className="size-4 transition-transform duration-150 ease-snap group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-1 border-t border-line p-2">
        <p className="px-3 pt-1 text-xs font-medium text-ink-muted">Google Calendar</p>
        <ul className="flex flex-col">
          {deadlines.map((deadline) => (
            <li key={deadline.id}>
              <a href={generateGoogleCalendarUrl(event, deadline)} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <span className="flex-1">
                  {DEADLINE_LABEL_TEXT[deadline.label]}
                  <span className="text-ink-muted"> · {formatShortDateId(deadline.deadlineAt)}</span>
                </span>
                <ExternalLink aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
                <span className="sr-only">(Google Calendar, tab baru)</span>
              </a>
            </li>
          ))}
        </ul>
        <a href={`/api/events/${encodeURIComponent(event.slug)}/calendar`} download className={cn(linkClass, 'border-t border-line')}>
          <Download aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">
            Unduh .ics
            <span className="block text-xs text-ink-muted">Apple Calendar, Outlook · semua tenggat + pengingat</span>
          </span>
        </a>
      </div>
    </details>
  );
}
