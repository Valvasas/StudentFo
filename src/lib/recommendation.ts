/**
 * Recommendation scoring — Blueprint §6, direvisi (DECISION.md ADR-026).
 *
 *   personal   = 0.45*category + 0.25*education + 0.15*deadline_fit + 0.15*recency
 *   cold start = 0.45*recency  + 0.30*popularity + 0.25*deadline_fit
 *
 * Revisi dari bobot blueprint (0.5/0.3/0.2 dan 0.6/0.4): blueprint tidak
 * punya sinyal tenggat sama sekali, padahal nilai utama produk ini adalah
 * "jangan sampai terlewat". Tanpa itu, kegiatan yang tutup lusa bisa kalah
 * dari kegiatan baru yang tutup tiga bulan lagi.
 *
 * Blueprint hanya menetapkan BOBOT-nya; definisi tiap komponen dibiarkan
 * terbuka. Definisi yang dipakai di sini dijelaskan per fungsi, dan semuanya
 * dinormalisasi ke rentang 0..1 — kalau salah satu komponen bisa melebihi 1,
 * bobot 0.5/0.3/0.2 kehilangan arti dan satu sinyal diam-diam mendominasi.
 */

import { daysUntil } from '@/lib/deadline';
import type { EducationLevel, EventSummary, UserProfile } from '@/types/domain';

export const PERSONAL_WEIGHTS = { category: 0.45, education: 0.25, deadline: 0.15, recency: 0.15 } as const;
export const COLD_START_WEIGHTS = { recency: 0.45, popularity: 0.3, deadline: 0.25 } as const;

/** Jendela "masih sempat, tapi jangan ditunda": nilai penuh. */
const DEADLINE_SWEET_SPOT_DAYS = 14;
/** Di luar jendela, nilai turun separuh setiap 14 hari. */
const DEADLINE_HALF_LIFE_DAYS = 14;

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
/**
 * Seberapa "tepat waktu" sebuah kegiatan untuk dikerjakan sekarang.
 *
 *   ditutup (< 0)  -> 0     tidak bisa ditindaklanjuti
 *   hari-H (0)     -> 0.6   sering sudah tak sempat menyiapkan berkas; tetap
 *                           terlihat, tapi tidak memimpin (selaras dengan
 *                           keputusan tanpa notifikasi H-0, lib/notifications)
 *   1..14 hari     -> 1     masih sempat dan tidak boleh ditunda
 *   > 14 hari      -> 2^-((n-14)/14)   28 hari = 0.5, 42 hari = 0.25
 *   tanpa tenggat  -> 0.3   netral-rendah: tidak dihukum, tidak diangkat
 *
 * Hari dihitung kalender Asia/Jakarta (daysUntil), sama dengan label H-n
 * yang dilihat pengguna — skor dan label tidak boleh berbeda pendapat.
 */
export function deadlineFit(deadlineIso: string | null, now: Date = new Date()): number {
  if (!deadlineIso) return 0.3;
  const daysLeft = daysUntil(deadlineIso, now);
  if (daysLeft === null) return 0.3;
  if (daysLeft < 0) return 0;
  if (daysLeft === 0) return 0.6;
  if (daysLeft <= DEADLINE_SWEET_SPOT_DAYS) return 1;
  return clamp01(Math.pow(2, -(daysLeft - DEADLINE_SWEET_SPOT_DAYS) / DEADLINE_HALF_LIFE_DAYS));
}

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
    const deadline = deadlineFit(event.primaryDeadlineAt, now);
    const score = coldStart
      ? COLD_START_WEIGHTS.recency * recency +
        COLD_START_WEIGHTS.popularity * popularityBoost(event.savedCount, maxSaved) +
        COLD_START_WEIGHTS.deadline * deadline
      : PERSONAL_WEIGHTS.category * categoryMatch(profile?.interests ?? [], event.categorySlugs) +
        PERSONAL_WEIGHTS.education *
          educationMatch(profile?.educationLevel ?? null, event.educationLevels) +
        PERSONAL_WEIGHTS.deadline * deadline +
        PERSONAL_WEIGHTS.recency * recency;

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
