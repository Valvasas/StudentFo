import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENTS,
  DEFAULT_PROFILE_EXTRAS,
  documentError,
  isAchievementYear,
  normalizePhone,
  parseDocuments,
  parseProfileExtras,
  toExternalUrl,
} from './profile-extras';

describe('parseProfileExtras', () => {
  it('bukan objek → bawaan', () => {
    expect(parseProfileExtras(null)).toEqual(DEFAULT_PROFILE_EXTRAS);
    expect(parseProfileExtras([1, 2])).toEqual(DEFAULT_PROFILE_EXTRAS);
  });

  it('kolom rusak jatuh ke bawaan, kolom valid dipakai', () => {
    const parsed = parseProfileExtras({ status: 'Hacker', bio: 42, city: 'Makassar', skills: ['Go', 7, 'SQL'] });
    expect(parsed.status).toBe(DEFAULT_PROFILE_EXTRAS.status);
    expect(parsed.bio).toBe(DEFAULT_PROFILE_EXTRAS.bio);
    expect(parsed.city).toBe('Makassar');
    expect(parsed.skills).toEqual(['Go', 'SQL']);
  });

  it('memotong isian yang terlalu panjang', () => {
    expect(parseProfileExtras({ bio: 'x'.repeat(5000) }).bio).toHaveLength(600);
  });
});

describe('toExternalUrl', () => {
  it('menambah https pada domain polos', () => {
    expect(toExternalUrl('linkedin.com/in/rani')).toBe('https://linkedin.com/in/rani');
  });

  it('menolak skema berbahaya dan isian tanpa domain', () => {
    expect(toExternalUrl('javascript:alert(1)')).toBeNull();
    expect(toExternalUrl('data:text/html,hai')).toBeNull();
    expect(toExternalUrl('localhost')).toBeNull();
    expect(toExternalUrl('   ')).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('menerima format lokal & internasional, membuang spasi/strip', () => {
    expect(normalizePhone('0812-3456 7890')).toBe('081234567890');
    expect(normalizePhone('+62 812 3456 789')).toBe('+628123456789');
  });

  it('menolak nomor rumah, huruf, dan yang terlalu pendek', () => {
    expect(normalizePhone('022 1234567')).toBeNull();
    expect(normalizePhone('08abc')).toBeNull();
    expect(normalizePhone('0812')).toBeNull();
  });
});

describe('isAchievementYear', () => {
  const now = new Date('2026-09-26T00:00:00Z');
  it('empat digit dalam rentang wajar', () => {
    expect(isAchievementYear('2025', now)).toBe(true);
    expect(isAchievementYear('2027', now)).toBe(true);
    expect(isAchievementYear('2028', now)).toBe(false);
    expect(isAchievementYear('25', now)).toBe(false);
    expect(isAchievementYear('1900', now)).toBe(false);
  });
});

describe('parseDocuments', () => {
  it('jenis dokumen tetap; entri asing diabaikan', () => {
    const parsed = parseDocuments([{ name: 'CV', file: 'cv.pdf', date: '1 Sep 2026' }, { name: 'Virus', file: 'x.exe' }]);
    expect(parsed.map((doc) => doc.name)).toEqual(DEFAULT_DOCUMENTS.map((doc) => doc.name));
    expect(parsed.find((doc) => doc.name === 'CV')?.file).toBe('cv.pdf');
    expect(parseDocuments('rusak')).toEqual(DEFAULT_DOCUMENTS);
  });
});

describe('documentError', () => {
  it('menolak format lain dan berkas di atas 5 MB', () => {
    expect(documentError({ name: 'cv.pdf', size: 1000 })).toBeNull();
    expect(documentError({ name: 'foto.PNG', size: 1000 })).toBeNull();
    expect(documentError({ name: 'skrip.exe', size: 1000 })).toMatch(/Format/);
    expect(documentError({ name: 'besar.pdf', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });
});
