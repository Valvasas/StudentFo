import { describe, expect, it } from 'vitest';
import { eligibilityReason, levelSummary, parseEligibilityLevel } from './eligibility';

describe('eligibilityReason', () => {
  it('tanpa batasan jenjang atau bertanda Umum = memenuhi', () => {
    expect(eligibilityReason({ educationLevels: [] }, 'SMA_SMK')).toBeNull();
    expect(eligibilityReason({ educationLevels: ['UMUM'] }, 'S3')).toBeNull();
  });

  it('jenjang cocok = memenuhi, tidak cocok = alasan yang menyebut jenjangnya', () => {
    expect(eligibilityReason({ educationLevels: ['D4_S1', 'S2'] }, 'S2')).toBeNull();
    expect(eligibilityReason({ educationLevels: ['D4_S1', 'S2'] }, 'SMA_SMK')).toBe('Khusus D4/S1 & S2');
  });
});

describe('parseEligibilityLevel', () => {
  it('URL menang atas profil; nilai asing diabaikan', () => {
    expect(parseEligibilityLevel({ untuk: 'S2' }, 'D3')).toBe('S2');
    expect(parseEligibilityLevel({ untuk: 'DROP TABLE' }, 'D3')).toBe('D3');
  });

  it('tanpa URL & profil → D4/S1; profil "Umum" bukan jenjang studi', () => {
    expect(parseEligibilityLevel({}, null)).toBe('D4_S1');
    expect(parseEligibilityLevel({}, 'UMUM')).toBe('D4_S1');
  });
});

describe('levelSummary', () => {
  it('Umum atau tanpa batasan = semua jenjang, apa pun jenjang lain yang ikut tercatat', () => {
    expect(levelSummary([]).short).toBe('Semua jenjang');
    expect(levelSummary(['SMA_SMK', 'D3', 'D4_S1', 'UMUM']).short).toBe('Semua jenjang');
  });

  it('satu-dua jenjang ditulis apa adanya, urut jenjang (bukan urutan data)', () => {
    expect(levelSummary(['D4_S1']).short).toBe('D4/S1');
    expect(levelSummary(['S2', 'D4_S1']).short).toBe('D4/S1 · S2');
  });

  it('tiga jenjang berurutan atau lebih jadi rentang', () => {
    expect(levelSummary(['SMA_SMK', 'D3', 'D4_S1']).short).toBe('SMA/SMK – D4/S1');
    expect(levelSummary(['S3', 'D3', 'S2', 'D4_S1']).short).toBe('D3 – S3');
  });

  it('jenjang berselang tidak dijadikan rentang palsu; daftar lengkap tetap tersedia', () => {
    const summary = levelSummary(['SMA_SMK', 'D4_S1', 'S3']);
    expect(summary.short).toBe('SMA/SMK · D4/S1 +1');
    expect(summary.full).toBe('SMA/SMK, D4/S1, S3');
  });
});
