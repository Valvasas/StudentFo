import {
  EDUCATION_LEVELS,
  EVENT_TYPES,
  SORT_OPTIONS,
  type EducationLevel,
  type EventQuery,
  type EventType,
  type SortOption,
} from '@/types/domain';
import { DEFAULT_PAGE_SIZE } from '@/lib/data/repository';

export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * URL adalah masukan dari pihak yang tidak dipercaya — siapa pun bisa
 * mengetik apa pun di address bar. Aturan yang dipegang: nilai tak dikenal
 * DIBUANG, bukan bikin error. Halaman hasil filter yang link-nya dioper
 * lewat WhatsApp lalu terpotong tidak boleh menampilkan layar error.
 */
function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : value.split(',');
  return raw.map((item) => item.trim()).filter(Boolean);
}

function pickAllowed<T extends string>(values: string[], allowed: readonly T[]): T[] {
  const allowSet = new Set<string>(allowed);
  // Set: buang duplikat supaya `?type=LOMBA&type=LOMBA` tidak menggandakan filter.
  return [...new Set(values.filter((value): value is T => allowSet.has(value)))];
}

function toPositiveInt(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface ParsedEventQuery extends EventQuery {
  readonly search: string;
  readonly types: readonly EventType[];
  readonly categories: readonly string[];
  readonly levels: readonly EducationLevel[];
  readonly sort: SortOption;
  readonly includeClosed: boolean;
  readonly page: number;
  readonly pageSize: number;
}

export function parseEventQuery(params: RawSearchParams): ParsedEventQuery {
  const rawSearch = Array.isArray(params.q) ? params.q[0] : params.q;
  const sortCandidate = Array.isArray(params.sort) ? params.sort[0] : params.sort;

  return {
    // Batasi panjang: mencegah URL raksasa dipakai sebagai vektor DoS pencarian.
    search: (rawSearch ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    types: pickAllowed(toArray(params.type), EVENT_TYPES),
    categories: toArray(params.kategori)
      .filter((slug) => /^[a-z0-9-]{1,50}$/.test(slug))
      .slice(0, 12),
    levels: pickAllowed(toArray(params.jenjang), EDUCATION_LEVELS),
    sort: SORT_OPTIONS.includes(sortCandidate as SortOption)
      ? (sortCandidate as SortOption)
      : 'relevance',
    includeClosed: params.tampilkan === 'semua',
    page: toPositiveInt(params.page, 1),
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

/** Bangun ulang URL kanonik dari query — dipakai filter, paginasi, dan SEO. */
export function buildEventHref(
  query: Partial<ParsedEventQuery>,
  overrides: Partial<ParsedEventQuery> = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();

  if (merged.search) params.set('q', merged.search);
  for (const type of merged.types ?? []) params.append('type', type);
  for (const category of merged.categories ?? []) params.append('kategori', category);
  for (const level of merged.levels ?? []) params.append('jenjang', level);
  if (merged.sort && merged.sort !== 'relevance') params.set('sort', merged.sort);
  if (merged.includeClosed) params.set('tampilkan', 'semua');
  if (merged.page && merged.page > 1) params.set('page', String(merged.page));

  const queryString = params.toString();
  return queryString ? `/events?${queryString}` : '/events';
}

/** Toggle satu nilai filter; mereset halaman ke 1 karena hasilnya berubah. */
export function toggleFilterHref(
  query: ParsedEventQuery,
  key: 'types' | 'categories' | 'levels',
  value: string,
): string {
  const current = query[key] as readonly string[];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];

  return buildEventHref(query, { [key]: next, page: 1 } as Partial<ParsedEventQuery>);
}

export function hasActiveFilters(query: ParsedEventQuery): boolean {
  return (
    query.search.length > 0 ||
    query.types.length > 0 ||
    query.categories.length > 0 ||
    query.levels.length > 0 ||
    query.includeClosed
  );
}
