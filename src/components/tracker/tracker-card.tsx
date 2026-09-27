import Link from 'next/link';
import { Check, ChevronRight, Trash2, X } from 'lucide-react';
import { removeTrackerAction, updateTrackerStatusAction } from '@/app/tracker/actions';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { initialsOf } from '@/lib/initials';
import { TRACKER_STEPS, TRACKER_STEP_LABEL, trackerProgress } from '@/lib/tracker-progress';
import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, TRACKER_STATUS_LABEL, TRACKER_STATUSES, type TrackerItem } from '@/types/domain';

/** Pemilih tahap + tombol simpan. Dipakai baris papan dan halaman status. */
export function TrackerStatusForm({ item, returnTo }: { item: TrackerItem; returnTo: string }) {
  return (
    <form action={updateTrackerStatusAction} className="flex min-w-0 items-center gap-1.5">
      <input type="hidden" name="eventId" value={item.event.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {/* Nama unik per baris: tanpa judul, pembaca layar mendengar deretan
          "Ubah status" yang identik di seluruh papan. */}
      <label htmlFor={`status-${item.id}`} className="sr-only">
        Tahap lamaran untuk {item.event.title}
      </label>
      <select
        id={`status-${item.id}`}
        name="status"
        defaultValue={item.status}
        className="h-11 min-w-0 rounded-sm border border-line-strong/70 bg-panel px-2.5 text-sm hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {TRACKER_STATUSES.map((status) => (
          <option key={status} value={status}>
            {TRACKER_STATUS_LABEL[status]}
          </option>
        ))}
      </select>
      <button type="submit" className="h-11 shrink-0 rounded-sm bg-brand px-3.5 text-sm font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover">
        Ubah
      </button>
    </form>
  );
}

export function TrackerRemoveForm({ item, returnTo, withLabel = false }: { item: TrackerItem; returnTo: string; withLabel?: boolean }) {
  return (
    <form action={removeTrackerAction}>
      <input type="hidden" name="eventId" value={item.event.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        title="Hapus dari tracker"
        aria-label={`Hapus ${item.event.title} dari tracker`}
        className={cn(
          'flex h-11 items-center justify-center gap-2 rounded-sm text-ink-muted transition-colors duration-150 hover:bg-panel-nested hover:text-ink',
          withLabel ? 'px-3 text-sm font-medium' : 'w-11',
        )}
      >
        <Trash2 aria-hidden className="size-4" />
        {withLabel && <span aria-hidden>Hapus dari Pendaftaran</span>}
      </button>
    </form>
  );
}

/** Bilah empat tahap (Disimpan → Diterima). */
export function TrackerSteps({ item, className }: { item: TrackerItem; className?: string }) {
  const progress = trackerProgress(item.status);
  return (
    <ol aria-label={`Tahap sekarang: ${TRACKER_STATUS_LABEL[item.status]}`} className={cn('flex items-center gap-1', className)}>
      {TRACKER_STEPS.map((step, index) => {
        const done = index <= progress.reached;
        return (
          <li key={step} className="flex flex-1 flex-col gap-1.5">
            <span aria-hidden className={cn('h-1 rounded-[2px]', done ? (progress.rejected && index === progress.reached ? 'bg-ink-muted' : 'bg-brand') : 'bg-line')} />
            <span className={cn('hidden text-[11.5px] sm:block', index === progress.reached ? 'font-semibold text-ink' : 'text-ink-muted')}>
              {TRACKER_STEP_LABEL[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Satu baris di papan Pendaftaran (kanvas Profil → Pendaftaran): logo
 * penyelenggara, judul, bilah empat tahap, lalu kendali ubah tahap & hapus.
 * Kendalinya tetap <form> biasa supaya jalan tanpa JavaScript.
 */
export function TrackerCard({ item, returnTo = '/tracker' }: { item: TrackerItem; returnTo?: string }) {
  const { event } = item;
  const progress = trackerProgress(item.status);

  return (
    <article className="grid gap-x-5 gap-y-3 border-t border-line/70 py-5 first:border-t-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3.5">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-brand font-mono text-[13px] font-medium">
          {initialsOf(event.organizer)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[12.5px] font-medium text-ink-muted">{EVENT_TYPE_LABEL[event.eventType]}</span>
            <DeadlineTag deadlineAt={event.primaryDeadlineAt} />
          </div>
          <h3 className="text-[15.5px] font-semibold leading-snug tracking-[-0.01em]">
            <Link href={`/tracker/${event.slug}`} className="-my-1 inline-flex min-h-11 items-center gap-1 hover:underline">
              {event.title}
              <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="sr-only">, lihat status</span>
            </Link>
          </h3>
          <span className="text-[13px] text-ink-muted">{event.organizer}</span>
          <TrackerSteps item={item} className="mt-1.5 max-w-[460px]" />
          {progress.rejected && (
            <span className="mt-1 inline-flex items-center gap-1.5 self-start rounded-sm border border-dashed border-ink-muted px-2 py-0.5 text-[12.5px] font-medium">
              <X aria-hidden className="size-3" /> Belum berhasil kali ini
            </span>
          )}
          {item.status === 'ACCEPTED' && (
            <span className="mt-1 inline-flex items-center gap-1.5 self-start rounded-sm bg-brand px-2 py-0.5 text-[12.5px] font-semibold text-on-brand">
              <Check aria-hidden className="size-3" strokeWidth={2.6} /> Diterima
            </span>
          )}
          {item.notes && <p className="line-clamp-2 max-w-[60ch] text-[13px] italic text-ink-soft">&ldquo;{item.notes}&rdquo;</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-[58px] md:pl-0">
        <TrackerStatusForm item={item} returnTo={returnTo} />
        <TrackerRemoveForm item={item} returnTo={returnTo} />
      </div>
    </article>
  );
}
