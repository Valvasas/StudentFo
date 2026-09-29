import Link from 'next/link';
import { Building2, Globe, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DeadlineRing } from '@/components/event/deadline-ring';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { SaveButton } from '@/components/event/save-button';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, type EventSummary } from '@/types/domain';

/**
 * Kartu event.
 *
 * Hierarki visual mengikuti Blueprint §5.5:
 *   Judul (semibold, text-base) > Tenggat (medium, sm, berwarna) > Penyelenggara (muted, sm)
 *
 * Beberapa keputusan yang disengaja:
 * - TIDAK ada gambar/poster. Kartu di produk ini dibaca secara memindai,
 *   dan thumbnail dari sumber pihak ketiga kualitasnya tidak seragam —
 *   hasilnya justru menaikkan beban kognitif, bukan menurunkannya.
 * - TIDAK ada baris tag bidang. Jenis + judul + penyelenggara + tempat/
 *   jenjang sudah cukup untuk memutuskan "buka atau lewati"; lapis kelima
 *   hanya menambah kepadatan, dan bidang bisa disaring di FilterBar.
 * - Hover hanya mengubah warna border & latar, tanpa translate/scale.
 *   Kartu yang "melompat" saat disentuh kursor membuat daftar panjang
 *   terasa gelisah dan menggeser target klik.
 * - Seluruh kartu bisa diklik lewat teknik stretched link, tapi yang
 *   benar-benar fokusable tetap SATU tautan (judul). Membungkus seluruh
 *   kartu dalam <a> akan membuat pembaca layar melafalkan seluruh isi
 *   kartu sebagai satu nama tautan yang panjangnya tak masuk akal.
 */
export interface EventCardProps {
  event: EventSummary;
  /** Varian unggulan memakai cincin tenggat, bukan tag. Dipakai terbatas. */
  featured?: boolean;
  isSaved?: boolean;
  returnTo?: string;
  className?: string;
}

export function EventCard({
  event,
  featured = false,
  isSaved = false,
  returnTo = '/events',
  className,
}: EventCardProps) {
  return (
    <article
      className={cn(
        'group relative flex flex-col gap-3 rounded-card border border-line bg-panel p-5',
        'shadow-card transition-colors duration-150 ease-snap',
        'hover:border-line-strong hover:bg-panel-nested/40',
        'focus-within:border-brand',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Badge variant="brand">{EVENT_TYPE_LABEL[event.eventType]}</Badge>
        <div className="flex items-center gap-2">
          <SaveButton eventId={event.id} isSaved={isSaved} returnTo={returnTo} />
          {featured ? (
            <DeadlineRing deadlineAt={event.primaryDeadlineAt} size={48} />
          ) : (
            <DeadlineTag deadlineAt={event.primaryDeadlineAt} />
          )}
        </div>
      </div>

      <h3 className="text-base font-semibold leading-snug">
        <Link
          href={`/events/${event.slug}`}
          className="after:absolute after:inset-0 after:content-[''] hover:text-brand-text"
        >
          <span className="line-clamp-2">{event.title}</span>
        </Link>
      </h3>

      <p className="flex items-center gap-1.5 text-sm text-ink-muted">
        <Building2 aria-hidden className="size-3.5 shrink-0" />
        <span className="line-clamp-1">{event.organizer}</span>
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-xs text-ink-muted">
        <span className="flex items-center gap-1">
          {event.isOnline ? (
            <>
              <Globe aria-hidden className="size-3.5" /> Daring
            </>
          ) : (
            <>
              <MapPin aria-hidden className="size-3.5" /> {event.location ?? 'Lokasi menyusul'}
            </>
          )}
        </span>
        {event.educationLevels.length > 0 && (
          <span className="truncate">
            {event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(' · ')}
          </span>
        )}
      </div>
    </article>
  );
}
