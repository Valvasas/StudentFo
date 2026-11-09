import 'server-only';
import { formText, formTrimmed } from '@/lib/form-data';
import { institutionDisplayName, type InstitutionKind } from '@/lib/institution-kinds';
import { institutionById } from '@/lib/institutions';
import { cleanText } from '@/lib/registration-form';
import { studyFieldLabels } from '@/lib/study-fields';
import { ABROAD_CODE, isRegionCode, regionLabel } from '@/lib/wilayah';
import { isDistrictCode } from '@/lib/wilayah-districts';
import type { PublicStudyProfile, StudyPlaceInput } from '@/types/domain';

/** Cermin CHECK `users_institution_name_length` (migration 20261109100001). */
export const STUDY_PLACE_LIMITS = { institutionMin: 2, institutionMax: 120 } as const;

/**
 * Isian kartu "Tempat studi & domisili" (ADR-076). Id direktori menang atas
 * teks: namanya diambil dari direktori, bukan dari peramban. Teks bebas
 * tanpa id tetap boleh — direktori resmi tidak memuat kursus, pesantren, atau
 * kampus luar negeri.
 */
export function parseStudyPlace(formData: FormData): { ok: true; value: StudyPlaceInput } | { ok: false } {
  const id = formTrimmed(formData, 'institutionId');
  const text = cleanText(formText(formData, 'institution')).replace(/\s+/g, ' ');
  const domicile = formTrimmed(formData, 'domicile');

  let institutionId: string | null = null;
  let institutionName: string | null = null;
  if (id) {
    const hit = institutionById(id);
    if (!hit) return { ok: false };
    institutionId = hit.id;
    institutionName = hit.name;
  } else if (text) {
    if (text.length < STUDY_PLACE_LIMITS.institutionMin || text.length > STUDY_PLACE_LIMITS.institutionMax) return { ok: false };
    institutionName = text;
  }

  if (domicile && domicile !== ABROAD_CODE && !isRegionCode(domicile) && !isDistrictCode(domicile)) return { ok: false };
  return { ok: true, value: { institutionId, institutionName, domicileCode: domicile || null } };
}

export interface StudyPlaceView {
  /** "Universitas Indonesia (UI)" — dari direktori bila ada id, selain itu teks pemiliknya. */
  readonly institution: string | null;
  readonly kind: InstitutionKind | null;
  /** "Kota Depok, Jawa Barat" — tidak pernah kecamatan. */
  readonly region: string | null;
  readonly fields: readonly string[];
}

export function presentStudyProfile(profile: Pick<PublicStudyProfile, 'institutionId' | 'institutionName' | 'studyFields'> & { regionCode: string | null }): StudyPlaceView {
  const hit = profile.institutionId ? institutionById(profile.institutionId) : null;
  return {
    institution: hit ? institutionDisplayName(hit.name, hit.short) : profile.institutionName,
    kind: hit?.kind ?? null,
    region: regionLabel(profile.regionCode?.slice(0, 5)),
    fields: studyFieldLabels(profile.studyFields),
  };
}

export function isEmptyStudyView(view: StudyPlaceView): boolean {
  return !view.institution && !view.region && view.fields.length === 0;
}
