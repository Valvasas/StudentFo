import Link from 'next/link';
import { ExternalLink, Trash2 } from 'lucide-react';
import { removeTrackerAction, updateTrackerStatusAction } from '@/app/tracker/actions';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { Badge } from '@/components/ui/badge';
import {
  EVENT_TYPE_LABEL,
  TRACKER_STATUS_LABEL,
  TRACKER_STATUSES,
  type TrackerItem,
} from '@/types/domain';

export function TrackerCard({ item }: { item: TrackerItem }) {
  const { event } = item;

  return (
    <article className="flex flex-col gap-2.5 rounded-card border border-line bg-panel p-4 shadow-sm transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <Badge variant="brand">{EVENT_TYPE_LABEL[event.eventType]}</Badge>
        <DeadlineTag deadlineAt={event.primaryDeadlineAt} />
      </div>

      <div>
        <h3 className="text-sm font-semibold leading-snug">
          <Link href={`/events/${event.slug}`} className="-my-1 flex min-h-11 items-center gap-1 hover:text-brand-text">
            <span>{event.title}</span>
            <ExternalLink aria-hidden className="size-3 shrink-0 text-ink-muted" />
          </Link>
        </h3>
        <p className="mt-1 text-xs text-ink-muted">{event.organizer}</p>
      </div>

      {item.notes && (
        <p className="rounded-sm bg-panel-nested p-2 text-xs italic text-ink-soft">&ldquo;{item.notes}&rdquo;</p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-xs">
        <form action={updateTrackerStatusAction} className="flex min-w-0 items-center gap-1.5">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="returnTo" value="/tracker" />
          {/* Nama unik per kartu: tanpa judul, pembaca layar mendengar deretan
              "Ubah status" yang identik di seluruh papan. */}
          <label htmlFor={`status-${item.id}`} className="sr-only">
            Tahap lamaran untuk {event.title}
          </label>
          <select
            id={`status-${item.id}`}
            name="status"
            defaultValue={item.status}
            className="h-11 rounded-sm border border-line bg-panel px-2 text-sm text-ink-soft hover:border-line-strong focus:border-brand focus:outline-none"
          >
            {TRACKER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TRACKER_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-11 rounded-sm border border-line bg-panel-nested px-3 text-sm font-medium text-ink hover:bg-panel-nested/80"
          >
            Ubah
          </button>
        </form>

        <form action={removeTrackerAction}>
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="returnTo" value="/tracker" />
          <button
            type="submit"
            title="Hapus dari tracker"
            aria-label={`Hapus ${event.title} dari tracker`}
            className="flex size-11 items-center justify-center rounded-sm text-ink-muted hover:bg-panel-nested hover:text-ink"
          >
            <Trash2 aria-hidden className="size-3.5" />
          </button>
        </form>
      </div>
    </article>
  );
}
