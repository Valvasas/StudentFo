import Link from 'next/link';
import { MapPin, Monitor } from 'lucide-react';
import { Pagination } from '@/components/event/pagination';
import { shortCategoryName } from '@/components/listing/category-icon';
import { Breadcrumb, ChipLink, PageTitle, ResultsEmpty, SaveToggle, SegmentLinks } from '@/components/listing/listing-ui';
import type { BoardProps } from '@/components/listing/lomba-board';
import { daysLeftLabel, daysUntil, formatTimeId, jakartaDateKey, jakartaDateParts } from '@/lib/deadline';
import { initialsOf } from '@/lib/initials';
import { buildEventHref } from '@/lib/search-params';
import { EDUCATION_LEVEL_LABEL, type EventSummary } from '@/types/domain';

/**
 * Agenda seminar & konferensi (kanvas desain Seminar): kepala gelap, lalu
 * sesi dikelompokkan per tanggal seperti buku acara.
 *
 * Tanggal, jam, pembicara, dan tanda sertifikat di kanvas belum tercatat di
 * skema (ADR-039). Agenda disusun per tanggal TUTUP PENDAFTARAN dan kolom
 * jam menampilkan jam tutupnya — disebut terang-terangan, bukan dibiarkan
 * terbaca sebagai jam acara.
 */
export function SeminarAgenda({ query, result, categories, savedIds, currentHref, now }: BoardProps) {
  const groups = new Map<string, EventSummary[]>();
  for (const event of result.items) {
    const key = event.primaryDeadlineAt ? jakartaDateKey(new Date(event.primaryDeadlineAt)) : 'tba';
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const modeItems = [
    { label: 'Semua', href: buildEventHref(query, { mode: undefined, page: 1 }), active: !query.mode },
    { label: 'Daring', href: buildEventHref(query, { mode: 'online', page: 1 }), active: query.mode === 'online' },
    { label: 'Luring', href: buildEventHref(query, { mode: 'onsite', page: 1 }), active: query.mode === 'onsite' },
  ];

  return (
    <>
      <div className="bg-inverse text-on-inverse">
        <div className="container-page flex flex-col gap-8 pb-9 pt-14">
          <div className="enter flex flex-wrap items-end justify-between gap-6 [animation-duration:900ms]">
            <div className="flex max-w-[640px] flex-col gap-3">
              <Breadcrumb current="Seminar" inverse />
              <PageTitle className="text-on-inverse">Agenda seminar</PageTitle>
              <p className="text-base leading-relaxed text-on-inverse-muted">
                Disusun seperti buku acara, per tanggal tutup pendaftaran. Seminar dan konferensi dari penyelenggara yang
                sudah ditinjau.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-mono text-[44px] font-medium leading-none tracking-[-0.03em]">{result.total}</span>
              <span className="text-[13px] text-on-inverse-muted">sesi masih membuka pendaftaran</span>
            </div>
          </div>
          <section
            aria-label="Filter kegiatan"
            className="enter flex flex-wrap items-center gap-3 border-t border-inverse-nested pt-6 [animation-delay:120ms] [animation-duration:900ms]"
          >
            <SegmentLinks label="Cara hadir" items={modeItems} inverse />
            <span aria-hidden className="hidden h-6 w-px bg-inverse-nested sm:block" />
            <nav aria-label="Bidang" className="flex flex-wrap gap-1.5">
              <ChipLink inverse href={buildEventHref(query, { categories: [], page: 1 })} active={query.categories.length === 0}>
                Semua
              </ChipLink>
              {categories.map((category) => (
                <ChipLink
                  key={category.slug}
                  inverse
                  href={buildEventHref(query, { categories: query.categories.includes(category.slug) ? [] : [category.slug], page: 1 })}
                  active={query.categories.includes(category.slug)}
                >
                  {shortCategoryName(category.name)}
                </ChipLink>
              ))}
            </nav>
          </section>
        </div>
      </div>

      <div className="container-page pb-10 pt-4">
        {[...groups].map(([key, events], groupIndex) => {
          const parts = events[0]?.primaryDeadlineAt ? jakartaDateParts(events[0].primaryDeadlineAt) : null;
          const days = events[0]?.primaryDeadlineAt ? daysUntil(events[0].primaryDeadlineAt, now) : null;
          return (
            <section
              key={key}
              aria-label={parts ? `Tutup ${parts.weekday}, ${parts.day} ${parts.month}` : 'Tanggal belum diumumkan'}
              className="enter grid gap-4 border-b border-line py-8 [animation-duration:800ms] md:grid-cols-[180px_minmax(0,1fr)] md:gap-8"
              style={{ animationDelay: `${groupIndex * 90}ms` }}
            >
              <div className="flex flex-row items-baseline gap-3 self-start md:sticky md:top-[84px] md:flex-col md:items-start md:gap-1">
                <span className="text-[56px] font-bold leading-[.95] tracking-[-0.05em]">{parts?.day ?? '–'}</span>
                <span className="flex flex-col gap-1">
                  <span className="text-[15px] font-semibold">{parts?.weekday ?? 'Belum diumumkan'}</span>
                  <span className="font-mono text-xs uppercase tracking-[.06em] text-ink-muted">
                    {parts ? `${parts.month} ${parts.year}` : ''}
                  </span>
                  <span className="text-[12.5px] text-ink-muted md:mt-2">{daysLeftLabel(days)}</span>
                </span>
              </div>
              <ul className="flex flex-col">
                {events.map((event) => {
                  const category = categories.find((item) => item.slug === event.categorySlugs[0]);
                  return (
                    <li
                      key={event.id}
                      className="relative -mx-4 grid grid-cols-[minmax(0,1fr)_44px] gap-x-4 gap-y-3 rounded-[12px] px-4 py-5 transition-colors duration-200 ease-snap focus-within:bg-panel-nested hover:bg-panel-nested sm:grid-cols-[112px_minmax(0,1fr)_44px] sm:gap-6"
                    >
                      <div className="col-span-2 flex items-baseline gap-2 pt-0.5 sm:col-span-1 sm:flex-col sm:gap-0.5">
                        <span className="font-mono text-[15px] font-medium">{event.primaryDeadlineAt ? formatTimeId(event.primaryDeadlineAt).replace(' WIB', '') : '–'}</span>
                        <span className="font-mono text-[12.5px] text-ink-muted">tutup, WIB</span>
                      </div>
                      <div className="flex min-w-0 flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[12.5px] font-medium text-ink-muted">
                            {category ? shortCategoryName(category.name) : 'Umum'}
                          </span>
                          <h2 className="text-lg font-semibold leading-snug tracking-[-0.02em]">
                            <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 after:rounded-[12px] after:content-['']">
                              {event.title}
                            </Link>
                          </h2>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-panel-nested text-[11.5px] font-semibold">
                            {initialsOf(event.organizer)}
                          </span>
                          <span className="flex flex-col gap-px">
                            <span className="text-sm font-semibold">{event.organizer}</span>
                            <span className="text-[12.5px] text-ink-muted">Penyelenggara</span>
                          </span>
                        </div>
                        <ul aria-label="Ringkasan" className="flex flex-wrap gap-1.5">
                          <li className="flex h-6 items-center gap-[5px] rounded-[6px] border border-line px-[9px] text-xs font-medium">
                            {event.isOnline ? <Monitor aria-hidden className="size-3" /> : <MapPin aria-hidden className="size-3" />}
                            {event.isOnline ? 'Daring' : (event.location ?? 'Lokasi menyusul')}
                          </li>
                          <li className="flex h-6 items-center rounded-[6px] border border-line px-[9px] text-xs font-medium">
                            {event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(' · ') || 'Semua jenjang'}
                          </li>
                          {event.eventType === 'KONFERENSI' && (
                            <li className="flex h-6 items-center rounded-[6px] bg-brand px-[9px] text-xs font-semibold text-on-brand">Konferensi</li>
                          )}
                        </ul>
                      </div>
                      <SaveToggle eventId={event.id} isSaved={savedIds.includes(event.id)} returnTo={currentHref} className="row-start-2 sm:row-start-auto" />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {result.items.length === 0 && (
          <ResultsEmpty className="mt-8" description="Coba pilih bidang lain atau cara hadir yang berbeda." resetHref={buildEventHref({ types: query.types })} />
        )}

        {result.totalPages > 1 && (
          <div className="mt-8">
            <Pagination query={query} totalPages={result.totalPages} />
          </div>
        )}
      </div>
    </>
  );
}
