import { describe, expect, it } from 'vitest';
import { isNextStepsHidden, nextSteps, profileNudge, summarizeSteps, type NextStepFacts } from '@/lib/next-steps';

const fresh: NextStepFacts = { profileReady: false, hasPhoto: false, savedCount: 0, registeredCount: 0, connectionCount: 0, teamCount: 0 };

describe('nextSteps', () => {
  it('pendatang baru: enam langkah, urut dari minat sampai tim, semua belum selesai', () => {
    const steps = nextSteps(fresh);
    expect(steps.map((step) => step.key)).toEqual(['minat', 'simpan', 'daftar', 'foto', 'teman', 'tim']);
    expect(steps.every((step) => !step.done)).toBe(true);
    expect(summarizeSteps(steps)).toMatchObject({ done: 0, next: { key: 'minat' } });
  });

  it('fakta yang gagal dimuat (null) = langkahnya tidak ditawarkan, bukan dianggap belum dikerjakan', () => {
    const steps = nextSteps({ ...fresh, hasPhoto: null, connectionCount: null, teamCount: null });
    expect(steps.map((step) => step.key)).toEqual(['minat', 'simpan', 'daftar']);
  });

  it('langkah selesai sesuai faktanya; "berikutnya" = yang pertama belum selesai', () => {
    const steps = nextSteps({ ...fresh, profileReady: true, savedCount: 2, connectionCount: 1 });
    expect(steps.filter((step) => step.done).map((step) => step.key)).toEqual(['minat', 'simpan', 'teman']);
    expect(summarizeSteps(steps)).toMatchObject({ done: 3, next: { key: 'daftar' } });
  });

  it('langkah "daftar" mengarah ke papan lamaran bila sudah ada yang disimpan, ke daftar lomba bila belum', () => {
    expect(nextSteps(fresh).find((step) => step.key === 'daftar')?.href).toBe('/events?type=LOMBA');
    expect(nextSteps({ ...fresh, savedCount: 1 }).find((step) => step.key === 'daftar')?.href).toBe('/tracker');
  });

  it('semua selesai → tidak ada langkah berikutnya', () => {
    const steps = nextSteps({ profileReady: true, hasPhoto: true, savedCount: 1, registeredCount: 1, connectionCount: 3, teamCount: 1 });
    expect(summarizeSteps(steps)).toMatchObject({ done: 6, next: null });
  });

  it('semua tautan internal', () => {
    for (const step of nextSteps(fresh)) expect(step.href.startsWith('/')).toBe(true);
  });
});

describe('profileNudge (lonceng)', () => {
  it('hanya langkah tingkat profil: minat dulu, lalu foto', () => {
    expect(profileNudge({ profileReady: false, hasPhoto: false })?.key).toBe('minat');
    expect(profileNudge({ profileReady: true, hasPhoto: false })?.key).toBe('foto');
    expect(profileNudge({ profileReady: true, hasPhoto: true })).toBeNull();
    // Kolom foto belum ada → tidak ada saran foto.
    expect(profileNudge({ profileReady: true, hasPhoto: null })).toBeNull();
  });
});

describe('isNextStepsHidden', () => {
  it('hanya nilai "hidden" yang menyembunyikan', () => {
    expect(isNextStepsHidden('hidden')).toBe(true);
    expect(isNextStepsHidden(undefined)).toBe(false);
    expect(isNextStepsHidden('1')).toBe(false);
  });
});
