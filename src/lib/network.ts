import { z } from 'zod';
import type { Connection, ConnectionStatus, EducationLevel, NetworkEventRef, NetworkPerson, PeopleSuggestion } from '@/types/domain';
import { CONNECTION_STATUSES, EDUCATION_LEVEL_LABEL } from '@/types/domain';
import { daysUntil } from './deadline';

/**
 * Logika murni fitur Koneksi (ADR-040), dipakai KEDUA repository supaya
 * urutan saran di mode seed identik dengan produksi — pola yang sama dengan
 * `listing.ts`.
 */

export const NETWORK_LIMITS = {
  headlineMax: 140,
  messageMax: 280,
  /** Saran yang ditampilkan di halaman. */
  suggestionLimit: 24,
  /**
   * Jendela kandidat yang dibaca dari direktori sebelum diperingkat di
   * aplikasi (ADR-021: peringkat atas jendela, bukan seluruh tabel). Direktori
   * 100k orang tetap hanya memindahkan 200 baris per kunjungan.
   */
  candidateWindow: 200,
} as const;

/**
 * Batas permintaan koneksi baru per pengguna per 24 jam. HARUS sama dengan
 * trigger `enforce_connection_rate_limit()` di migration 20260927100001 —
 * ubah keduanya bersamaan. Menahan penyebar ajakan massal tanpa mengganggu
 * orang yang sedang aktif membangun jaringan.
 */
export const CONNECTION_RATE_LIMIT = { perDay: 30 } as const;

/**
 * Paginasi `listConnections` (ADR-041). `maxLimit + 1` (satu baris penanda
 * "masih ada") harus ≤ `max_rows` PostgREST (1000), kalau tidak baris
 * penanda terpotong diam-diam dan halaman terakhir tampak lengkap.
 */
export const CONNECTION_PAGE = { size: 50, maxLimit: 500 } as const;

/**
 * Daftar blokir tidak dipaginasi: blokir adalah tindakan langka dan daftar
 * ratusan orang sudah jauh di luar pemakaian wajar. Di bawah `max_rows`.
 */
export const BLOCK_LIST_LIMIT = 500;

export interface ConnectionPageRequest {
  readonly limit: number;
  /** `nextCursor` dari halaman sebelumnya; null = halaman pertama. */
  readonly cursor: string | null;
}

export interface ConnectionCursor {
  readonly status: ConnectionStatus;
  readonly createdAt: string;
  readonly id: string;
}

export function clampConnectionLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit) || 1, 1), CONNECTION_PAGE.maxLimit);
}

/**
 * Urutan total & stabil yang dipakai kursor keyset di KEDUA repository:
 * ajakan menunggu dulu ('PENDING' > 'ACCEPTED'), lalu terbaru, lalu id.
 * Ajakan masuk yang lama tidak pernah terdorong ke halaman belakang oleh
 * koneksi yang lebih baru. Id dibandingkan sebagai string huruf kecil —
 * sama dengan urutan byte `uuid` di Postgres.
 */
export function compareConnections(a: ConnectionCursor, b: ConnectionCursor): number {
  if (a.status !== b.status) return a.status < b.status ? 1 : -1;
  const time = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (time !== 0) return time;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function connectionCursorOf(connection: Pick<Connection, 'status' | 'createdAt' | 'id'>): ConnectionCursor {
  return { status: connection.status, createdAt: connection.createdAt, id: connection.id };
}

export function encodeConnectionCursor(cursor: ConnectionCursor): string {
  return btoa(JSON.stringify([cursor.status, cursor.createdAt, cursor.id]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const CURSOR_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Kursor datang dari luar (URL/klien) dan nilainya dirakit ke filter
 * PostgREST — jadi setiap bagian divalidasi ketat, bukan sekadar di-parse.
 * Tidak valid = null; pemanggil yang memutuskan (repository menolaknya).
 */
export function decodeConnectionCursor(raw: string): ConnectionCursor | null {
  if (raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const parsed: unknown = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [status, createdAt, id] = parsed as unknown[];
    if (!CONNECTION_STATUSES.includes(status as ConnectionStatus)) return null;
    if (typeof createdAt !== 'string' || !CURSOR_TIMESTAMP.test(createdAt) || Number.isNaN(Date.parse(createdAt))) return null;
    if (typeof id !== 'string' || !CURSOR_ID.test(id)) return null;
    return { status: status as ConnectionStatus, createdAt, id };
  } catch {
    return null;
  }
}

const WEIGHTS = {
  sharedInterest: 3,
  maxSharedInterests: 3,
  mutual: 2,
  maxMutual: 5,
  sharedEvent: 4,
  maxSharedEvents: 2,
  sameMajor: 2,
  sameLevel: 1,
} as const;

export interface NetworkViewer {
  readonly id: string;
  readonly fullName: string;
  readonly educationLevel: EducationLevel | null;
  readonly major: string | null;
  readonly interests: readonly string[];
}

export interface SuggestionCandidate {
  readonly person: NetworkPerson;
  readonly mutualCount: number;
  readonly sharedEvents: readonly NetworkEventRef[];
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Semua kata kunci harus muncul di nama, jurusan, atau headline. */
export function matchesPeopleSearch(person: NetworkPerson, search: string): boolean {
  const terms = normalizeText(search).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeText(`${person.fullName} ${person.major ?? ''} ${person.headline ?? ''}`);
  return terms.every((term) => haystack.includes(term));
}

export function scoreSuggestion(viewer: NetworkViewer, candidate: SuggestionCandidate): PeopleSuggestion {
  const { person } = candidate;
  const sharedInterests = person.interests.filter((slug) => viewer.interests.includes(slug));
  const sameMajor = Boolean(viewer.major && person.major && normalizeText(viewer.major) === normalizeText(person.major));
  const sameLevel = Boolean(viewer.educationLevel && viewer.educationLevel === person.educationLevel);

  const score =
    Math.min(sharedInterests.length, WEIGHTS.maxSharedInterests) * WEIGHTS.sharedInterest +
    Math.min(candidate.mutualCount, WEIGHTS.maxMutual) * WEIGHTS.mutual +
    Math.min(candidate.sharedEvents.length, WEIGHTS.maxSharedEvents) * WEIGHTS.sharedEvent +
    (sameMajor ? WEIGHTS.sameMajor : 0) +
    (sameLevel ? WEIGHTS.sameLevel : 0);

  return {
    person,
    score,
    sharedInterests,
    mutualCount: candidate.mutualCount,
    sharedEvents: candidate.sharedEvents,
    sameMajor,
    sameLevel,
  };
}

/**
 * Urutan saran: skor tertinggi dulu, lalu nama (stabil, bisa diuji). Diri
 * sendiri selalu dibuang di sini juga — pengaman kedua kalau kueri
 * pemanggil lupa mengecualikannya.
 */
export function rankSuggestions(
  viewer: NetworkViewer,
  candidates: readonly SuggestionCandidate[],
  limit: number = NETWORK_LIMITS.suggestionLimit,
): PeopleSuggestion[] {
  return candidates
    .filter((candidate) => candidate.person.userId !== viewer.id)
    .map((candidate) => scoreSuggestion(viewer, candidate))
    .sort((a, b) => b.score - a.score || a.person.fullName.localeCompare(b.person.fullName, 'id'))
    .slice(0, limit);
}

/** Alasan yang dibaca manusia, urut dari yang paling kuat. Maksimal tiga supaya kartu tetap bisa dipindai. */
export function suggestionReasons(
  suggestion: PeopleSuggestion,
  categoryName: (slug: string) => string,
): string[] {
  const reasons: string[] = [];
  const [firstEvent] = suggestion.sharedEvents;
  if (firstEvent) reasons.push(`Ikut tim di ${firstEvent.title}`);
  if (suggestion.mutualCount > 0) reasons.push(`${suggestion.mutualCount} koneksi bersama`);
  if (suggestion.sharedInterests.length > 0) {
    const names = suggestion.sharedInterests.slice(0, 2).map(categoryName);
    const rest = suggestion.sharedInterests.length - names.length;
    reasons.push(`Minat sama: ${names.join(', ')}${rest > 0 ? ` +${rest}` : ''}`);
  }
  if (suggestion.sameMajor) reasons.push('Jurusan sama');
  else if (suggestion.sameLevel && suggestion.person.educationLevel) {
    reasons.push(`Sama-sama ${EDUCATION_LEVEL_LABEL[suggestion.person.educationLevel]}`);
  }
  return reasons.slice(0, 3);
}

export function personMeta(person: Pick<NetworkPerson, 'major' | 'educationLevel'>): string {
  return [person.major, person.educationLevel ? EDUCATION_LEVEL_LABEL[person.educationLevel] : null]
    .filter(Boolean)
    .join(' · ');
}

/** "hari ini" / "kemarin" / "3 hari lalu" / "2 minggu lalu" — per hari kalender WIB, sama dengan tenggat. */
export function daysAgoLabel(iso: string, now: Date = new Date()): string {
  const diff = daysUntil(iso, now);
  if (diff === null) return '';
  const days = Math.max(-diff, 0);
  if (days === 0) return 'hari ini';
  if (days === 1) return 'kemarin';
  if (days < 14) return `${days} hari lalu`;
  if (days < 60) return `${Math.floor(days / 7)} minggu lalu`;
  return `${Math.floor(days / 30)} bulan lalu`;
}

const optionalText = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max))
    .transform((value) => (value === '' ? null : value));

export const networkProfileSchema = z.object({
  discoverable: z.boolean(),
  headline: optionalText(NETWORK_LIMITS.headlineMax),
});
export type NetworkProfileInput = z.infer<typeof networkProfileSchema>;

export const connectionMessageSchema = optionalText(NETWORK_LIMITS.messageMax);

export function parseNetworkProfileForm(formData: FormData) {
  const headline = formData.get('headline');
  return networkProfileSchema.safeParse({
    discoverable: formData.get('discoverable') === 'on',
    headline: typeof headline === 'string' ? headline : '',
  });
}

export function parseConnectionMessage(raw: string) {
  return connectionMessageSchema.safeParse(raw);
}
