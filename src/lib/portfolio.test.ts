import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_OPTIONS,
  achievementLabel,
  defaultPortfolioVisible,
  isPubliclyListed,
  parsePortfolioInput,
  portfolioDigestOf,
  portfolioOutcomeLabel,
  type DigestRow,
} from './portfolio';
import { ACHIEVEMENTS, EVENT_TYPES } from '@/types/domain';

const raw = (overrides: Partial<{ achievement: string; note: string; proofUrl: string; visible: boolean }> = {}) => ({
  achievement: '',
  note: '',
  proofUrl: '',
  visible: true,
  ...overrides,
});

describe('visibilitas bawaan', () => {
  it('beasiswa & magang privat, sisanya publik', () => {
    expect(defaultPortfolioVisible('BEASISWA')).toBe(false);
    expect(defaultPortfolioVisible('MAGANG')).toBe(false);
    for (const type of ['LOMBA', 'WORKSHOP', 'PELATIHAN', 'KONFERENSI', 'VOLUNTEER'] as const) {
      expect(defaultPortfolioVisible(type)).toBe(true);
    }
  });

  it('hanya APPLIED+ yang tampil; "Ditolak" tidak pernah, walau dipaksa tampil', () => {
    const lomba = { event: { eventType: 'LOMBA' as const } };
    expect(isPubliclyListed({ ...lomba, status: 'APPLIED', portfolioVisible: null })).toBe(true);
    expect(isPubliclyListed({ ...lomba, status: 'SAVED', portfolioVisible: true })).toBe(false);
    expect(isPubliclyListed({ ...lomba, status: 'REJECTED', portfolioVisible: true })).toBe(false);
    expect(isPubliclyListed({ ...lomba, status: 'ACCEPTED', portfolioVisible: false })).toBe(false);
    expect(isPubliclyListed({ status: 'APPLIED', portfolioVisible: null, event: { eventType: 'BEASISWA' } })).toBe(false);
    expect(isPubliclyListed({ status: 'APPLIED', portfolioVisible: true, event: { eventType: 'BEASISWA' } })).toBe(true);
  });
});

describe('label hasil', () => {
  it('setiap opsi per jenis adalah hasil yang dikenal dan punya label', () => {
    for (const type of EVENT_TYPES) {
      for (const achievement of ACHIEVEMENT_OPTIONS[type]) {
        expect(ACHIEVEMENTS).toContain(achievement);
        expect(achievementLabel(achievement, type)).not.toBe('');
      }
    }
  });

  it('bergantung jenis kegiatan', () => {
    expect(achievementLabel('PENERIMA', 'BEASISWA')).toBe('Penerima beasiswa');
    expect(achievementLabel('PENERIMA', 'MAGANG')).toBe('Diterima magang');
    expect(achievementLabel('PESERTA', 'VOLUNTEER')).toBe('Relawan');
  });

  it('tanpa hasil, label mengikuti tahap tracker', () => {
    expect(portfolioOutcomeLabel({ status: 'APPLIED', achievement: null, eventType: 'LOMBA' })).toBe('Terdaftar');
    expect(portfolioOutcomeLabel({ status: 'ACCEPTED', achievement: null, eventType: 'LOMBA' })).toBe('Lolos seleksi');
    expect(portfolioOutcomeLabel({ status: 'ACCEPTED', achievement: 'JUARA_1', eventType: 'LOMBA' })).toBe('Juara 1');
  });
});

describe('parsePortfolioInput', () => {
  it('menerima input sah dan merapikan catatan', () => {
    expect(parsePortfolioInput(raw({ achievement: 'JUARA_2', note: '  Kategori   UI/UX ', proofUrl: 'https://sertifikat.example/a' }), 'LOMBA')).toEqual({
      achievement: 'JUARA_2',
      achievementNote: 'Kategori UI/UX',
      proofUrl: 'https://sertifikat.example/a',
      visible: true,
    });
    expect(parsePortfolioInput(raw({ visible: false }), 'BEASISWA')).toEqual({ achievement: null, achievementNote: null, proofUrl: null, visible: false });
  });

  it('menolak hasil yang tidak cocok dengan jenis kegiatan', () => {
    expect(parsePortfolioInput(raw({ achievement: 'JUARA_1' }), 'BEASISWA')).toBeNull();
    expect(parsePortfolioInput(raw({ achievement: 'JUARA_0' }), 'LOMBA')).toBeNull();
  });

  it('tautan bukti hanya https', () => {
    for (const bad of ['http://a.example/x', 'javascript:alert(1)', 'data:text/html,x', 'bukan url', 'https://a.example/ada spasi']) {
      expect(parsePortfolioInput(raw({ proofUrl: bad }), 'LOMBA'), bad).toBeNull();
    }
    expect(parsePortfolioInput(raw({ proofUrl: `https://a.example/${'x'.repeat(500)}` }), 'LOMBA')).toBeNull();
  });

  it('catatan maksimal 120 karakter', () => {
    expect(parsePortfolioInput(raw({ note: 'x'.repeat(121) }), 'LOMBA')).toBeNull();
    expect(parsePortfolioInput(raw({ note: 'x'.repeat(120) }), 'LOMBA')).not.toBeNull();
  });
});

describe('portfolioDigestOf', () => {
  const row = (overrides: Partial<DigestRow> = {}): DigestRow => ({
    status: 'APPLIED',
    portfolioVisible: null,
    achievement: null,
    eventType: 'LOMBA',
    eventStatus: 'APPROVED',
    sortKey: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  it('hanya entri publik: APPLIED+, acara tayang/selesai, beasiswa & magang privat bawaan', () => {
    const digest = portfolioDigestOf([
      row({ achievement: 'JUARA_1', status: 'ACCEPTED', eventStatus: 'EXPIRED' }),
      row({ eventType: 'BEASISWA', achievement: 'PENERIMA' }),
      row({ eventType: 'MAGANG' }),
      row({ status: 'SAVED' }),
      row({ status: 'REJECTED' }),
      row({ eventStatus: 'PENDING' }),
      row({ eventStatus: 'REJECTED' }),
    ]);
    expect(digest).toEqual({ count: 1, achievements: ['JUARA_1'] });
  });

  it('beasiswa yang dipilih tampil ikut terhitung; yang dipilih sembunyi tidak', () => {
    expect(portfolioDigestOf([row({ eventType: 'BEASISWA', portfolioVisible: true, achievement: 'PENERIMA' })]).count).toBe(1);
    expect(portfolioDigestOf([row({ portfolioVisible: false })]).count).toBe(0);
  });

  it('terbaru dulu; capaian dibatasi 10 tapi hitungan tetap utuh', () => {
    const rows = Array.from({ length: 12 }, (_, index) => row({ sortKey: `2026-01-${String(index + 1).padStart(2, '0')}`, achievement: index === 11 ? 'JUARA_1' : 'PESERTA' }));
    const digest = portfolioDigestOf(rows);
    expect(digest.count).toBe(12);
    expect(digest.achievements).toHaveLength(10);
    expect(digest.achievements[0]).toBe('JUARA_1');
  });

  it('kosong = nol, bukan galat', () => {
    expect(portfolioDigestOf([])).toEqual({ count: 0, achievements: [] });
  });
});
