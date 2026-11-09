import 'server-only';
import { INSTITUTION_ROWS, INSTITUTION_SOURCE as SOURCE } from '@/data/institutions';
import { INSTITUTION_ID, INSTITUTION_KINDS, isCampusKind, type InstitutionHit, type InstitutionKind } from '@/lib/institution-kinds';
import { regionLabel } from '@/lib/wilayah';

/**
 * Direktori tempat studi (ADR-076): ±45 ribu SMA/SMK/MA/SLB dan perguruan
 * tinggi dari Data Referensi Kemendikdasmen, dibekukan di repo oleh
 * `scripts/import-institutions.mjs`. Server saja — peramban mencari lewat
 * `/api/institusi`, tidak pernah menerima seluruh daftar.
 *
 * Pencarian linear atas token yang dihitung sekali per proses: ±45 ribu
 * baris × beberapa token = beberapa milidetik, tanpa indeks/dependensi.
 */

interface Entry {
  readonly hit: InstitutionHit;
  readonly tokens: readonly string[];
  readonly normalizedName: string;
  readonly normalizedShort: string | null;
}

export const INSTITUTION_SOURCE: string = SOURCE;
export const INSTITUTION_SEARCH_LIMIT = 12;
export const INSTITUTION_QUERY_MAX = 80;

export function normalizeQuery(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Bentuk lain yang diketik orang untuk nama yang sama: "SMAN 1" = "SMA
 * Negeri 1" = "SMA N 1"; "UIN" = "Universitas Islam Negeri". Hanya untuk
 * pencocokan — yang tampil tetap nama resmi.
 */
const EXPANSIONS: readonly (readonly [RegExp, string])[] = [
  [/^sman\b/, 'sma negeri sma n'],
  [/^smas\b/, 'sma swasta'],
  [/^smkn\b/, 'smk negeri smk n'],
  [/^smks\b/, 'smk swasta'],
  [/^man\b/, 'ma negeri ma n madrasah aliyah'],
  [/^mas\b/, 'ma swasta madrasah aliyah'],
  [/^ma\b/, 'madrasah aliyah'],
  [/^slbn\b/, 'slb negeri'],
  [/^universitas islam negeri\b/, 'uin'],
  [/^institut agama islam negeri\b/, 'iain'],
  [/^sekolah tinggi agama islam negeri\b/, 'stain'],
];

/** Inisial kata bermakna — "Universitas Bina Nusantara" juga ditemukan dengan "ubn". */
function initials(normalized: string): string {
  return normalized
    .split(' ')
    .filter((word) => word && !['dan', 'di', 'of', 'the'].includes(word) && !/^\d+$/.test(word))
    .map((word) => word[0])
    .join('');
}

function isKind(value: string): value is InstitutionKind {
  return (INSTITUTION_KINDS as readonly string[]).includes(value);
}

let cache: { entries: readonly Entry[]; byId: ReadonlyMap<string, Entry> } | null = null;

function index() {
  if (cache) return cache;
  const entries: Entry[] = [];
  for (const line of INSTITUTION_ROWS.split('\n')) {
    const [id = '', name = '', kind = '', negeri, regionCode, short] = line.split('\t');
    if (!id || !name || !isKind(kind)) continue;
    const normalizedName = normalizeQuery(name);
    const extra = EXPANSIONS.flatMap(([pattern, words]) => (pattern.test(normalizedName) ? [words] : []));
    const normalizedShort = short ? normalizeQuery(short) : null;
    const tokens = [...new Set(`${normalizedName} ${extra.join(' ')} ${normalizedShort ?? ''} ${initials(normalizedName)}`.split(' ').filter(Boolean))];
    entries.push({
      hit: { id, name, short: short || null, kind, negeri: negeri === '1', region: regionLabel(regionCode || null) },
      tokens,
      normalizedName,
      normalizedShort,
    });
  }
  cache = { entries, byId: new Map(entries.map((entry) => [entry.hit.id, entry])) };
  return cache;
}

export type InstitutionScope = 'semua' | 'kampus' | 'sekolah';

export function parseInstitutionScope(value: unknown): InstitutionScope {
  return value === 'kampus' || value === 'sekolah' ? value : 'semua';
}

function score(entry: Entry, query: string, words: readonly string[]): number {
  if (!words.every((word) => entry.tokens.some((token) => token.startsWith(word)))) return 0;
  let value = 10;
  if (entry.normalizedShort === query) value += 100;
  if (entry.normalizedName === query) value += 80;
  else if (entry.normalizedName.startsWith(query)) value += 40;
  if (isCampusKind(entry.hit.kind)) value += 3;
  if (entry.hit.negeri) value += 1;
  // Nama pendek lebih dulu di antara yang sama-sama cocok ("UI" sebelum "UI… Cabang …").
  return value - entry.hit.name.length / 200;
}

export function searchInstitutions(rawQuery: string, scope: InstitutionScope = 'semua', limit = INSTITUTION_SEARCH_LIMIT): readonly InstitutionHit[] {
  const query = normalizeQuery(rawQuery.slice(0, INSTITUTION_QUERY_MAX));
  if (query.length < 2) return [];
  const words = query.split(' ');
  const ranked: { entry: Entry; value: number }[] = [];
  for (const entry of index().entries) {
    if (scope === 'kampus' && !isCampusKind(entry.hit.kind)) continue;
    if (scope === 'sekolah' && isCampusKind(entry.hit.kind)) continue;
    const value = score(entry, query, words);
    if (value > 0) ranked.push({ entry, value });
  }
  return ranked
    .sort((a, b) => b.value - a.value || a.entry.hit.name.localeCompare(b.entry.hit.name, 'id'))
    .slice(0, limit)
    .map(({ entry }) => entry.hit);
}

export function institutionById(id: string): InstitutionHit | null {
  if (!INSTITUTION_ID.test(id)) return null;
  return index().byId.get(id)?.hit ?? null;
}

export function institutionCount(): number {
  return index().entries.length;
}
