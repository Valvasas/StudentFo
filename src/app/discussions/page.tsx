import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DiscussionsApp, type GroupEvent } from '@/components/demo/discussions-app';
import { InboxTabs } from '@/components/demo/inbox-tabs';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { DEMO_GROUPS, DISCOVER_SLUGS } from '@/lib/demo/discussions';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { EVENT_TYPE_LABEL } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ruang diskusi',
  robots: { index: false, follow: false },
};

/** Ruang diskusi (kanvas Ruang Diskusi). Belum ada backend diskusi — hanya di mode data contoh (ADR-039). */
export default async function DiscussionsPage() {
  if (!demoFeaturesEnabled) notFound();
  const user = await requireUser('/discussions');
  const repository = await getEventRepository();
  const slugs = [...DEMO_GROUPS.map((group) => group.eventSlug), ...DISCOVER_SLUGS];
  const found = await Promise.all(slugs.map((slug) => repository.getEventBySlug(slug)));
  const events: Record<string, GroupEvent> = {};
  for (const event of found) {
    if (event) events[event.slug] = { slug: event.slug, title: event.title, type: EVENT_TYPE_LABEL[event.eventType], organizer: event.organizer };
  }

  return (
    // Tanpa AccountShell — alasan yang sama dengan /messages (ADR-048).
    <div className="container-page flex flex-col gap-6 pb-16 pt-8">
      <h1 className="sr-only">Ruang diskusi</h1>
      <InboxTabs active="diskusi" description="Satu grup untuk setiap kegiatan yang kamu ikuti. Panitia menjawab langsung di sini." />
      <DiscussionsApp events={events} userName={user.fullName} />
    </div>
  );
}
