import type { MediaImportJob, MediaImportSummary } from '@/lib/data/repository';

/**
 * Bentuk baris & ringkasan impor media (ADR-095) yang dipakai KEDUA
 * repository — aturan hitungnya tidak boleh ditulis dua kali.
 */

export interface MediaImportRow {
  readonly id: string;
  readonly event_id: string;
  readonly position: number;
  readonly kind: string;
  readonly source_url: string | null;
  readonly spec: unknown;
  readonly caption: string | null;
  readonly is_poster: boolean;
  readonly attempts: number;
}

export interface MediaImportStatusRow {
  readonly event_id: string;
  readonly status: string;
  readonly error_code: string | null;
  readonly position: number;
}

export function toMediaImportJob(row: MediaImportRow): MediaImportJob {
  return {
    id: row.id,
    eventId: row.event_id,
    position: row.position,
    kind: row.kind === 'URL' ? 'URL' : 'GENERATED',
    sourceUrl: row.source_url,
    spec: row.spec,
    caption: row.caption,
    isPoster: row.is_poster,
    attempts: row.attempts,
  };
}

export const EMPTY_MEDIA_IMPORTS: MediaImportSummary = { pending: 0, done: 0, failed: 0, lastError: null };

export function summarizeMediaImports(rows: readonly MediaImportStatusRow[]): MediaImportSummary {
  let pending = 0;
  let done = 0;
  let failed = 0;
  let lastError: string | null = null;
  let lastErrorPosition = -1;
  for (const row of rows) {
    if (row.status === 'DONE') done += 1;
    else if (row.status === 'FAILED') {
      failed += 1;
      if (row.position > lastErrorPosition) {
        lastErrorPosition = row.position;
        lastError = row.error_code;
      }
    } else pending += 1;
  }
  return { pending, done, failed, lastError };
}

/** Teks manusiawi untuk kode galat yang ditulis pemroses — tampil di kartu antrean admin. */
export const MEDIA_IMPORT_ERROR_TEXT: Record<string, string> = {
  url_blocked: 'Tautan tidak boleh diunduh (bukan https publik).',
  fetch_failed: 'Situs sumber tidak bisa dihubungi.',
  not_found: 'Gambar/laman sumber tidak ditemukan (404).',
  too_large: 'Gambar sumber lebih dari 5 MB.',
  too_small: 'Gambar dari laman sumber terlalu kecil (kemungkinan logo situs, bukan poster).',
  not_image: 'Isi tautan bukan gambar JPEG/PNG/WebP.',
  no_page_image: 'Laman sumber tidak punya gambar pratinjau (og:image).',
  spec_invalid: 'Isi slide buatan tidak sah.',
  render_failed: 'Slide gagal digambar.',
  storage_failed: 'Penyimpanan gambar gagal.',
  gallery_full: 'Galeri kegiatan sudah penuh (30 gambar).',
  event_closed: 'Kegiatan sudah ditolak, gambar tidak disiapkan.',
  event_not_found: 'Kegiatan sudah tidak ada.',
};

export function mediaImportErrorText(code: string | null): string | null {
  if (!code) return null;
  return MEDIA_IMPORT_ERROR_TEXT[code] ?? 'Gagal menyiapkan gambar.';
}

/** Templat buatan server — HARUS sama dengan daftar di `stage_event_media()` (dikunci tes). */
const TEMPLATES = new Set(['poster', 'syarat', 'jadwal', 'cara-daftar']);
const HTTPS_URL = /^https:\/\/\S+$/i;
export const MEDIA_IMPORT_MAX_POSITION = 7;

export interface NormalizedMediaImport {
  readonly kind: 'URL' | 'GENERATED';
  readonly sourceUrl: string | null;
  readonly spec: Record<string, unknown> | null;
  readonly caption: string | null;
  readonly isPoster: boolean;
}

/** Cermin daftar bawaan `stage_event_media(…, NULL)`. */
export function defaultMediaImports(sourceUrl: string): unknown[] {
  return [
    { url: sourceUrl, is_poster: true, caption: 'Gambar dari laman resmi penyelenggara' },
    { spec: { template: 'poster' }, is_poster: true },
    { spec: { template: 'syarat' } },
    { spec: { template: 'jadwal' } },
    { spec: { template: 'cara-daftar' } },
  ];
}

/**
 * Cermin aturan `stage_event_media()` untuk mode seed: bukan array = daftar
 * bawaan, entri cacat dilewati, posisi diteruskan dari `nextPosition`, maks. 8.
 */
export function normalizeMediaImports(media: unknown, sourceUrl: string, nextPosition: number): NormalizedMediaImport[] {
  const list = Array.isArray(media) ? media : defaultMediaImports(sourceUrl);
  const out: NormalizedMediaImport[] = [];
  for (const item of list) {
    if (nextPosition + out.length > MEDIA_IMPORT_MAX_POSITION) break;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const url = typeof entry.url === 'string' ? entry.url.trim() : null;
    const spec = typeof entry.spec === 'object' && entry.spec !== null && !Array.isArray(entry.spec) ? (entry.spec as Record<string, unknown>) : null;
    const caption =
      typeof entry.caption === 'string'
        ? entry.caption.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 140) || null
        : null;
    const isPoster = entry.is_poster === true;
    if (url && HTTPS_URL.test(url) && url.length <= 2000) {
      out.push({ kind: 'URL', sourceUrl: url, spec: null, caption, isPoster });
    } else if (spec && typeof spec.template === 'string' && TEMPLATES.has(spec.template) && JSON.stringify(spec).length <= 8192) {
      out.push({ kind: 'GENERATED', sourceUrl: null, spec, caption, isPoster });
    }
  }
  return out;
}
