import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InboxTabs } from '@/components/demo/inbox-tabs';
import { MessagesApp, type RelatedEvent } from '@/components/demo/messages-app';
import { AccountShell } from '@/components/layout/account-shell';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateId } from '@/lib/deadline';
import { DEMO_CONVERSATIONS } from '@/lib/demo/conversations';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { EVENT_TYPE_LABEL } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pesan',
  robots: { index: false, follow: false },
};

/** Pesan (kanvas Pesan). Belum ada backend pesan — hanya di mode data contoh (ADR-039). */
export default async function MessagesPage() {
  if (!demoFeaturesEnabled) notFound();
  const user = await requireUser('/messages');
  const repository = await getEventRepository();
  const slugs = [...new Set(DEMO_CONVERSATIONS.map((item) => item.eventSlug).filter((slug): slug is string => Boolean(slug)))];
  const found = await Promise.all(slugs.map((slug) => repository.getEventBySlug(slug)));
  const events: Record<string, RelatedEvent> = {};
  for (const event of found) {
    if (event) {
      events[event.slug] = {
        slug: event.slug,
        title: event.title,
        type: EVENT_TYPE_LABEL[event.eventType],
        closes: event.primaryDeadlineAt ? formatDateId(event.primaryDeadlineAt) : null,
      };
    }
  }

  return (
    <AccountShell user={user} active="pesan">
      <div className="flex flex-col gap-5">
        <h1 className="sr-only">Pesan</h1>
        <InboxTabs active="pesan" description="Percakapan pribadi, tim, dan penyelenggara kegiatan." />
        <MessagesApp events={events} />
      </div>
    </AccountShell>
  );
}
