import Link from 'next/link';
import { ArrowDownUp, Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  buildEventHref,
  costParam,
  toggleFilterHref,
  type ParsedEventQuery,
} from '@/lib/search-params';
import {
  COST_FILTERS,
  type CostFilter,
  EDUCATION_LEVELS,
  EDUCATION_LEVEL_LABEL,
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  SORT_OPTIONS,
  type Category,
} from '@/types/domain';

const COST_LABEL: Record<CostFilter, string> = {
  free: 'Gratis',
  paid: 'Berbayar',
};

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
        // Tampil 36px, area sentuh 44px lewat ::after (standar proyek).
        "relative inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-pill border px-3.5 text-sm transition-colors duration-150 ease-snap after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
        active
          ? 'border-brand bg-brand font-medium text-on-brand'
          : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </Link>
  );
}

/** Field tersembunyi supaya filter aktif tidak hilang saat form dikirim. */
export function HiddenFilters({ query, omit = [] }: { query: ParsedEventQuery; omit?: readonly string[] }) {
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
      {query.locations.map((value) => (
        <input key={`k-${value}`} type="hidden" name="lokasi" value={value} />
      ))}
      {query.mode && !omit.includes('mode') && <input type="hidden" name="mode" value={query.mode === 'online' ? 'daring' : 'luring'} />}
      {query.sort !== 'relevance' && <input type="hidden" name="sort" value={query.sort} />}
      {query.includeClosed && <input type="hidden" name="tampilkan" value="semua" />}
      {query.cost && <input type="hidden" name="biaya" value={costParam(query.cost)} />}
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

interface ActiveFilter {
  readonly key: string;
  readonly label: string;
  readonly href: string;
}

/** Setiap filter yang terpasang sebagai chip "hapus" — supaya panel boleh tertutup tanpa menyembunyikan apa yang aktif. */
function activeFilters(query: ParsedEventQuery, categories: readonly Category[]): ActiveFilter[] {
  const without = (overrides: Partial<ParsedEventQuery>) => buildEventHref(query, { ...overrides, page: 1 });
  return [
    ...(query.search ? [{ key: 'q', label: `“${query.search}”`, href: without({ search: '' }) }] : []),
    ...query.types.map((type) => ({ key: `t-${type}`, label: EVENT_TYPE_LABEL[type], href: toggleFilterHref(query, 'types', type) })),
    ...query.levels.map((level) => ({ key: `l-${level}`, label: EDUCATION_LEVEL_LABEL[level], href: toggleFilterHref(query, 'levels', level) })),
    ...query.categories.map((slug) => ({
      key: `c-${slug}`,
      label: categories.find((category) => category.slug === slug)?.name ?? slug,
      href: toggleFilterHref(query, 'categories', slug),
    })),
    ...query.locations.map((location) => ({
      key: `k-${location}`,
      label: location,
      href: without({ locations: query.locations.filter((item) => item !== location) }),
    })),
    ...(query.mode ? [{ key: 'mode', label: query.mode === 'online' ? 'Daring' : 'Luring', href: without({ mode: undefined }) }] : []),
    ...(query.cost ? [{ key: 'cost', label: COST_LABEL[query.cost], href: without({ cost: undefined }) }] : []),
    ...(query.includeClosed ? [{ key: 'closed', label: 'Termasuk yang ditutup', href: without({ includeClosed: false }) }] : []),
  ];
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2.5">
      <span className="text-[13px] font-semibold text-ink-soft">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * Panel filter (ADR-052: dilipat).
 *
 * Sebelumnya semua chip (7 jenis, 6 jenjang, 2 biaya, 12 bidang, 3 urutan)
 * tampil sekaligus: di ponsel hasil pertama baru muncul setelah dua layar
 * gulir. Sekarang: kotak pencarian + tombol "Saring" + menu "Urutkan", dan
 * filter yang aktif tampil sebagai chip yang bisa dihapus — jadi panel boleh
 * tertutup tanpa menyembunyikan apa pun yang sedang memengaruhi hasil.
 *
 * Tetap TANPA state klien (AGENTS.md #9): <details> asli. Dengan JavaScript,
 * navigasi Next.js mempertahankan elemen yang sama sehingga panel tetap
 * terbuka saat memilih beberapa filter berturut-turut; tanpa JavaScript ia
 * tertutup setelah tiap pilihan — fallback yang masih bekerja.
 */
export function FilterBar({
  query,
  categories,
  resultCount,
}: {
  query: ParsedEventQuery;
  categories: readonly Category[];
  resultCount: number;
}) {
  const chips = activeFilters(query, categories);
  // Kata kunci tidak dihitung di lencana "Saring": ia sudah terlihat di kotak pencarian.
  const panelCount = chips.filter((chip) => chip.key !== 'q').length;

  return (
    <section aria-label="Filter kegiatan" className="flex flex-col gap-4">
      <SearchForm query={query} />

      <div className="relative">
        <details className="group/saring">
          <summary
            className={cn(
              'inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-card border px-4 text-sm font-semibold transition-colors duration-150 ease-snap [&::-webkit-details-marker]:hidden',
              panelCount > 0 ? 'border-brand bg-brand text-on-brand' : 'border-line bg-panel hover:border-line-strong',
            )}
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            Saring
            {panelCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-highlight px-1.5 text-xs font-bold text-[#1d1b17]">
                {panelCount}
                <span className="sr-only"> aktif</span>
              </span>
            )}
            <ChevronDown aria-hidden className="size-4 transition-transform duration-150 ease-snap group-open/saring:rotate-180" />
          </summary>

          <div className="mt-3 grid gap-6 rounded-panel border border-line bg-panel p-5 shadow-raised sm:p-6 lg:grid-cols-2">
            <FilterGroup label="Jenis">
              {EVENT_TYPES.map((type) => (
                <FilterChip key={type} href={toggleFilterHref(query, 'types', type)} active={query.types.includes(type)}>
                  {EVENT_TYPE_LABEL[type]}
                </FilterChip>
              ))}
            </FilterGroup>
            <FilterGroup label="Jenjang">
              {EDUCATION_LEVELS.map((level) => (
                <FilterChip key={level} href={toggleFilterHref(query, 'levels', level)} active={query.levels.includes(level)}>
                  {EDUCATION_LEVEL_LABEL[level]}
                </FilterChip>
              ))}
            </FilterGroup>
            {/* Satu pilihan saja (bukan multi seperti jenjang): "gratis ATAU
                berbayar" sama dengan tanpa saringan. Kegiatan yang biayanya belum
                diketahui sengaja tidak masuk keduanya — lihat matchesCost(). */}
            <FilterGroup label="Biaya">
              {COST_FILTERS.map((cost) => (
                <FilterChip
                  key={cost}
                  href={buildEventHref(query, { cost: query.cost === cost ? undefined : cost, page: 1 })}
                  active={query.cost === cost}
                >
                  {COST_LABEL[cost]}
                </FilterChip>
              ))}
            </FilterGroup>
            <FilterGroup label="Status">
              <FilterChip href={buildEventHref(query, { includeClosed: !query.includeClosed, page: 1 })} active={query.includeClosed}>
                Tampilkan yang ditutup
              </FilterChip>
            </FilterGroup>
            <div className="lg:col-span-2">
              <FilterGroup label="Bidang">
                {categories.map((category) => (
                  <FilterChip
                    key={category.slug}
                    href={toggleFilterHref(query, 'categories', category.slug)}
                    active={query.categories.includes(category.slug)}
                  >
                    {category.name}
                  </FilterChip>
                ))}
              </FilterGroup>
            </div>
          </div>
        </details>

        <SortMenu query={query} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-1 text-sm text-ink-muted" role="status" aria-live="polite">
          <strong className="font-semibold text-ink">{resultCount.toLocaleString('id-ID')}</strong> kegiatan ditemukan
        </p>
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            scroll={false}
            aria-label={`Hapus filter ${chip.label}`}
            className="relative inline-flex h-8 items-center gap-1.5 rounded-pill bg-brand-soft pl-3 pr-2 text-[13px] font-medium text-ink transition-colors duration-150 ease-snap after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] hover:bg-line"
          >
            {chip.label}
            <X aria-hidden className="size-3.5 text-ink-muted" />
          </Link>
        ))}
        {chips.length > 1 && (
          <Link href="/events" className="inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
            Hapus semua
          </Link>
        )}
      </div>
    </section>
  );
}

/** Menu urutan: tiga tautan di balik satu tombol, melayang di kanan baris "Saring". */
function SortMenu({ query }: { query: ParsedEventQuery }) {
  return (
    <details className="group/urut absolute right-0 top-0">
      <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-card px-3 text-sm font-medium text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink [&::-webkit-details-marker]:hidden">
        <ArrowDownUp aria-hidden className="size-4" />
        <span className="sr-only">Urutkan: </span>
        {SORT_LABEL[query.sort]}
        <ChevronDown aria-hidden className="size-4 transition-transform duration-150 ease-snap group-open/urut:rotate-180" />
      </summary>
      <ul className="pop absolute right-0 z-30 mt-2 flex w-56 flex-col rounded-modal border border-line bg-panel p-1.5 shadow-overlay">
        {SORT_OPTIONS.map((option) => (
          <li key={option}>
            <Link
              href={buildEventHref(query, { sort: option, page: 1 })}
              scroll={false}
              aria-current={query.sort === option ? 'true' : undefined}
              className={cn(
                'flex min-h-11 items-center justify-between rounded-[10px] px-3 text-sm transition-colors duration-150 ease-snap hover:bg-panel-nested',
                query.sort === option ? 'font-semibold text-ink' : 'text-ink-soft',
              )}
            >
              {SORT_LABEL[option]}
              {query.sort === option && <Check aria-hidden className="size-4" />}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
