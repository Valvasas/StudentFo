import Link from 'next/link';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  buildEventHref,
  hasActiveFilters,
  toggleFilterHref,
  type ParsedEventQuery,
} from '@/lib/search-params';
import {
  EDUCATION_LEVELS,
  EDUCATION_LEVEL_LABEL,
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  SORT_OPTIONS,
  type Category,
} from '@/types/domain';

const SORT_LABEL: Record<(typeof SORT_OPTIONS)[number], string> = {
  relevance: 'Paling relevan',
  deadline: 'Tenggat terdekat',
  newest: 'Terbaru',
};

/**
 * Panel filter.
 *
 * Seluruhnya berbasis <form method="get"> dan <a href> — TANPA state klien.
 * Konsekuensinya, dan ini disengaja:
 *  - Berfungsi penuh meski JavaScript gagal dimuat (jaringan kampus, mode
 *    hemat data, ponsel lawas). Untuk produk yang isinya informasi publik,
 *    ini bukan kasus tepi.
 *  - Setiap kombinasi filter punya URL sendiri, jadi bisa di-bookmark,
 *    dibagikan di grup, dan di-index mesin pencari.
 *  - Tombol back browser bekerja sebagaimana mestinya, gratis.
 */
function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // aria-current, bukan aria-pressed: chip ini TAUTAN, dan aria-pressed
      // hanya sah di tombol (axe: aria-allowed-attr, critical).
      aria-current={active ? 'true' : undefined}
      scroll={false}
      className={cn(
        'inline-flex min-h-9 items-center rounded-pill border px-3 text-sm transition-colors duration-150 ease-snap',
        active
          ? 'border-brand bg-brand-soft font-medium text-brand-text'
          : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </Link>
  );
}

/** Field tersembunyi supaya filter aktif tidak hilang saat form dikirim. */
function HiddenFilters({ query }: { query: ParsedEventQuery }) {
  return (
    <>
      {query.types.map((value) => (
        <input key={`t-${value}`} type="hidden" name="type" value={value} />
      ))}
      {query.categories.map((value) => (
        <input key={`c-${value}`} type="hidden" name="kategori" value={value} />
      ))}
      {query.levels.map((value) => (
        <input key={`l-${value}`} type="hidden" name="jenjang" value={value} />
      ))}
      {query.sort !== 'relevance' && <input type="hidden" name="sort" value={query.sort} />}
      {query.includeClosed && <input type="hidden" name="tampilkan" value="semua" />}
    </>
  );
}

export function SearchForm({
  query,
  autoFocus = false,
}: {
  query: ParsedEventQuery;
  autoFocus?: boolean;
}) {
  return (
    <form action="/events" method="get" role="search" className="flex w-full gap-2">
      <HiddenFilters query={query} />
      <div className="relative flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          name="q"
          defaultValue={query.search}
          autoFocus={autoFocus}
          maxLength={120}
          placeholder="Cari lomba, beasiswa, magang…"
          aria-label="Kata kunci pencarian"
          className={cn(
            'h-11 w-full rounded-card border border-line bg-panel pl-9 pr-3 text-base',
            'text-ink placeholder:text-ink-faint',
            'transition-colors duration-150 ease-snap hover:border-line-strong',
            'focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          )}
        />
      </div>
      <Button type="submit">Cari</Button>
    </form>
  );
}

export function FilterBar({
  query,
  categories,
  resultCount,
}: {
  query: ParsedEventQuery;
  categories: readonly Category[];
  resultCount: number;
}) {
  const active = hasActiveFilters(query);

  return (
    <section aria-label="Filter kegiatan" className="flex flex-col gap-4">
      <SearchForm query={query} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink-soft">
          <SlidersHorizontal aria-hidden className="size-4" />
          Jenis
        </span>
        {EVENT_TYPES.map((type) => (
          <FilterChip
            key={type}
            href={toggleFilterHref(query, 'types', type)}
            active={query.types.includes(type)}
          >
            {EVENT_TYPE_LABEL[type]}
          </FilterChip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink-soft">Jenjang</span>
        {EDUCATION_LEVELS.map((level) => (
          <FilterChip
            key={level}
            href={toggleFilterHref(query, 'levels', level)}
            active={query.levels.includes(level)}
          >
            {EDUCATION_LEVEL_LABEL[level]}
          </FilterChip>
        ))}
      </div>

      {/* 12 kategori sekaligus akan mendominasi layar ponsel. <details> membuat
          daftar panjang bisa dilipat tanpa perlu JavaScript sama sekali. */}
      <details className="group" open={query.categories.length > 0}>
        {/* list-none menghapus segitiga bawaan browser, jadi penandanya harus
            digambar sendiri — tanpa itu baris ini tidak terlihat bisa diklik. */}
        <summary
          className={cn(
            'inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-soft',
            'hover:text-ink',
          )}
        >
          <ChevronDown
            aria-hidden
            className="size-4 transition-transform duration-150 ease-snap group-open:rotate-180"
          />
          Bidang
          <span className="text-ink-faint group-open:hidden">({categories.length} pilihan)</span>
          {query.categories.length > 0 && (
            <span className="rounded-sm bg-brand-soft px-1.5 text-xs text-brand-text">
              {query.categories.length} aktif
            </span>
          )}
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => (
            <FilterChip
              key={category.slug}
              href={toggleFilterHref(query, 'categories', category.slug)}
              active={query.categories.includes(category.slug)}
            >
              {category.name}
            </FilterChip>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm text-ink-muted" role="status" aria-live="polite">
          <strong className="font-semibold text-ink">{resultCount.toLocaleString('id-ID')}</strong>{' '}
          kegiatan ditemukan
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">Urutkan</span>
          {SORT_OPTIONS.map((option) => (
            <FilterChip
              key={option}
              href={buildEventHref(query, { sort: option, page: 1 })}
              active={query.sort === option}
            >
              {SORT_LABEL[option]}
            </FilterChip>
          ))}
          <FilterChip
            href={buildEventHref(query, { includeClosed: !query.includeClosed, page: 1 })}
            active={query.includeClosed}
          >
            Termasuk yang ditutup
          </FilterChip>
          {active && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/events">
                <X aria-hidden /> Reset
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
