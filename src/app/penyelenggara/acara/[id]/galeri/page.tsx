import type { Metadata } from 'next';
import { MediaManager } from '@/components/event/media-manager';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import {
  EventWorkspaceHeader,
  loadManagedEvent,
  NotManaging,
  workspaceBadges,
  workspaceMetadata,
  workspacePath,
} from '@/components/organizer/event-workspace';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return workspaceMetadata('Poster, galeri & video', (await params).id);
}

/** Tab Galeri ruang kerja acara: poster, foto, dan video (ADR-056, ADR-079). */
export default async function EventGalleryStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser(workspacePath(id, 'galeri'));
  const context = await loadManagedEvent(user, id);
  if (!context) return <NotManaging />;
  const { event } = context;

  const [photos, badges] = await Promise.all([(await getEventRepository()).listEventPhotos(event.id), workspaceBadges(user, event.id)]);

  return (
    <div className="container-page flex flex-col gap-8 py-8">
      <EventWorkspaceHeader event={event} active="galeri" badges={badges} />
      <ActionFeedback params={query} className="max-w-2xl" />
      <MediaManager context="studio" event={event} photos={photos} />
    </div>
  );
}
