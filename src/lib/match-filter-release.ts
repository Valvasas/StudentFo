import { MATCH_STYLE_LABEL, type MatchQuery } from '@/lib/matchmaking';
import { skillLabel, type TeamSkillSlug } from '@/types/domain';

/**
 * Saringan aktif sebagai "token" yang bisa dilepas satu per satu: dipakai chip
 * di atas tumpukan dan tautan "Lepas …" di keadaan kosong. Murni dan hanya
 * membaca `MatchQuery`; aturan saringan itu sendiri tetap di `matchmaking.ts`.
 */

export type FilterKey = 'distance' | 'remote' | 'skills' | 'portfolio' | 'level' | 'style';

export interface FilterToken {
  readonly key: FilterKey;
  readonly label: string;
  /** Hanya untuk key 'skills': keahlian yang dilepas oleh token ini. */
  readonly skill?: TeamSkillSlug;
}

export function filterTokens(query: MatchQuery): readonly FilterToken[] {
  const { filters, style } = query;
  const tokens: FilterToken[] = [];
  if (filters.maxDistanceKm !== null) tokens.push({ key: 'distance', label: `≤ ${filters.maxDistanceKm} km` });
  if (!filters.includeRemote) tokens.push({ key: 'remote', label: 'Hanya bertemu langsung' });
  for (const skill of filters.skills) tokens.push({ key: 'skills', label: skillLabel(skill), skill });
  if (filters.portfolio !== 'semua') tokens.push({ key: 'portfolio', label: filters.portfolio === 'juara' ? 'Pernah juara' : 'Sudah punya portofolio' });
  if (filters.sameLevel) tokens.push({ key: 'level', label: 'Jenjang sama' });
  if (style !== 'seimbang') tokens.push({ key: 'style', label: MATCH_STYLE_LABEL[style].label });
  return tokens;
}

/** Satu entri per jenis saringan yang menyaring orang (gaya tim hanya mengubah urutan, bukan siapa yang lolos). */
export function filterGroups(query: MatchQuery): readonly { readonly key: Exclude<FilterKey, 'style'>; readonly label: string }[] {
  const { filters } = query;
  const groups: { key: Exclude<FilterKey, 'style'>; label: string }[] = [];
  if (filters.maxDistanceKm !== null) groups.push({ key: 'distance', label: `≤ ${filters.maxDistanceKm} km` });
  if (!filters.includeRemote) groups.push({ key: 'remote', label: 'syarat bertemu langsung' });
  if (filters.skills.length > 0) groups.push({ key: 'skills', label: 'keahlian wajib' });
  if (filters.portfolio !== 'semua') groups.push({ key: 'portfolio', label: filters.portfolio === 'juara' ? 'syarat pernah juara' : 'syarat portofolio' });
  if (filters.sameLevel) groups.push({ key: 'level', label: 'syarat jenjang sama' });
  return groups;
}

/** Query yang sama tanpa satu saringan (`skill` ditulis = hanya keahlian itu), tanpa `cari=1`. */
export function releaseFilter(query: MatchQuery, key: FilterKey, skill?: TeamSkillSlug): MatchQuery {
  const filters = query.filters;
  switch (key) {
    case 'distance':
      return { ...query, go: false, filters: { ...filters, maxDistanceKm: null } };
    case 'remote':
      return { ...query, go: false, filters: { ...filters, includeRemote: true } };
    case 'skills':
      return { ...query, go: false, filters: { ...filters, skills: skill ? filters.skills.filter((slug) => slug !== skill) : [] } };
    case 'portfolio':
      return { ...query, go: false, filters: { ...filters, portfolio: 'semua' } };
    case 'level':
      return { ...query, go: false, filters: { ...filters, sameLevel: false } };
    case 'style':
      return { ...query, go: false, style: 'seimbang' };
  }
}
