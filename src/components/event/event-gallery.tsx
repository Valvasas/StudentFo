import { useId } from 'react';
import { GalleryViewer, type GalleryItem } from '@/components/event/gallery-viewer';
import type { EventPhoto } from '@/types/domain';

export function photoSrc(photoId: string): string {
  return `/media/foto/${encodeURIComponent(photoId)}`;
}

export function photoAlt(photo: Pick<EventPhoto, 'caption'>, position: number, eventTitle: string): string {
  return photo.caption ?? `Foto ${position} dari ${eventTitle}`;
}

/** Galeri foto di halaman acara (ADR-056) — urutan dari repository (terbaru dulu). Kosong = tidak dirender. */
export function EventGallery({ photos, eventTitle }: { photos: readonly EventPhoto[]; eventTitle: string }) {
  const headingId = useId();
  if (photos.length === 0) return null;

  const items: GalleryItem[] = photos.map((photo, index) => ({
    id: photo.id,
    src: photoSrc(photo.id),
    alt: photoAlt(photo, index + 1, eventTitle),
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
  }));

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-[22px] font-bold tracking-[-0.025em]">
          Galeri
        </h2>
        <span className="text-sm text-ink-muted">{photos.length} foto</span>
      </div>
      <GalleryViewer items={items} label={`Galeri foto ${eventTitle}`} />
    </section>
  );
}
