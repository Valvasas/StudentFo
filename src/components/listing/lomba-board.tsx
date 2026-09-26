import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { Pagination } from '@/components/event/pagination';
import { CategoryIcon, shortCategoryName } from '@/components/listing/category-icon';
import { Countdown } from '@/components/listing/countdown';
import {
  Breadcrumb,
  ChipLink,
  levelSegments,
  PageTitle,
  ResultsEmpty,
  SaveToggle,
  SearchBox,
  SegmentLinks,
} from '@/components/listing/listing-ui';
import { daysLeftLabel, daysUntil, formatShortDateId } from '@/lib/deadline';
import { buildEventHref, hasActiveFilters, type ParsedEventQuery } from '@/lib/search-params';
import { EDUCATION_LEVEL_LABEL, type Category, type EventSummary, type Paginated } from '@/types/domain';

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
 * Papan tenggat lomba (kanvas desain Info Lomba): hitung mundur tenggat
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
            Lomba yang masih buka, dikelompokkan dari yang paling cepat ditutup. Jenjang dan bidangnya terlihat sejak awal
            supaya kamu bisa langsung memutuskan.
          </p>
        </div>

        {top?.primaryDeadlineAt && (
          <Link
            href={`/events/${top.slug}`}
            className="enter flex flex-col gap-5 rounded-2xl bg-inverse px-7 py-6 text-on-inverse transition-colors duration-200 ease-snap [animation-delay:120ms] [animation-duration:900ms] hover:bg-inverse/90"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs tracking-[.08em] text-on-inverse-muted">TENGGAT TERDEKAT</span>
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                Lihat detail <ArrowRight aria-hidden className="size-3.5" />
              </span>
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-xl font-semibold tracking-[-0.02em]">{top.title}</span>
              <span className="text-[13.5px] text-on-inverse-muted">{top.organizer}</span>
            </span>
            <Countdown
              deadlineAt={top.primaryDeadlineAt}
              renderedAt={now.getTime()}
              label={`Pendaftaran ${top.title} ${daysLeftLabel(daysUntil(top.primaryDeadlineAt, now)).toLowerCase()}.`}
            />
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
          <SegmentLinks label="Jenjang" items={levelSegments(query)} />
          {hasActiveFilters({ ...query, types: [] }) && (
            <Link
              href={buildEventHref({ types: query.types, sort: query.sort })}
              className="inline-flex min-h-11 items-center px-2 text-[13.5px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink"
            >
              Hapus filter
            </Link>
          )}
        </div>
        <nav aria-label="Bidang" className="flex flex-wrap gap-2">
          <ChipLink href={buildEventHref(query, { categories: [], page: 1 })} active={query.categories.length === 0}>
            <CategoryIcon slug={undefined} /> Semua
          </ChipLink>
          {categories.map((category) => (
            <ChipLink
              key={category.slug}
              href={buildEventHref(query, { categories: query.categories.includes(category.slug) ? [] : [category.slug], page: 1 })}
              active={query.categories.includes(category.slug)}
            >
              <CategoryIcon slug={category.slug} />
              {shortCategoryName(category.name)}
            </ChipLink>
          ))}
        </nav>
      </section>

      <div className="flex flex-col gap-14 pb-10 pt-10">
        {groups.map((group) => (
          <section key={group.title} aria-labelledby={`grup-${group.min}`} className="flex flex-col gap-5">
            <div className="flex items-baseline gap-3.5">
              <h2 id={`grup-${group.min}`} className="text-[22px] font-bold tracking-[-0.025em]">
                {group.title}
              </h2>
              <span className="font-mono text-[13px] text-ink-muted">{group.items.length}</span>
              <span aria-hidden className="h-px flex-1 self-center bg-line" />
              <span className="text-[13px] text-ink-muted">{group.range}</span>
            </div>
            <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(290px,100%),1fr))]">
              {group.items.map(({ event, days }) => {
                const category = categories.find((item) => item.slug === event.categorySlugs[0]);
                const urgent = days <= 7;
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
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-ink-muted">Tutup pendaftaran</span>
                      <span className="text-[26px] font-bold leading-[1.1] tracking-[-0.035em]">
                        {event.primaryDeadlineAt ? formatShortDateId(event.primaryDeadlineAt) : 'Belum diumumkan'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-[16.5px] font-semibold leading-snug tracking-[-0.015em]">
                        <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 after:rounded-[14px] after:content-['']">
                          {event.title}
                        </Link>
                      </h3>
                      <span className="text-[13px] text-ink-muted">{event.organizer}</span>
                    </div>
                    <ul aria-label="Ringkasan" className="flex flex-wrap gap-1.5">
                      {[
                        event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(' & ') || 'Terbuka umum',
                        event.isOnline ? 'Daring' : (event.location ?? 'Lokasi menyusul'),
                        `${event.savedCount.toLocaleString('id-ID')} menyimpan`,
                      ].map((chip) => (
                        <li key={chip} className="flex h-6 items-center rounded-[6px] bg-panel-nested px-[9px] text-[12.5px] font-medium text-ink-soft">
                          {chip}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto flex flex-col gap-2.5">
                      <div aria-hidden className="h-1 overflow-hidden rounded-[2px] bg-line">
                        <div className="h-full rounded-[2px] bg-brand" style={{ width: `${Math.max(6, Math.round(100 - (Math.min(days, 30) / 30) * 100))}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] text-ink-muted">
                          Tutup {event.primaryDeadlineAt ? formatShortDateId(event.primaryDeadlineAt) : '–'}
                        </span>
                        {urgent ? (
                          <span className="inline-flex h-6 items-center gap-[5px] rounded-[6px] bg-brand px-2 text-[12.5px] font-semibold text-on-brand">
                            <Clock aria-hidden className="size-3" />
                            {daysLeftLabel(days)}
                          </span>
                        ) : (
                          <span className="text-[13px] font-semibold">{days === 999 ? 'Tanggal TBA' : daysLeftLabel(days)}</span>
                        )}
                      </div>
                    </div>
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
