import Link from 'next/link';
import { Check, Clock } from 'lucide-react';
import { Pagination } from '@/components/event/pagination';
import { shortCategoryName } from '@/components/listing/category-icon';
import { LocationFilter } from '@/components/listing/location-filter';
import {
  Breadcrumb,
  PageTitle,
  ResultsEmpty,
  SaveToggle,
  SearchBox,
  SegmentLinks,
  levelSegments,
  type LevelOption,
} from '@/components/listing/listing-ui';
import type { BoardProps } from '@/components/listing/lomba-board';
import { daysLeftLabel, daysUntil, formatShortDateId } from '@/lib/deadline';
import { initialsOf } from '@/lib/initials';
import { buildEventHref, hasActiveFilters } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL } from '@/types/domain';

const MAGANG_LEVELS: readonly LevelOption[] = [
  { label: 'Semua', levels: [] },
  { label: 'SMK', levels: ['SMA_SMK'] },
  { label: 'Mahasiswa', levels: ['D3', 'D4_S1', 'S2', 'S3'] },
];

/**
 * Papan lowongan magang (kanvas desain Magang): pencarian besar + pemilih
 * lokasi melayang, filter di kolom kiri, baris lowongan.
 *
 * Kanvas menonjolkan uang saku di kanan tiap baris dan punya sakelar
 * "Uang saku disebutkan". Data uang saku belum ada di skema (ADR-039), jadi
 * kolom kanan menampilkan tanggal tutup — bukan angka rekaan.
 */
export function MagangBoard({ query, result, categories, savedIds, currentHref, now, locationCounts }: BoardProps & { locationCounts: Readonly<Record<string, number>> }) {
  const sortItems = [
    { label: 'Paling cocok', href: buildEventHref(query, { sort: 'relevance', page: 1 }), active: query.sort === 'relevance' },
    { label: 'Tenggat terdekat', href: buildEventHref(query, { sort: 'deadline', page: 1 }), active: query.sort === 'deadline' },
  ];
  const modeItems = [
    { label: 'Daring', mode: 'online' as const },
    { label: 'Luring', mode: 'onsite' as const },
  ];

  return (
    <>
      <div className="border-b border-line bg-panel-nested">
        <div className="container-page flex flex-col gap-7 pb-10 pt-12">
          <div className="enter flex max-w-[640px] flex-col gap-3 [animation-duration:900ms]">
            <Breadcrumb current="Magang" />
            <PageTitle>Magang pertama, dari penyelenggara yang jelas.</PageTitle>
            <p className="text-base leading-relaxed text-ink-muted">
              Lowongan yang sudah ditinjau manual, lengkap dengan lokasi, jenjang, dan tanggal tutupnya sejak awal.
            </p>
          </div>
          <div className="enter relative z-20 flex flex-wrap gap-2 rounded-[14px] border border-line-strong/70 bg-panel p-2 shadow-[0_10px_30px_rgba(0,0,0,.05)] [animation-delay:120ms] [animation-duration:900ms]">
            <div className="flex min-w-0 flex-[1_1_320px]">
              <SearchBox query={query} size="lg" placeholder="Posisi, perusahaan, atau keahlian" />
            </div>
            <div className="flex items-center border-line sm:border-l sm:pl-1.5">
              <LocationFilter query={query} counts={locationCounts} />
            </div>
          </div>
        </div>
      </div>

      <div className="container-page flex flex-wrap items-start gap-10 pb-10 pt-8">
        <section aria-label="Filter kegiatan" className="flex w-full flex-col gap-7 lg:sticky lg:top-[92px] lg:w-[232px] lg:flex-none">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold">Bidang</span>
            <ul className="flex flex-col">
              {categories.map((category) => {
                const on = query.categories.includes(category.slug);
                return (
                  <li key={category.slug}>
                    <Link
                      href={buildEventHref(query, {
                        categories: on ? query.categories.filter((slug) => slug !== category.slug) : [...query.categories, category.slug],
                        page: 1,
                      })}
                      scroll={false}
                      aria-current={on ? 'true' : undefined}
                      className="flex min-h-11 items-center gap-2.5 text-sm lg:min-h-9"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-[18px] items-center justify-center rounded-[5px] border-[1.5px] border-brand text-on-brand transition-colors duration-150',
                          on ? 'bg-brand' : 'bg-panel',
                        )}
                      >
                        {on && <Check className="size-3" strokeWidth={2.6} />}
                      </span>
                      <span className="flex-1">{shortCategoryName(category.name)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-semibold">Cara kerja</span>
            <div className="flex flex-wrap gap-1.5">
              {modeItems.map((item) => {
                const on = query.mode === item.mode;
                return (
                  <Link
                    key={item.mode}
                    href={buildEventHref(query, { mode: on ? undefined : item.mode, locations: item.mode === 'online' ? [] : query.locations, page: 1 })}
                    scroll={false}
                    aria-current={on ? 'true' : undefined}
                    className={cn(
                      'relative flex h-[30px] items-center rounded-sm border px-[11px] text-[13px] font-medium transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-2 after:content-[""]',
                      on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong/70 bg-panel hover:border-line-strong',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-semibold">Jenjang</span>
            <SegmentLinks label="Jenjang" items={levelSegments(query, MAGANG_LEVELS)} stretch />
          </div>
          {hasActiveFilters({ ...query, types: [] }) && (
            <Link
              href={buildEventHref({ types: query.types })}
              className="inline-flex min-h-11 items-center self-start text-[13.5px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink"
            >
              Hapus semua filter
            </Link>
          )}
        </section>

        <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
            <p className="text-sm font-semibold" role="status">
              {result.total.toLocaleString('id-ID')} posisi terbuka
            </p>
            <SegmentLinks label="Urutkan" items={sortItems} />
          </div>

          {result.items.length === 0 && (
            <ResultsEmpty description="Coba lokasi lain atau kurangi filter bidang." resetHref={buildEventHref({ types: query.types })} />
          )}

          <ul className="flex flex-col gap-3">
            {result.items.map((event, index) => {
              const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
              const urgent = days !== null && days <= 7;
              const category = categories.find((item) => item.slug === event.categorySlugs[0]);
              return (
                <li
                  key={event.id}
                  className="enter relative flex flex-wrap gap-5 rounded-[14px] border border-line bg-panel p-5 transition-[border-color,box-shadow] duration-200 ease-snap [animation-duration:700ms] focus-within:border-brand hover:border-brand hover:shadow-[0_10px_28px_rgba(0,0,0,.06)]"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span aria-hidden className="flex size-[52px] shrink-0 items-center justify-center rounded-[12px] bg-brand text-[15px] font-semibold tracking-[-0.01em] text-on-brand">
                    {initialsOf(event.organizer)}
                  </span>
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5">
                    <div className="flex flex-col gap-1">
                      <h2 className="text-[17px] font-semibold tracking-[-0.015em]">
                        <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 after:rounded-[14px] after:content-['']">
                          {event.title}
                        </Link>
                      </h2>
                      <span className="text-[13.5px] text-ink-muted">
                        {event.organizer} · {event.isOnline ? 'Daring' : (event.location ?? 'Lokasi menyusul')}
                      </span>
                    </div>
                    <ul aria-label="Ringkasan" className="flex flex-wrap gap-1.5">
                      <li className="flex h-6 items-center rounded-[6px] bg-panel-nested px-[9px] text-[12.5px] font-medium text-ink-soft">
                        {event.isOnline ? 'Daring' : 'Luring'}
                      </li>
                      {event.educationLevels.length > 0 && (
                        <li className="flex h-6 items-center rounded-[6px] bg-panel-nested px-[9px] text-[12.5px] font-medium text-ink-soft">
                          {event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(' · ')}
                        </li>
                      )}
                      {category && (
                        <li className="flex h-6 items-center rounded-[6px] border border-line px-[9px] text-[12.5px] text-ink-muted">
                          {shortCategoryName(category.name)}
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="flex flex-[0_0_170px] flex-col items-end justify-between gap-3 text-right max-sm:flex-auto max-sm:flex-row max-sm:items-center max-sm:justify-between max-sm:text-left">
                    <SaveToggle eventId={event.id} isSaved={savedIds.includes(event.id)} returnTo={currentHref} className="-mr-2.5 -mt-2.5 max-sm:order-3 max-sm:m-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[17px] font-bold tracking-[-0.02em]">
                        {event.primaryDeadlineAt ? formatShortDateId(event.primaryDeadlineAt) : 'TBA'}
                      </span>
                      <span className="text-xs text-ink-muted">tutup pendaftaran</span>
                    </div>
                    {urgent ? (
                      <span className="inline-flex h-6 items-center gap-[5px] rounded-[6px] bg-brand px-2 text-[12.5px] font-semibold text-on-brand">
                        <Clock aria-hidden className="size-3" />
                        {daysLeftLabel(days)}
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-ink-muted">{daysLeftLabel(days)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {result.totalPages > 1 && (
            <div className="mt-6">
              <Pagination query={query} totalPages={result.totalPages} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
