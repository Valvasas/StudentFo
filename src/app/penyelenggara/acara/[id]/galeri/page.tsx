import type { Metadata } from 'next';
import Image from 'next/image';
import { Images, ShieldAlert, Trash2 } from 'lucide-react';
import { deletePhotoAction, uploadPhotosAction } from '@/app/penyelenggara/acara/[id]/galeri/actions';
import { EventGallery } from '@/components/event/event-gallery';
import { photoAlt, photoSrc } from '@/components/event/event-photo';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import {
  EventWorkspaceHeader,
  loadManagedEvent,
  NotManaging,
  workspaceBadges,
  workspacePath,
} from '@/components/organizer/event-workspace';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { GALLERY_LIMITS } from '@/lib/data/repository';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import type { EventPhoto } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Galeri acara',
  robots: { index: false, follow: false },
};

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
  const remaining = Math.max(0, GALLERY_LIMITS.perEvent - photos.length);

  return (
    <div className="container-page flex flex-col gap-8 py-8">
      <EventWorkspaceHeader event={event} active="galeri" badges={badges} />

      <ActionFeedback params={query} className="max-w-2xl" />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <UploadCard eventId={event.id} used={photos.length} remaining={remaining} />

        <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-1">
          <section aria-labelledby="foto-galeri" className="flex flex-col gap-4">
            <h2 id="foto-galeri" className="text-lg font-semibold">
              Foto di galeri
            </h2>
            {photos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-panel border border-dashed border-line bg-panel px-6 py-12 text-center">
                <Images aria-hidden className="size-8 text-ink-faint" />
                <p className="font-semibold">Belum ada foto</p>
                <p className="max-w-sm text-sm text-ink-muted">
                  Foto edisi sebelumnya atau suasana acara membantu calon peserta percaya acaramu benar-benar ada.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {photos.map((photo, index) => (
                  <PhotoCard key={photo.id} photo={photo} position={index + 1} eventId={event.id} eventTitle={event.title} />
                ))}
              </ul>
            )}
          </section>

          {photos.length > 0 && (
            <section aria-labelledby="pratinjau" className="flex flex-col gap-4">
              <h2 id="pratinjau" className="text-lg font-semibold">
                Tampilan di halaman acara
              </h2>
              <div className="rounded-panel border border-line bg-canvas p-4 sm:p-5">
                <EventGallery photos={photos} eventTitle={event.title} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadCard({ eventId, used, remaining }: { eventId: string; used: number; remaining: number }) {
  const perUpload = Math.min(GALLERY_LIMITS.perUpload, remaining);
  return (
    <section
      aria-labelledby="tambah-foto"
      className="flex flex-col gap-5 rounded-panel border border-line bg-panel p-5 sm:p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="tambah-foto" className="text-lg font-semibold">
          Tambah foto
        </h2>
        <p className="text-sm tabular-nums text-ink-muted">
          <span className="font-semibold text-ink">{used}</span> / {GALLERY_LIMITS.perEvent}
          <span className="sr-only"> foto terpakai</span>
        </p>
      </div>

      {remaining > 0 ? (
        <form action={uploadPhotosAction} className="flex flex-col gap-4">
          <input type="hidden" name="eventId" value={eventId} />
          <ImageUploadField
            id="photos"
            name="photos"
            label="Foto"
            hint={`Maks. ${perUpload} foto sekali unggah, masing-masing hingga 5 MB.`}
            multiple
            maxFiles={perUpload}
            required
          />
          <Field id="caption" label="Keterangan (opsional)" hint="Berlaku untuk semua foto di unggahan ini.">
            <TextInput id="caption" name="caption" maxLength={GALLERY_LIMITS.captionMax} placeholder="mis. Babak final 2025" />
          </Field>
          <p className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-muted">
            <ShieldAlert aria-hidden className="mt-px size-4 shrink-0" />
            Jangan unggah foto yang memuat data pribadi (KTP, nomor HP, alamat) atau foto anak tanpa izin orang tuanya.
          </p>
          <SubmitButton className={buttonVariants()} pendingLabel="Mengunggah…">
            Unggah foto
          </SubmitButton>
        </form>
      ) : (
        <p className="rounded-card bg-panel-nested p-3 text-sm text-ink-soft">
          Galeri sudah penuh. Hapus foto lama untuk menambah yang baru.
        </p>
      )}
    </section>
  );
}

function PhotoCard({
  photo,
  position,
  eventId,
  eventTitle,
}: {
  photo: EventPhoto;
  position: number;
  eventId: string;
  eventTitle: string;
}) {
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-panel">
      <div className="relative aspect-[4/3] bg-panel-nested">
        <Image
          src={photoSrc(photo.id)}
          alt={photoAlt(photo, position, eventTitle)}
          width={photo.width}
          height={photo.height}
          sizes="(min-width: 1280px) 200px, (min-width: 1024px) 26vw, (min-width: 640px) 33vw, 50vw"
          className="absolute inset-0 size-full object-contain"
        />
        {position === 1 && (
          <Badge variant="neutral" className="absolute left-2 top-2 bg-panel/90 text-ink shadow-sm">
            Foto utama
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-2.5 pb-1 pt-2">
        {photo.caption && <p className="line-clamp-2 text-[13px] leading-snug text-ink-soft">{photo.caption}</p>}
        <details className="group mt-auto">
          <summary
            aria-label={`Hapus foto ke-${position}`}
            className={cn(
              'flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm px-1 text-[13px] font-medium text-ink-muted',
              'hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus group-open:text-danger [&::-webkit-details-marker]:hidden',
            )}
          >
            <Trash2 aria-hidden className="size-4" /> Hapus
          </summary>
          <form action={deletePhotoAction} className="pop flex flex-col gap-2 pb-2">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="photoId" value={photo.id} />
            <p className="text-[12.5px] leading-snug text-ink-muted">Foto langsung hilang dari halaman acara.</p>
            <SubmitButton
              aria-label={`Ya, hapus foto ke-${position}`}
              className={cn(buttonVariants({ variant: 'danger' }), 'w-full')}
            >
              Ya, hapus
            </SubmitButton>
          </form>
        </details>
      </div>
    </li>
  );
}
