/**
 * Recommendation scoring — Blueprint §6.
 *
 *   score(event, user) = 0.5*category_match + 0.3*education_match + 0.2*recency
 *   cold start        = 0.6*recency + 0.4*popularity
 *
 * Blueprint hanya menetapkan BOBOT-nya; definisi tiap komponen dibiarkan
 * terbuka. Definisi yang dipakai di sini dijelaskan per fungsi, dan semuanya
 * dinormalisasi ke rentang 0..1 — kalau salah satu komponen bisa melebihi 1,
 * bobot 0.5/0.3/0.2 kehilangan arti dan satu sinyal diam-diam mendominasi.
 */

import type { EducationLevel, EventSummary, UserProfile } from '@/types/domain';

/** Skor relevansi turun separuh setiap 14 hari. */
const RECENCY_HALF_LIFE_DAYS = 14;
const MS_PER_DAY = 86_400_000;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Peluruhan eksponensial, bukan cliff biner "dalam 7 hari terakhir".
 * Cliff bikin peringkat melompat-lompat tiap tengah malam; peluruhan
 * membuat urutan bergeser halus dan terasa stabil bagi user yang membuka
 * halaman yang sama dua hari berturut-turut.
 */
export function recencyBoost(createdAtIso: string, now: Date = new Date()): number {
  const createdAt = new Date(createdAtIso).getTime();
  if (Number.isNaN(createdAt)) return 0;
  const ageDays = Math.max((now.getTime() - createdAt) / MS_PER_DAY, 0);
  return clamp01(Math.pow(2, -ageDays / RECENCY_HALF_LIFE_DAYS));
}

/** Proporsi minat user yang tersentuh event ini (0..1). */
export function categoryMatch(
  interests: readonly string[],
  eventCategories: readonly string[],
): number {
  if (interests.length === 0) return 0;
  const target = new Set(eventCategories);
  const hits = interests.filter((interest) => target.has(interest)).length;
  return clamp01(hits / interests.length);
}

/**
 * 1.0  jenjang user disebut eksplisit
 * 0.5  event terbuka untuk umum / tidak membatasi jenjang
 *      -> relevan, tapi tidak boleh mengalahkan event yang menyasar
 *         jenjang user secara spesifik
 * 0.0  jenjang user tidak termasuk
 */
export function educationMatch(
  userLevel: EducationLevel | null,
  eventLevels: readonly EducationLevel[],
): number {
  if (eventLevels.length === 0) return 0.5;
  if (!userLevel) return eventLevels.includes('UMUM') ? 0.5 : 0;
  if (eventLevels.includes(userLevel)) return 1;
  return eventLevels.includes('UMUM') ? 0.5 : 0;
}

/**
 * Popularitas dinormalisasi secara logaritmik terhadap event terpopuler di
 * kumpulan kandidat. Tanpa log, satu event viral dengan 2.000 simpanan
 * membuat semua event lain efektif bernilai 0 dan homepage membeku di satu
 * item — rich-get-richer yang mematikan event baru.
 */
export function popularityBoost(savedCount: number, maxSavedCount: number): number {
  if (maxSavedCount <= 0) return 0;
  return clamp01(Math.log1p(Math.max(savedCount, 0)) / Math.log1p(maxSavedCount));
}

/** Profil dianggap kosong kalau minat ATAU jenjang belum diisi (§6). */
export function isColdStart(profile: UserProfile | null): boolean {
  if (!profile) return true;
  return profile.interests.length === 0 || profile.educationLevel === null;
}

export interface ScoredEvent {
  readonly event: EventSummary;
  readonly score: number;
  readonly personalized: boolean;
}

/**
 * Peringkatkan kandidat. Selalu mengembalikan urutan yang bermakna —
 * tidak pernah acak, tidak pernah kosong selama ada kandidat. Homepage
 * kosong untuk user baru adalah kegagalan produk, bukan kasus tepi (§6).
 */
export function rankEvents(
  events: readonly EventSummary[],
  profile: UserProfile | null,
  now: Date = new Date(),
): ScoredEvent[] {
  const coldStart = isColdStart(profile);
  const maxSaved = events.reduce((max, event) => Math.max(max, event.savedCount), 0);

  const scored = events.map((event) => {
    const recency = recencyBoost(event.createdAt, now);
    const score = coldStart
      ? 0.6 * recency + 0.4 * popularityBoost(event.savedCount, maxSaved)
      : 0.5 * categoryMatch(profile?.interests ?? [], event.categorySlugs) +
        0.3 * educationMatch(profile?.educationLevel ?? null, event.educationLevels) +
        0.2 * recency;

    return { event, score: clamp01(score), personalized: !coldStart };
  });

  // Tiebreak deterministik (skor -> terbaru -> id). Tanpa ini urutan item
  // berskor sama bisa berubah antara render server dan client, dan user
  // melihat daftar "berkedip" saat hidrasi.
  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const timeDiff = new Date(b.event.createdAt).getTime() - new Date(a.event.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.event.id.localeCompare(b.event.id);
  });
}
