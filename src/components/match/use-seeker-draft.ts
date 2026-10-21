'use client';

import { useCallback, useEffect, useState } from 'react';
import { isKnownCity } from '@/lib/geo';
import { SEEKER_LIMITS, TEAM_SKILL_SLUGS, type TeamSkillSlug } from '@/types/domain';

/** Per pengguna: tab yang sama bisa berganti akun, dan draf orang lain tak boleh dipulihkan ke form-mu. */
const draftKey = (viewerId: string) => `sf-seeker-draft:${viewerId}`;

export interface SeekerDraft {
  readonly skills: readonly TeamSkillSlug[];
  readonly seeking: readonly TeamSkillSlug[];
  readonly city: string;
  readonly remoteOk: boolean;
  readonly pitch: string;
  readonly open: boolean;
}

const isSkill = (value: unknown): value is TeamSkillSlug => typeof value === 'string' && (TEAM_SKILL_SLUGS as readonly string[]).includes(value);

function readSkills(value: unknown, limit: number): TeamSkillSlug[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isSkill))].slice(0, limit);
}

export function serializeSeekerDraft(draft: SeekerDraft): string {
  return JSON.stringify(draft);
}

/**
 * Isi sessionStorage bisa saja rusak atau diubah tangan; setiap kolom
 * divalidasi ulang terhadap daftar tertutup yang sama dengan server, dan
 * apa pun yang tidak dikenal dibuang, bukan dilempar.
 */
export function parseSeekerDraft(raw: string | null): SeekerDraft | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const city = typeof record.city === 'string' && isKnownCity(record.city) ? record.city : '';
  const pitch = typeof record.pitch === 'string' ? record.pitch.slice(0, SEEKER_LIMITS.pitchMax) : '';
  return {
    skills: readSkills(record.skills, SEEKER_LIMITS.skills),
    seeking: readSkills(record.seeking, SEEKER_LIMITS.seeking),
    city,
    remoteOk: record.remoteOk === true,
    pitch,
    open: record.open === true,
  };
}

function readStored(viewerId: string): string | null {
  try {
    return window.sessionStorage.getItem(draftKey(viewerId));
  } catch {
    return null;
  }
}

function clearStored(viewerId: string): void {
  try {
    window.sessionStorage.removeItem(draftKey(viewerId));
  } catch {
    /* penyimpanan diblokir: draf memang hanya kenyamanan */
  }
}

/** Dipasang di halaman hasil: kartu sudah tersimpan, jadi draf (termasuk kalimat pengantar) tak perlu menginap di tab. */
export function ForgetSeekerDraft({ viewerId }: { viewerId: string }): null {
  useEffect(() => clearStored(viewerId), [viewerId]);
  return null;
}

/**
 * Menjawab aksi simpan yang gagal (validasi atau galat lain) dan mengosongkan
 * isian: server hanya mengembalikan kode galat dan merender ulang dari profil
 * TERSIMPAN. Draf ditulis saat submit dan dipulihkan SEKALI bila URL membawa
 * galat (`shouldRestore`), lalu dihapus; pada kunjungan lain draf basi dibuang.
 * Tanpa JS atau tanpa penyimpanan perilakunya sama seperti sebelumnya.
 */
export function useSeekerDraft(viewerId: string, state: SeekerDraft, restore: (draft: SeekerDraft) => void, shouldRestore: boolean) {
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const draft = shouldRestore ? parseSeekerDraft(readStored(viewerId)) : null;
    clearStored(viewerId);
    if (!draft) return;
    restore(draft);
    setRestored(true);
  }, [viewerId, restore, shouldRestore]);

  const { skills, seeking, city, remoteOk, pitch, open } = state;
  const saveDraft = useCallback(() => {
    try {
      window.sessionStorage.setItem(draftKey(viewerId), serializeSeekerDraft({ skills, seeking, city, remoteOk, pitch, open }));
    } catch {
      /* penyimpanan penuh atau diblokir */
    }
  }, [viewerId, skills, seeking, city, remoteOk, pitch, open]);

  return { saveDraft, restored };
}
