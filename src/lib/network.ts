import { z } from 'zod';
import type { EducationLevel, NetworkEventRef, NetworkPerson, PeopleSuggestion } from '@/types/domain';
import { EDUCATION_LEVEL_LABEL } from '@/types/domain';
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
