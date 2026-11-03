import { PriceBadge } from '@/components/event/price-badge';
import { VerifiedBadge } from '@/components/event/verified-badge';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { Pagination } from '@/components/event/pagination';
import { CategoryIcon, shortCategoryName } from '@/components/listing/category-icon';
import { DaysLeft } from '@/components/listing/countdown';
import {
  Breadcrumb,
  ChipLink,
  CollapsibleFilters,
  levelSegments,
  PageTitle,
  ResultsEmpty,
  SaveToggle,
  SearchBox,
  SegmentLinks,
} from '@/components/listing/listing-ui';
import { daysUntil, formatDateTimeId, formatShortDateId } from '@/lib/deadline';
import { levelSummary } from '@/lib/eligibility';
import { buildEventHref, hasActiveFilters, type ParsedEventQuery } from '@/lib/search-params';
import type { Category, EventSummary, Paginated } from '@/types/domain';

export interface BoardProps {
  readonly query: ParsedEventQuery;
  readonly result: Paginated<EventSummary>;
  readonly categories: readonly Category[];
  readonly savedIds: readonly string[];
  readonly currentHref: string;
  readonly now: Date;
}

const GROUPS = [
  { title: 'Tutup minggu ini', min: 0, max: 7 },
  { title: 'Tutup bulan ini', min: 8, max: 21 },
  { title: 'Masih lama', min: 22, max: Number.POSITIVE_INFINITY },
] as const;

const addDays = (now: Date, days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

/**
 * Papan tenggat lomba (kanvas desain Info Lomba): sisa hari tenggat
 * terdekat, bilah filter menempel, kartu dikelompokkan per rentang waktu.
 *
 * Kanvas menaruh "Hadiah" sebagai angka besar di kartu. Data hadiah belum
 * ada di skema (ADR-039), jadi angka besarnya diganti hal yang benar-benar
 * kita tahu dan sama berguna untuk memutuskan: tanggal tutup.
 */
export function LombaBoard({ query, result, categories, savedIds, currentHref, now, top }: BoardProps & { top: EventSummary | null }) {
  const withDays = result.items.map((event) => ({
    event,
    days: event.primaryDeadlineAt ? (daysUntil(event.primaryDeadlineAt, now) ?? 999) : 999,
  }));
  const groups = GROUPS.map((group) => ({
    ...group,
    range:
      group.min === 0
        ? `Sampai ${formatShortDateId(addDays(now, 7))}`
        : group.max === Number.POSITIVE_INFINITY
          ? `Setelah ${formatShortDateId(addDays(now, 21))}`
          : `${formatShortDateId(addDays(now, 8))} – ${formatShortDateId(addDays(now, 21))}`,
    items: withDays.filter((row) => row.days >= group.min && row.days <= group.max),
  })).filter((group) => group.items.length > 0);

  let delay = 0;

  return (
    <div className="container-page">
      <div className="grid items-stretch gap-8 pt-12 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
        <div className="enter flex flex-col justify-end gap-3 [animation-duration:900ms]">
          <Breadcrumb current="Lomba" />
          <PageTitle>Papan tenggat lomba</PageTitle>
          <p className="max-w-[52ch] text-base leading-relaxed text-ink-muted">
            Lomba yang masih buka, dari yang paling cepat ditutup.
          </p>
        </div>

        {top?.primaryDeadlineAt && (
          <Link
            href={`/events/${top.slug}`}
            className="enter group flex flex-col gap-5 rounded-2xl border border-line bg-panel px-7 py-6 shadow-card transition-colors duration-200 ease-snap [animation-delay:120ms] [animation-duration:900ms] hover:border-line-strong"
          >
            <span className="flex items-center justify-between gap-3 text-[13px]">
              <span className="font-semibold text-ink-muted">Tenggat terdekat</span>
              <span className="flex items-center gap-1.5 font-medium">
                Lihat detail
                <ArrowRight aria-hidden className="size-3.5 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
              </span>
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-xl font-semibold leading-snug tracking-[-0.02em] group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">
                {top.title}
              </span>
              <span className="text-[13.5px] text-ink-muted">{top.organizer}</span>
            </span>
            <span className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-line pt-5">
              <DaysLeft deadlineAt={top.primaryDeadlineAt} now={now} size="lg" />
              <span className="text-[13.5px] text-ink-muted">Tutup {formatDateTimeId(top.primaryDeadlineAt)}</span>
            </span>
          </Link>
        )}
      </div>

      <section
        aria-label="Filter kegiatan"
        className="z-20 mt-10 flex flex-col gap-3.5 border-b border-line bg-canvas py-4 md:sticky md:top-16"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-full max-w-[400px] flex-[1_1_280px]">
            <SearchBox query={query} placeholder="Cari nama lomba atau penyelenggara" />
          </div>
          {hasActiveFilters({ ...query, types: [] }) && (
            <Link
              href={buildEventHref({ types: query.types, sort: query.sort })}
              className="inline-flex min-h-11 items-center px-2 text-[13.5px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink"
            >
              Hapus filter
            </Link>
          )}
        </div>
        <CollapsibleFilters
          breakpoint="md"
          activeCount={query.levels.length > 0 ? query.categories.length + 1 : query.categories.length}
          bodyClassName="flex-col gap-3.5"
        >
          <SegmentLinks label="Jenjang" items={levelSegments(query)} className="self-start" />
          <nav aria-label="Bidang" className="flex flex-wrap gap-2">
            <ChipLink href={buildEventHref(query, { categories: [], page: 1 })} active={query.categories.length === 0} icon={<CategoryIcon slug={undefined} />}>
              Semua
            </ChipLink>
            {categories.map((category) => (
              <ChipLink
                key={category.slug}
                href={buildEventHref(query, { categories: query.categories.includes(category.slug) ? [] : [category.slug], page: 1 })}
                active={query.categories.includes(category.slug)}
                icon={<CategoryIcon slug={category.slug} />}
              >
                {shortCategoryName(category.name)}
              </ChipLink>
            ))}
          </nav>
        </CollapsibleFilters>
      </section>

      <div className="flex flex-col gap-14 pb-10 pt-10">
        {groups.map((group) => (
          <section key={group.title} aria-labelledby={`grup-${group.min}`} className="flex flex-col gap-5">
            <div className="flex items-baseline gap-3.5">
              <h2 id={`grup-${group.min}`} className="text-[22px] font-bold tracking-[-0.025em]">
                {group.title}
              </h2>
              <span className="text-[13px] font-medium tabular-nums text-ink-muted">{group.items.length}</span>
              <span aria-hidden className="h-px flex-1 self-center bg-line" />
              <span className="text-[13px] text-ink-muted">{group.range}</span>
            </div>
            <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(290px,100%),1fr))]">
              {group.items.map(({ event }) => {
                const category = categories.find((item) => item.slug === event.categorySlugs[0]);
                const cardDelay = `${delay++ * 60}ms`;
                return (
                  <li
                    key={event.id}
                    className="enter group relative flex flex-col gap-[18px] rounded-[14px] border border-line bg-panel p-5 transition-[border-color,box-shadow] duration-200 ease-snap [animation-duration:700ms] focus-within:border-brand hover:border-line-strong hover:shadow-[0_14px_34px_rgba(0,0,0,.07)]"
                    style={{ animationDelay: cardDelay }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
                        <CategoryIcon slug={event.categorySlugs[0]} />
                        {category ? shortCategoryName(category.name) : 'Umum'}
                      </span>
                      <SaveToggle eventId={event.id} isSaved={savedIds.includes(event.id)} returnTo={currentHref} className="-my-2.5 -mr-2.5" />
                    </div>
                    {/* Satu blok tenggat per kartu: tanggal + sisa hari. Kanvas
                        mengulang tanggal yang sama lagi di kaki kartu plus bilah
                        progres berskala 30 hari — tiga penanda untuk satu fakta. */}
                    <div className="flex items-end justify-between gap-3">
                      <span className="flex flex-col gap-0.5">
                        <span className="text-xs text-ink-muted">Tutup pendaftaran</span>
                        <span className="text-[26px] font-bold leading-[1.1] tracking-[-0.035em]">
                          {event.primaryDeadlineAt ? formatShortDateId(event.primaryDeadlineAt) : 'Belum diumumkan'}
                        </span>
                      </span>
                      {event.primaryDeadlineAt && <DeadlineTag deadlineAt={event.primaryDeadlineAt} now={now} className="mb-1 shrink-0" />}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-[16.5px] font-semibold leading-snug tracking-[-0.015em]">
                        <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 after:rounded-[14px] after:content-['']">
                          {event.title}
                        </Link>
                      </h3>
                      <span className="flex items-center gap-1 text-[13px] text-ink-muted">
                        {event.verificationBadge && <VerifiedBadge badge={event.verificationBadge} className="-ml-1" />}
                        {event.organizer}
                      </span>
                    </div>
                    <PriceBadge event={event} className="self-start" />
                    <ul aria-label="Ringkasan" className="mt-auto flex flex-wrap gap-1.5">
                      {[
                        levelSummary(event.educationLevels).short,
                        event.isOnline ? 'Daring' : (event.location ?? 'Lokasi menyusul'),
                        `${event.savedCount.toLocaleString('id-ID')} menyimpan`,
                      ].map((chip) => (
                        <li key={chip} className="flex h-6 items-center rounded-[6px] bg-panel-nested px-[9px] text-[12.5px] font-medium text-ink-soft">
                          {chip}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {result.items.length === 0 && (
          <ResultsEmpty
            description="Coba kata kunci lain atau longgarkan filter yang sedang aktif."
            resetHref={buildEventHref({ types: query.types })}
          />
        )}

        {result.totalPages > 1 && <Pagination query={query} totalPages={result.totalPages} />}
      </div>
    </div>
  );
}
