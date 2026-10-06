import { EventCard } from '@/components/event/event-card';
import type { EventSummary } from '@/types/domain';

export function EventGrid({
  events,
  featuredCount = 0,
  savedEventIds,
  returnTo,
  nativeIds,
}: {
  events: readonly EventSummary[];
  /** Berapa kartu pertama yang memakai cincin tenggat. */
  featuredCount?: number;
  savedEventIds?: readonly string[];
  returnTo?: string;
  /** Acara yang pendaftaran langsungnya dibuka (ADR-055). */
  nativeIds?: ReadonlySet<string>;
}) {
  const savedSet = savedEventIds ? new Set(savedEventIds) : null;

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
      {events.map((event, index) => (
        <li key={event.id} className="reveal" style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}>
          <EventCard
            event={event}
            featured={index < featuredCount}
            isSaved={savedSet ? savedSet.has(event.id) : false}
            returnTo={returnTo}
            native={nativeIds?.has(event.id) ?? false}
            className="h-full"
          />
        </li>
      ))}
    </ul>
  );
}
