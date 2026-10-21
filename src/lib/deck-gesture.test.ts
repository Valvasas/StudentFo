import { describe, expect, it } from 'vitest';
import {
  BLOCKED_DRAG_CAP_PX,
  classifyMove,
  decideRelease,
  dragOffset,
  dragProgress,
  estimateVelocity,
  isArmed,
  isInEdgeDeadZone,
  isTap,
  rubberBand,
  stampStrength,
  thresholdFor,
  tiltFor,
} from './deck-gesture';

describe('thresholdFor', () => {
  it('26% lebar kartu, minimal 88px', () => {
    expect(thresholdFor(280)).toBe(88);
    expect(thresholdFor(350)).toBe(91);
    expect(thresholdFor(620)).toBe(161);
  });
});

describe('dragProgress', () => {
  it('1 tepat di ambang dan dijepit di 1,2', () => {
    expect(dragProgress(88, 88)).toBe(1);
    expect(dragProgress(-44, 88)).toBe(-0.5);
    expect(dragProgress(400, 88)).toBe(1.2);
    expect(dragProgress(-400, 88)).toBe(-1.2);
  });
});

describe('rubberBand', () => {
  it('lurus sampai 1,25x ambang lalu diteruskan 35%', () => {
    expect(rubberBand(100, 88)).toBe(100);
    expect(rubberBand(110, 88)).toBe(110);
    expect(rubberBand(210, 88)).toBeCloseTo(110 + 100 * 0.35);
    expect(rubberBand(-210, 88)).toBeCloseTo(-(110 + 100 * 0.35));
  });
});

describe('dragOffset', () => {
  it('kartu yang bisa diajak memakai karet', () => {
    expect(dragOffset(210, { threshold: 88, canInvite: true, reduced: false })).toBeCloseTo(145);
  });

  it('kartu yang tak bisa diajak tak pernah lewat 24px ke kanan', () => {
    for (const dx of [1, 20, 80, 300, 2000]) {
      const offset = dragOffset(dx, { threshold: 88, canInvite: false, reduced: false });
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThanOrEqual(BLOCKED_DRAG_CAP_PX);
    }
    expect(dragOffset(500, { threshold: 88, canInvite: false, reduced: true })).toBe(BLOCKED_DRAG_CAP_PX);
  });

  it('ke kiri tetap bebas walau tak bisa diajak', () => {
    expect(dragOffset(-100, { threshold: 88, canInvite: false, reduced: false })).toBe(-100);
  });

  it('gerak dikurangi: tanpa karet', () => {
    expect(dragOffset(400, { threshold: 88, canInvite: true, reduced: true })).toBe(400);
  });
});

describe('tiltFor', () => {
  it('sebanding dengan lebar, dijepit ±14°, nol saat gerak dikurangi', () => {
    expect(tiltFor(100, 400, false)).toBeCloseTo(3.5);
    expect(tiltFor(-1000, 400, false)).toBe(-14);
    expect(tiltFor(200, 400, true)).toBe(0);
    expect(tiltFor(200, 0, false)).toBe(0);
  });
});

describe('stampStrength / isArmed', () => {
  it('muncul setelah zona mati dan hanya di sisinya', () => {
    expect(stampStrength(-0.15, 'left')).toBe(0);
    expect(stampStrength(-0.45, 'left')).toBeCloseTo(0.5);
    expect(stampStrength(-0.75, 'left')).toBe(1);
    expect(stampStrength(-0.75, 'right')).toBe(0);
    expect(stampStrength(1, 'right')).toBe(1);
  });

  it('terisi tinta saat |p| mencapai 1', () => {
    expect(isArmed(0.99)).toBe(false);
    expect(isArmed(1)).toBe(true);
    expect(isArmed(-1.1)).toBe(true);
  });
});

describe('estimateVelocity', () => {
  it('memakai sampel dalam 100ms terakhir', () => {
    expect(
      estimateVelocity([
        { x: 0, t: 0 },
        { x: 10, t: 150 },
        { x: 60, t: 200 },
        { x: 110, t: 240 },
      ]),
    ).toBeCloseTo((110 - 10) / (240 - 150));
  });

  it('nol bila data kurang atau waktu tak maju', () => {
    expect(estimateVelocity([])).toBe(0);
    expect(estimateVelocity([{ x: 5, t: 10 }])).toBe(0);
    expect(estimateVelocity([{ x: 5, t: 10 }, { x: 50, t: 10 }])).toBe(0);
  });
});

describe('decideRelease', () => {
  const base = { vx: 0, width: 350, canInvite: true };

  it('di bawah ambang = batal', () => {
    expect(decideRelease({ ...base, dx: 60 })).toBe('cancel');
    expect(decideRelease({ ...base, dx: -91 })).toBe('cancel');
  });

  it('melewati ambang: kiri melewati, kanan meninjau ajakan', () => {
    expect(decideRelease({ ...base, dx: -92 })).toBe('skip');
    expect(decideRelease({ ...base, dx: 220 })).toBe('invite');
  });

  it('lemparan cepat dengan jarak cukup melewati walau di bawah ambang', () => {
    expect(decideRelease({ ...base, dx: -40, vx: -0.8 })).toBe('skip');
    expect(decideRelease({ ...base, dx: 40, vx: 0.8 })).toBe('invite');
  });

  it('lemparan terlalu pendek atau berlawanan arah tidak dihitung', () => {
    expect(decideRelease({ ...base, dx: -20, vx: -0.9 })).toBe('cancel');
    expect(decideRelease({ ...base, dx: -60, vx: 0.9 })).toBe('cancel');
    expect(decideRelease({ ...base, dx: -60, vx: -0.5 })).toBe('cancel');
  });

  it('kartu yang tak bisa diajak: kanan = blocked, kiri tetap melewati', () => {
    expect(decideRelease({ ...base, dx: 220, canInvite: false })).toBe('blocked');
    expect(decideRelease({ ...base, dx: 30, canInvite: false })).toBe('cancel');
    expect(decideRelease({ ...base, dx: -220, canInvite: false })).toBe('skip');
  });
});

describe('isTap', () => {
  it('gerak <6px dan <300ms', () => {
    expect(isTap({ dist: 2, ms: 120 })).toBe(true);
    expect(isTap({ dist: 6, ms: 120 })).toBe(false);
    expect(isTap({ dist: 2, ms: 300 })).toBe(false);
  });
});

describe('classifyMove', () => {
  it('menunggu sampai gerak melewati 10px', () => {
    expect(classifyMove(8, 2)).toBe('pending');
    expect(classifyMove(0, 0)).toBe('pending');
  });

  it('horizontal harus dominan 1,5x', () => {
    expect(classifyMove(16, 8)).toBe('horizontal');
    expect(classifyMove(-20, 4)).toBe('horizontal');
    expect(classifyMove(12, 11)).toBe('vertical');
    expect(classifyMove(3, 14)).toBe('vertical');
    expect(classifyMove(12, 10)).toBe('pending');
  });
});

describe('isInEdgeDeadZone', () => {
  it('16px dari kedua tepi diserahkan ke peramban', () => {
    expect(isInEdgeDeadZone(10, 390)).toBe(true);
    expect(isInEdgeDeadZone(380, 390)).toBe(true);
    expect(isInEdgeDeadZone(16, 390)).toBe(false);
    expect(isInEdgeDeadZone(200, 390)).toBe(false);
  });
});
