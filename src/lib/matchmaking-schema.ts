import { formList, formText, formTrimmed } from '@/lib/form-data';
import { isKnownCity } from '@/lib/geo';
import { stripMarkup } from '@/lib/submission-schema';
import { SEEKER_LIMITS, TEAM_SKILL_SLUGS, type TeamSeekerInput, type TeamSkillSlug } from '@/types/domain';

/**
 * Validasi form kartu pemain (ADR-057). Batas panjangnya MENCERMINKAN CHECK di
 * `team_seekers` (migration 20261020100001) — validasi yang lebih longgar
 * berujung pelanggaran constraint yang tak terbaca pengguna.
 *
 * Nilai di luar daftar tertutup DITOLAK, tidak diam-diam dibuang: form yang
 * kita render tidak pernah mengirimnya, jadi kehadirannya berarti permintaan
 * dibuat tangan.
 */

export const SEEKER_FIELDS = ['skills', 'seeking', 'city', 'pitch', 'open'] as const;
export type SeekerField = (typeof SEEKER_FIELDS)[number];

export type SeekerFormResult =
  | { readonly success: true; readonly data: TeamSeekerInput }
  | { readonly success: false; readonly fields: readonly SeekerField[] };

const isSkill = (value: string): value is TeamSkillSlug => TEAM_SKILL_SLUGS.includes(value as TeamSkillSlug);

function readSkills(formData: FormData, name: string, limit: number): TeamSkillSlug[] | null {
  const values = [...new Set(formList(formData, name))];
  if (values.length > limit || !values.every(isSkill)) return null;
  return values as TeamSkillSlug[];
}

const isChecked = (formData: FormData, name: string) => ['on', '1', 'true'].includes(formTrimmed(formData, name));

export function parseSeekerForm(formData: FormData): SeekerFormResult {
  const invalid = new Set<SeekerField>();

  const skills = readSkills(formData, 'skills', SEEKER_LIMITS.skills);
  if (skills === null) invalid.add('skills');
  const seeking = readSkills(formData, 'seeking', SEEKER_LIMITS.seeking);
  if (seeking === null) invalid.add('seeking');

  const rawCity = formTrimmed(formData, 'city');
  if (rawCity !== '' && !isKnownCity(rawCity)) invalid.add('city');
  const city = rawCity === '' || invalid.has('city') ? null : rawCity;

  const rawPitch = stripMarkup(formText(formData, 'pitch')).replace(/\s+/g, ' ').trim();
  if (rawPitch.length > SEEKER_LIMITS.pitchMax) invalid.add('pitch');
  const pitch = rawPitch === '' ? null : rawPitch.slice(0, SEEKER_LIMITS.pitchMax);

  const open = isChecked(formData, 'open');
  const remoteOk = isChecked(formData, 'remoteOk');
  // Kartu terbuka tanpa keahlian tidak berguna bagi siapa pun, dan tanpa kota
  // maupun kesediaan daring ia tidak bisa dijangkau — tolak dengan alasan.
  if (open && (skills?.length ?? 0) === 0) invalid.add('skills');
  if (open && city === null && !remoteOk) invalid.add('city');

  if (invalid.size > 0) return { success: false, fields: SEEKER_FIELDS.filter((field) => invalid.has(field)) };
  return { success: true, data: { open, city, skills: skills ?? [], seeking: seeking ?? [], remoteOk, pitch } };
}

/** `fields` dari URL → hanya nama yang dikenal (daftar tertutup, pola /submit). */
export function parseSeekerFields(value: string | string[] | undefined): readonly SeekerField[] {
  const raw = (Array.isArray(value) ? value[0] : value) ?? '';
  return raw.split(',').filter((field): field is SeekerField => (SEEKER_FIELDS as readonly string[]).includes(field));
}
