import { Building2, Globe, MapPin } from 'lucide-react';
import { DeadlineRing } from '@/components/event/deadline-ring';
import { CardCounts } from '@/components/event/card-counts';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { PosterThumb } from '@/components/event/poster-thumb';
import { PriceBadge, PromotedBadge } from '@/components/event/price-badge';
import { SaveButton } from '@/components/event/save-button';
import { TrustBadge } from '@/components/event/trust-badge';
import { VerifiedBadge } from '@/components/event/verified-badge';
import { TransitionLink } from '@/components/ui/transition-link';
import { isPromoted } from '@/lib/data/listing';
import { levelSummary } from '@/lib/eligibility';
import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, type EventSummary } from '@/types/domain';

/**
 * Kartu event.
 *
 * Hierarki visual mengikuti Blueprint §5.5:
 *   Judul (semibold, text-base) > Tenggat (medium, sm, berwarna) > Penyelenggara (muted, sm)
 *
 * Beberapa keputusan yang disengaja:
 * - Poster HANYA sebagai thumbnail kecil berproporsi tetap di samping judul,
 *   dan hanya bila panitia/admin memilih poster (ADR-079). Kartu dibaca
 *   secara memindai: gambar besar atau thumbnail hasil scraping yang
 *   kualitasnya tidak seragam menaikkan beban kognitif. Poster di sini
 *   dipilih manusia, dan ukurannya tidak menggeser hierarki judul → tenggat.
 * - TIDAK ada baris tag bidang. Jenis + judul + penyelenggara + tempat/
 *   jenjang sudah cukup untuk memutuskan "buka atau lewati"; lapis kelima
 *   hanya menambah kepadatan, dan bidang bisa disaring di FilterBar.
 * - Hover (ADR-099, menggantikan "tanpa translate"): naik 3px + garis cahaya
 *   tipis, HANYA untuk pointer yang bisa hover dan bukan reduced-motion
 *   (`card-lift`, globals.css §14). Area sorotnya diperpanjang setinggi
 *   angkatannya, jadi kursor di tepi bawah tidak membuat kartu naik-turun.
 * - Judul & poster "terbang" ke halaman detail lewat View Transitions
 *   (`TransitionLink`); tanpa dukungan = tautan biasa.
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
  const promoted = isPromoted(event, new Date());
  const levels = levelSummary(event.educationLevels);
  const place = event.isOnline ? 'Daring' : (event.location ?? 'Lokasi menyusul');

  return (
    <article
      data-vt-card=""
      className={cn(
        'card-lift group relative flex flex-col rounded-2xl border border-line bg-panel p-5 sm:p-6',
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
          <TrustBadge level={event.verificationLevel} />
          {promoted && <PromotedBadge />}
          <CardCounts counts={event.counts} />
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {featured && <DeadlineRing deadlineAt={event.primaryDeadlineAt} size={44} />}
          <SaveButton eventId={event.id} isSaved={isSaved} returnTo={returnTo} />
        </div>
      </div>

      <div className="mt-3 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]">
            <TransitionLink
              href={`/events/${event.slug}`}
              className="underline decoration-transparent decoration-2 underline-offset-4 transition-colors duration-150 ease-snap after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:decoration-current"
            >
              <span data-vt-name="vt-event-title" className="line-clamp-3 [overflow-wrap:anywhere]">
                {event.title}
              </span>
            </TransitionLink>
          </h3>

          <p className="mt-2.5 flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
            {event.verificationBadge ? (
              <VerifiedBadge badge={event.verificationBadge} className="-ml-1" />
            ) : (
              <Building2 aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
            )}
            <span className="line-clamp-1 [overflow-wrap:anywhere]">{event.organizer}</span>
          </p>

          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-muted">
            {event.isOnline ? <Globe aria-hidden className="size-3.5 shrink-0" /> : <MapPin aria-hidden className="size-3.5 shrink-0" />}
            {/* Satu teks untuk mata & pembaca layar. Ringkasan rentang/"+N" diperjelas
                lewat `title`, bukan salinan `sr-only` — salinan terbaca "D4/S1D4/S1"
                oleh apa pun yang membaca teks tanpa CSS. */}
            <span className="line-clamp-1" title={levels.full === levels.short ? undefined : `Jenjang: ${levels.full}`}>
              {place} · {levels.short}
            </span>
          </p>
        </div>

        <PosterThumb poster={event.poster} event={event} />
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-6">
        <DeadlineTag deadlineAt={event.primaryDeadlineAt} live />
        <PriceBadge event={event} />
      </div>
    </article>
  );
}
