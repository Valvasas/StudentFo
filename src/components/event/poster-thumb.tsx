import Image from 'next/image';
import { photoSrc, posterAlt } from '@/components/event/event-photo';
import { cn } from '@/lib/utils';
import type { EventPoster, EventSummary } from '@/types/domain';

/**
 * Thumbnail poster di kartu & papan kegiatan (ADR-079): kecil, berproporsi
 * tetap 4:5, di samping judul — hierarki judul → tenggat tidak bergeser, dan
 * kartu tanpa poster tidak diberi gambar pengganti. Alt = judul +
 * penyelenggara (`posterAlt`): poster membawa isi yang tidak ada di teks
 * kartu dan ikut terindeks Google Gambar.
 */
export function PosterThumb({
  poster,
  event,
  className,
}: {
  poster: EventPoster | null | undefined;
  event: Pick<EventSummary, 'title' | 'organizer'>;
  className?: string;
}) {
  if (!poster) return null;
  return (
    <span
      data-poster-thumb
      className={cn('relative block aspect-[4/5] w-[72px] shrink-0 overflow-hidden rounded-[10px] border border-line bg-panel-nested sm:w-20', className)}
    >
      <Image
        src={photoSrc(poster.id)}
        alt={posterAlt(event.title, event.organizer)}
        width={poster.width}
        height={poster.height}
        sizes="80px"
        className="absolute inset-0 size-full object-cover"
      />
    </span>
  );
}
