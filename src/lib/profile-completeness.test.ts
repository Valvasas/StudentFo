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

  it('program studi berisi spasi saja tidak dihitung terisi', () => {
    const major = profileCompleteness({ ...empty, major: '   ' }).items.find((item) => item.key === 'major');
    expect(major?.done).toBe(false);
  });
});
