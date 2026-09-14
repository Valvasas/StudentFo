import { EventCard } from '@/components/event/event-card';
import type { EventSummary } from '@/types/domain';

export function EventGrid({
  events,
  featuredCount = 0,
  savedEventIds,
  returnTo,
}: {
  events: readonly EventSummary[];
  /** Berapa kartu pertama yang memakai cincin tenggat. */
  featuredCount?: number;
  savedEventIds?: readonly string[];
  returnTo?: string;
}) {
  const savedSet = savedEventIds ? new Set(savedEventIds) : null;

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event, index) => (
        <li key={event.id} className="reveal" style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}>
          <EventCard
            event={event}
            featured={index < featuredCount}
            isSaved={savedSet ? savedSet.has(event.id) : false}
            returnTo={returnTo}
            className="h-full"
          />
        </li>
      ))}
    </ul>
  );
}
