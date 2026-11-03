import type { RawSearchParams } from '@/lib/search-params';
import { EDUCATION_LEVEL_LABEL, type EducationLevel, type EventSummary } from '@/types/domain';

export const ELIGIBILITY_LEVELS: readonly EducationLevel[] = ['SMA_SMK', 'D3', 'D4_S1', 'S2', 'S3'];

/** Jenjang untuk cek kelayakan: dari URL (`?untuk=`), lalu profil, lalu D4/S1. */
export function parseEligibilityLevel(params: RawSearchParams, fallback: EducationLevel | null): EducationLevel {
  const raw = Array.isArray(params.untuk) ? params.untuk[0] : params.untuk;
  if (ELIGIBILITY_LEVELS.includes(raw as EducationLevel)) return raw as EducationLevel;
  return fallback && ELIGIBILITY_LEVELS.includes(fallback) ? fallback : 'D4_S1';
}

/** Kegiatan tanpa batasan jenjang, atau bertanda Umum, terbuka untuk siapa pun. */
export function eligibilityReason(event: Pick<EventSummary, 'educationLevels'>, level: EducationLevel): string | null {
  const levels = event.educationLevels;
  if (levels.length === 0 || levels.includes('UMUM') || levels.includes(level)) return null;
  return `Khusus ${levels.map((item) => EDUCATION_LEVEL_LABEL[item]).join(' & ')}`;
}


export interface LevelSummary {
  /** Ringkas untuk baris meta kartu: "SMA/SMK – D4/S1", "D3 · S2 +1". */
  readonly short: string;
  /** Daftar lengkap untuk pembaca layar bila `short` memotong sesuatu. */
  readonly full: string;
}

/**
 * Jenjang di kartu tanpa daftar yang memanjang ("SMA/SMK · D3 · D4/S1 · Umum"
 * memakan satu baris penuh di ponsel dan memotong lokasi). Umum atau daftar
 * kosong = siapa pun boleh ikut (aturan yang sama dengan `eligibilityReason`),
 * jadi jenjang spesifiknya tidak menambah informasi. Jenjang berurutan jadi
 * rentang karena pertanyaan pembaca kartu adalah "jenjangku termasuk?" —
 * rentang menjawabnya tanpa memotong apa pun.
 */
export function levelSummary(levels: readonly EducationLevel[]): LevelSummary {
  if (levels.length === 0 || levels.includes('UMUM')) return { short: 'Semua jenjang', full: 'Terbuka untuk semua jenjang' };
  const indexes = ELIGIBILITY_LEVELS.map((level, index) => (levels.includes(level) ? index : -1)).filter((index) => index >= 0);
  const labels = indexes.map((index) => EDUCATION_LEVEL_LABEL[ELIGIBILITY_LEVELS[index]!]);
  const full = labels.join(', ');
  if (labels.length <= 2) return { short: labels.join(' · '), full };
  const contiguous = indexes.every((index, position) => position === 0 || index === indexes[position - 1]! + 1);
  if (contiguous) return { short: `${labels[0]} – ${labels[labels.length - 1]}`, full };
  return { short: `${labels[0]} · ${labels[1]} +${labels.length - 2}`, full };
}
