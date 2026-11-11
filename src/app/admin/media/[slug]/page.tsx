import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImageIcon } from 'lucide-react';
import { AdminNav } from '@/components/admin/admin-nav';
import { MediaManager } from '@/components/event/media-manager';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { BackLink } from '@/components/ui/back-link';
import { adminMetadata, requireAdmin } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const generateMetadata = (): Promise<Metadata> => adminMetadata('Poster & video acara');

/**
 * Poster, foto & video satu acara tayang, untuk admin (ADR-079). Acara hasil
 * kiriman komunitas atau scraping tidak punya pengelola, jadi tanpa halaman
 * ini tidak ada yang bisa memberinya poster. Studio penyelenggara sengaja
 * tidak dibuka untuk admin: tab lain di sana memuat data pribadi pendaftar.
 */
export default async function AdminEventMediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  await requireAdmin();

  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(slug);
  if (!event) notFound();
  const photos = await repository.listEventPhotos(event.id);

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <AdminNav active="promosi" />
      <BackLink href="/admin/promosi" label="Lencana & promosi" className="-mb-2" />
      <header className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-3xl">
          <ImageIcon aria-hidden className="size-7 text-ink-muted" />
          Poster & video
        </h1>
        <p className="max-w-2xl text-ink-soft">
          <Link href={`/events/${event.slug}`} className="font-semibold text-ink underline-offset-[3px] hover:underline">
            {event.title}
          </Link>{' '}
          · {event.organizer}. Pastikan poster & video berasal dari kanal resmi penyelenggara — keduanya tampil publik.
        </p>
      </header>
      <ActionFeedback params={query} className="max-w-2xl" />
      <MediaManager context="admin" event={event} photos={photos} />
    </div>
  );
}
