import Link from 'next/link';
import { Building2, Globe, MapPin } from 'lucide-react';
import { DeadlineRing } from '@/components/event/deadline-ring';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { PromotedBadge } from '@/components/event/price-badge';
import { CardBadges } from '@/components/registration/native-badge';
import { SaveButton } from '@/components/event/save-button';
import { VerifiedBadge } from '@/components/event/verified-badge';
import { isPromoted } from '@/lib/data/listing';
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
  /** Pendaftaran langsung di StudentFo sedang dibuka (ADR-055). */
  native?: boolean;
  className?: string;
}

export function EventCard({
  event,
  featured = false,
  isSaved = false,
  returnTo = '/events',
  native = false,
  className,
}: EventCardProps) {
  const promoted = isPromoted(event, new Date());
  const meta = [
    event.isOnline ? 'Daring' : (event.location ?? 'Lokasi menyusul'),
    event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(' · '),
  ].filter(Boolean);

  return (
    <article
      className={cn(
        'group relative flex flex-col rounded-panel border border-line bg-panel p-5 sm:p-6',
        'shadow-card transition-colors duration-150 ease-snap',
        'hover:border-line-strong focus-within:border-brand',
        className,
      )}
    >
      {/* Baris atas: SATU kontrol di kanan (simpan). Sebelumnya pill jenis +
          pill promosi + tombol simpan + tag tenggat berebut satu baris dan
          saling dorong di kartu sempit — tenggat kini pindah ke kaki kartu. */}
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1.5 text-[13px] font-medium text-ink-muted">
          <span>{EVENT_TYPE_LABEL[event.eventType]}</span>
          {promoted && <PromotedBadge />}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {featured && <DeadlineRing deadlineAt={event.primaryDeadlineAt} size={44} />}
          <SaveButton eventId={event.id} isSaved={isSaved} returnTo={returnTo} />
        </div>
      </div>

      <h3 className="mt-3 font-display text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]">
        <Link
          href={`/events/${event.slug}`}
          className="after:absolute after:inset-0 after:rounded-panel after:content-[''] hover:underline hover:decoration-2 hover:underline-offset-4"
        >
          <span className="line-clamp-3">{event.title}</span>
        </Link>
      </h3>

      <p className="mt-2.5 flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
        {event.verificationBadge ? (
          <VerifiedBadge badge={event.verificationBadge} className="-ml-1" />
        ) : (
          <Building2 aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
        )}
        <span className="line-clamp-1">{event.organizer}</span>
      </p>

      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-muted">
        {event.isOnline ? <Globe aria-hidden className="size-3.5 shrink-0" /> : <MapPin aria-hidden className="size-3.5 shrink-0" />}
        <span className="line-clamp-1">{meta.join(' · ')}</span>
      </p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-6">
        <DeadlineTag deadlineAt={event.primaryDeadlineAt} />
        <CardBadges event={event} native={native} />
      </div>
    </article>
  );
}
