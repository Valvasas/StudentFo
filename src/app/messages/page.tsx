import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InboxTabs } from '@/components/demo/inbox-tabs';
import { MessagesApp, type RelatedEvent } from '@/components/demo/messages-app';
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
  await requireUser('/messages');
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
    // Tanpa AccountShell (ADR-048): kotak masuk sudah punya kolom daftarnya
    // sendiri; menu akun di kiri membuatnya tiga kolom dan memotong nama
    // percakapan. Tujuan menu itu tetap ada di menu akun navbar.
    <div className="container-page flex flex-col gap-6 pb-16 pt-8">
      <h1 className="sr-only">Pesan</h1>
      <InboxTabs active="pesan" description="Percakapan pribadi, tim, dan penyelenggara kegiatan." />
      <MessagesApp events={events} />
    </div>
  );
}
