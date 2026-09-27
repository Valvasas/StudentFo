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

