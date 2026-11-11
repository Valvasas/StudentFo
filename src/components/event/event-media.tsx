import { MediaSlider, type MediaSlide } from '@/components/event/media-slider';
import { photoAlt, photoSrc } from '@/components/event/event-photo';
import { parseVideo } from '@/lib/video';
import type { EventPhoto } from '@/types/domain';

/**
 * Media acara di halaman detail (ADR-079): poster → video → foto lain, dalam
 * satu slide. Urutan foto dari repository (poster lebih dulu, lalu terbaru).
 * Tanpa poster, foto & video sama sekali = tidak dirender.
 */
export function EventMedia({
  photos,
  videoUrl,
  eventTitle,
}: {
  photos: readonly EventPhoto[];
  videoUrl: string | null | undefined;
  eventTitle: string;
}) {
  const video = parseVideo(videoUrl);
  const photoSlides: MediaSlide[] = photos.map((photo, index) => ({
    kind: 'photo',
    id: photo.id,
    src: photoSrc(photo.id),
    alt: photoAlt(photo, index + 1, eventTitle),
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
    isPoster: photo.isPoster,
  }));
  const videoSlides: MediaSlide[] = video ? [{ kind: 'video', id: `video-${video.id}`, video }] : [];
  // Gambar dulu (poster bila ada): kotak hitam pemutar bukan wajah pertama yang baik untuk sebuah acara.
  const [first, ...rest] = photoSlides;
  const slides = first ? [first, ...videoSlides, ...rest] : videoSlides;
  if (slides.length === 0) return null;

  const hasPoster = photos.some((photo) => photo.isPoster);
  const label = `${hasPoster ? 'Poster' : 'Foto'}${video ? ' & video' : ''} ${eventTitle}`;
  return <MediaSlider slides={slides} label={label} />;
}
