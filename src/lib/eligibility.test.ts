import { describe, expect, it } from 'vitest';
import { eligibilityReason, parseEligibilityLevel } from './eligibility';

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
