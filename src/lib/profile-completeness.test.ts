import { describe, expect, it } from 'vitest';
import { profileCompleteness } from './profile-completeness';

const empty = { fullName: 'Raka Aditya', educationLevel: null, major: null, interests: [] };

describe('profileCompleteness', () => {
  it('nama saja = 25%, sisanya belum', () => {
    const result = profileCompleteness(empty);
    expect(result.percent).toBe(25);
    expect(result.items.filter((item) => !item.done).map((item) => item.key)).toEqual([
      'education',
      'major',
      'interests',
    ]);
  });

  it('profil lengkap = 100%', () => {
    expect(
      profileCompleteness({ ...empty, educationLevel: 'D4_S1', major: 'Informatika', interests: ['teknologi'] }).percent,
    ).toBe(100);
  });

  it('foto profil ikut dihitung HANYA bila fiturnya tersedia di database ini (ADR-083)', () => {
    const full = { ...empty, educationLevel: 'D4_S1' as const, major: 'Informatika', interests: ['teknologi'] };
    const media = { avatarId: null, bannerId: null, bannerPreset: null };
    // Kolom belum ada → empat butir, tetap bisa 100%.
    expect(profileCompleteness({ ...full, profileMedia: { ...media, available: false } }).percent).toBe(100);
    const withoutPhoto = profileCompleteness({ ...full, profileMedia: { ...media, available: true } });
    expect(withoutPhoto.percent).toBe(80);
    expect(withoutPhoto.items.find((item) => item.key === 'photo')).toMatchObject({ done: false, href: '/profile/details#tampilan' });
    const withPhoto = profileCompleteness({ ...full, profileMedia: { ...media, avatarId: '11111111-1111-4111-8111-111111111111', available: true } });
    expect(withPhoto.percent).toBe(100);
  });

  it('program studi berisi spasi saja tidak dihitung terisi', () => {
    const major = profileCompleteness({ ...empty, major: '   ' }).items.find((item) => item.key === 'major');
    expect(major?.done).toBe(false);
  });
});
