import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Pagination } from '@/components/event/pagination';
import { CategoryIcon, shortCategoryName } from '@/components/listing/category-icon';
import { Breadcrumb, ChipLink, PageTitle, ResultsEmpty, SaveToggle } from '@/components/listing/listing-ui';
import type { BoardProps } from '@/components/listing/lomba-board';
import { daysLeftLabel, daysUntil, jakartaDateKey, jakartaDateParts } from '@/lib/deadline';
import { buildEventHref, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL } from '@/types/domain';

const STRIP_DAYS = 30;
const WEEKDAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** `?tanggal=YYYY-MM-DD` — hari yang dipilih di strip kalender. */
function parseDay(params: RawSearchParams): string | null {
  const raw = Array.isArray(params.tanggal) ? params.tanggal[0] : params.tanggal;
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function withDay(href: string, day: string | null): string {
  if (!day) return href;
  return `${href}${href.includes('?') ? '&' : '?'}tanggal=${day}`;
}

/**
 * Kalender workshop & pelatihan (kanvas desain Workshop): strip 30 hari,
 * kartu dengan ubin tanggal.
 *
 * Kanvas memakai tanggal PELAKSANAAN dan bilah kursi tersisa. Skema baru
 * menyimpan tenggat pendaftaran (ADR-039), jadi strip dan ubin memakai
 * tanggal tutup pendaftaran — dan menyebutnya begitu, supaya tidak ada
 * yang datang ke acara pada tanggal yang salah.
 */
export function WorkshopCalendar({ query, result, categories, savedIds, currentHref, now, rawParams }: BoardProps & { rawParams: RawSearchParams }) {
  const day = parseDay(rawParams);
  const keyed = result.items.map((event) => ({
    event,
    key: event.primaryDeadlineAt ? jakartaDateKey(new Date(event.primaryDeadlineAt)) : null,
  }));
  const perDay = new Map<string, number>();
  for (const { key } of keyed) if (key) perDay.set(key, (perDay.get(key) ?? 0) + 1);
  const visible = day ? keyed.filter((row) => row.key === day) : keyed;

  const strip = Array.from({ length: STRIP_DAYS }, (_, index) => {
    const date = new Date(now.getTime() + index * 86_400_000);
    const key = jakartaDateKey(date);
    const parts = jakartaDateParts(date.toISOString());
    const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
    return { key, day: parts?.day ?? '', label: index === 0 ? 'Hari ini' : WEEKDAY_SHORT[weekday] ?? '', count: perDay.get(key) ?? 0 };
  });
  const first = jakartaDateParts(now.toISOString());
  const last = jakartaDateParts(new Date(now.getTime() + (STRIP_DAYS - 1) * 86_400_000).toISOString());
  const monthLabel = first && last ? (first.month === last.month ? `${first.month} ${first.year}` : `${first.month} – ${last.month} ${last.year}`) : '';
  const selected = day ? jakartaDateParts(`${day}T12:00:00+07:00`) : null;
  const base = buildEventHref(query, { page: 1 });

  return (
    <div className="container-page pb-10 pt-12">
      <div className="enter flex max-w-[620px] flex-col gap-3 [animation-duration:900ms]">
        <Breadcrumb current="Workshop" />
        <PageTitle>Kalender kelas praktik</PageTitle>
        <p className="text-base leading-relaxed text-ink-muted">
          Workshop dan pelatihan disusun per tanggal tutup pendaftaran. Pilih tanggal di bawah untuk melihat yang ditutup hari
          itu.
        </p>
      </div>

      <section aria-label="Filter kegiatan">
        <div className="enter mt-9 flex items-center gap-3 [animation-delay:100ms] [animation-duration:900ms]">
          <span className="font-mono text-xs uppercase tracking-[.08em] text-ink-muted">Tutup pendaftaran · {monthLabel}</span>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
        <nav
          aria-label="Pilih tanggal"
          className="enter mt-3.5 flex gap-1.5 overflow-x-auto pb-1.5 [animation-delay:160ms] [animation-duration:900ms] [scrollbar-width:thin]"
        >
          <Link
            href={base}
            scroll={false}
            aria-current={!day ? 'true' : undefined}
            className={cn(
              'flex h-[84px] w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-[12px] border transition-colors duration-200',
              !day ? 'border-brand bg-brand text-on-brand' : 'border-line bg-panel hover:border-brand',
            )}
          >
            <span className="text-[13px] font-semibold">Semua</span>
            <span className="text-[11.5px] opacity-70">tanggal</span>
          </Link>
          {strip.map((cell) => {
            const on = cell.key === day;
            return (
              <Link
                key={cell.key}
                href={withDay(base, cell.key)}
                scroll={false}
                aria-current={on ? 'true' : undefined}
                aria-label={`${cell.label} ${cell.day}, ${cell.count} kegiatan`}
                className={cn(
                  'flex h-[84px] w-14 shrink-0 flex-col items-center justify-center gap-[3px] rounded-[12px] border transition-colors duration-200 hover:border-brand',
                  on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-panel',
                  !on && cell.count === 0 && 'text-ink-muted',
                )}
              >
                <span className="text-[11.5px] font-medium opacity-75">{cell.label}</span>
                <span className="text-[22px] font-semibold leading-none tracking-[-0.03em]">{cell.day}</span>
                <span className="mt-1 flex h-[5px] gap-[3px]">
                  {Array.from({ length: Math.min(cell.count, 4) }, (_, index) => (
                    <span key={index} className={cn('size-[5px] rounded-pill', on ? 'bg-on-brand' : 'bg-brand')} />
                  ))}
                </span>
              </Link>
            );
          })}
        </nav>
        <nav aria-label="Bidang" className="mt-6 flex flex-wrap gap-2 border-b border-line pb-6">
          <ChipLink href={withDay(buildEventHref(query, { categories: [], page: 1 }), day)} active={query.categories.length === 0}>
            <CategoryIcon slug={undefined} /> Semua
          </ChipLink>
          {categories.map((category) => (
            <ChipLink
              key={category.slug}
              href={withDay(buildEventHref(query, { categories: query.categories.includes(category.slug) ? [] : [category.slug], page: 1 }), day)}
              active={query.categories.includes(category.slug)}
            >
              <CategoryIcon slug={category.slug} />
              {shortCategoryName(category.name)}
            </ChipLink>
          ))}
        </nav>
      </section>

      <div className="mt-7 flex items-baseline justify-between gap-3">
        <h2 className="text-[22px] font-bold tracking-[-0.025em]">
          {selected ? `Tutup ${selected.weekday}, ${selected.day} ${selected.month}` : 'Semua jadwal'}
        </h2>
        <span className="text-[13px] text-ink-muted">{visible.length} kegiatan</span>
      </div>

      {visible.length > 0 ? (
        <ul className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(460px,100%),1fr))]">
          {visible.map(({ event }, index) => {
            const parts = event.primaryDeadlineAt ? jakartaDateParts(event.primaryDeadlineAt) : null;
            const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
            const category = categories.find((item) => item.slug === event.categorySlugs[0]);
            return (
              <li
                key={event.id}
                className="enter relative flex gap-5 rounded-2xl border border-line bg-panel p-5 transition-[border-color,box-shadow] duration-200 ease-snap [animation-duration:700ms] focus-within:border-brand hover:border-line-strong hover:shadow-[0_14px_34px_rgba(0,0,0,.07)]"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div aria-hidden className="flex w-[72px] shrink-0 flex-col items-center self-start overflow-hidden rounded-[12px] border border-brand">
                  <span className="w-full bg-brand py-[5px] text-center font-mono text-[11px] uppercase tracking-[.08em] text-on-brand">
                    {parts?.month.slice(0, 3) ?? 'TBA'}
                  </span>
                  <span className="pb-0.5 pt-2 text-[30px] font-bold leading-none tracking-[-0.04em]">{parts?.day ?? '–'}</span>
                  <span className="pb-2 text-xs text-ink-muted">{parts?.weekday.slice(0, 3) ?? ''}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2 text-[12.5px] font-medium text-ink-muted">
                      <CategoryIcon slug={event.categorySlugs[0]} />
                      {category ? shortCategoryName(category.name) : 'Umum'}
                      <span aria-hidden className="text-line-strong">·</span>
                      {event.isOnline ? 'Daring' : (event.location ?? 'Lokasi menyusul')}
                      {event.eventType === 'PELATIHAN' && (
                        <>
                          <span aria-hidden className="text-line-strong">·</span>
                          Pelatihan
                        </>
                      )}
                    </span>
                    <h3 className="text-[17px] font-semibold leading-snug tracking-[-0.015em]">
                      <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 after:rounded-2xl after:content-['']">
                        {event.title}
                      </Link>
                    </h3>
                    <span className="text-[13px] text-ink-muted">{event.organizer}</span>
                  </div>
                  <p className="text-[12.5px] text-ink-soft">
                    Untuk {event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(', ') || 'semua jenjang'}
                  </p>
                  <div className="flex items-center justify-between gap-3 border-t border-line pt-3.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base font-bold tracking-[-0.02em]">{daysLeftLabel(days)}</span>
                      <span className="text-xs text-ink-muted">{event.savedCount.toLocaleString('id-ID')} orang menyimpan</span>
                    </div>
                    <div className="relative z-10 flex items-center gap-1">
                      <SaveToggle eventId={event.id} isSaved={savedIds.includes(event.id)} returnTo={withDay(currentHref, day)} />
                      <Link
                        href={`/events/${event.slug}`}
                        className="flex h-11 items-center gap-1.5 rounded-sm bg-brand px-3.5 text-[13.5px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover"
                        aria-label={`Lihat detail ${event.title}`}
                      >
                        Lihat detail <ArrowRight aria-hidden className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ResultsEmpty className="mt-5" description="Tidak ada workshop yang ditutup di tanggal ini. Pilih tanggal bertanda titik, atau lihat semua tanggal." resetHref={buildEventHref({ types: query.types })} />
      )}

      {!day && result.totalPages > 1 && (
        <div className="mt-8">
          <Pagination query={query} totalPages={result.totalPages} />
        </div>
      )}
    </div>
  );
}
