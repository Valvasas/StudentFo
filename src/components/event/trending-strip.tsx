import Link from 'next/link';
import { ArrowRight, Flame } from 'lucide-react';
import { CardCounts } from '@/components/event/card-counts';
import { daysLeftLabel, daysUntil } from '@/lib/deadline';
import { TREND_MIN_SCORE } from '@/lib/popularity';
import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, type EventSummary } from '@/types/domain';

/** Minimal sekian kegiatan yang benar-benar ramai, baru bagiannya tampil. */
const MIN_ITEMS = 2;

/** Kegiatan yang pantas disebut "ramai" — skor di atas ambang, urutan skor dipertahankan. */
export function trendingItems(events: readonly EventSummary[], limit: number): EventSummary[] {
  return events.filter((event) => (event.trendScore ?? 0) >= TREND_MIN_SCORE).slice(0, limit);
}

/**
 * "Lagi ramai" (ADR-092): kegiatan dengan interaksi 14 hari terakhir paling
 * hidup (`lib/popularity.ts`) — di atas, tanpa mengubah urutan tenggat papan
 * di bawahnya. Disembunyikan bila kurang dari dua kegiatan yang benar-benar
 * ramai: bagian "trending" berisi kegiatan sepi adalah klaim palsu.
 * `moreHref` = daftar lengkap berurutan "Lagi ramai".
 */
export function TrendingStrip({
  events,
  now,
  title = 'Lagi ramai',
  lead = 'Paling banyak disimpan, didaftari, disukai, dan dibicarakan dua minggu terakhir — yang terbaru dihitung lebih berat.',
  moreHref,
  className,
}: {
  events: readonly EventSummary[];
  now: Date;
  title?: string;
  lead?: string;
  moreHref?: string;
  className?: string;
}) {
  if (events.length < MIN_ITEMS) return null;
  return (
    <section aria-labelledby="lagi-ramai" className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="lagi-ramai" className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.025em]">
            <Flame aria-hidden className="size-5 text-like" />
            {title}
          </h2>
          <p className="text-[14px] text-ink-muted">{lead}</p>
        </div>
        {moreHref && (
          <Link href={moreHref} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold underline-offset-[3px] hover:underline">
            Lihat semua <ArrowRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
      <ol className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
        {events.map((event, index) => {
          const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
          return (
            <li key={event.id} className="relative flex min-w-0 gap-3 rounded-[14px] border border-line bg-panel p-4 transition-colors duration-150 ease-snap hover:border-line-strong">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-like-soft text-[13px] font-bold tabular-nums text-like">
                <span className="sr-only">Peringkat </span>
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[12.5px] font-medium text-ink-muted">
                  {EVENT_TYPE_LABEL[event.eventType]} · {daysLeftLabel(days)}
                </span>
                <Link
                  href={`/events/${event.slug}`}
                  className="text-[15.5px] font-semibold leading-snug after:absolute after:inset-0 after:rounded-[14px] after:content-[''] hover:underline"
                >
                  <span className="line-clamp-2 [overflow-wrap:anywhere]">{event.title}</span>
                </Link>
                <span className="line-clamp-1 text-[13px] text-ink-muted [overflow-wrap:anywhere]">{event.organizer}</span>
                <CardCounts counts={event.counts} className="mt-1" />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
