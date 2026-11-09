import { describe, expect, it } from 'vitest';
import { parseStudyPlace, presentStudyProfile } from './study-profile';

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

describe('parseStudyPlace (ADR-076)', () => {
  it('id direktori → nama resmi; teks dari peramban diabaikan', () => {
    expect(parseStudyPlace(form({ institutionId: '001002', institution: 'Nama Palsu', domicile: '32.76.03' }))).toEqual({
      ok: true,
      value: { institutionId: '001002', institutionName: 'Universitas Indonesia', domicileCode: '32.76.03' },
    });
  });

  it('teks bebas tanpa id boleh (kursus, pesantren, kampus luar negeri); kosong = hapus', () => {
    expect(parseStudyPlace(form({ institution: '  Pesantren   Uji ', domicile: '32' }))).toEqual({
      ok: true,
      value: { institutionId: null, institutionName: 'Pesantren Uji', domicileCode: '32' },
    });
    expect(parseStudyPlace(form({}))).toEqual({ ok: true, value: { institutionId: null, institutionName: null, domicileCode: null } });
  });

  it('domisili luar negeri (LN) diterima & ditampilkan', () => {
    expect(parseStudyPlace(form({ domicile: 'LN' }))).toEqual({ ok: true, value: { institutionId: null, institutionName: null, domicileCode: 'LN' } });
    expect(presentStudyProfile({ institutionId: null, institutionName: null, regionCode: 'LN', studyFields: [] }).region).toBe('Luar negeri');
  });

  it('id asing, teks terlalu pendek/panjang, dan kode wilayah yang tidak ada ditolak', () => {
    expect(parseStudyPlace(form({ institutionId: '999999' })).ok).toBe(false);
    expect(parseStudyPlace(form({ institution: 'x' })).ok).toBe(false);
    expect(parseStudyPlace(form({ institution: 'x'.repeat(121) })).ok).toBe(false);
    expect(parseStudyPlace(form({ domicile: '32.73.99' })).ok).toBe(false);
  });
});

describe('presentStudyProfile', () => {
  it('nama dari direktori + singkatan, wilayah terpotong ke kab/kota, label bidang', () => {
    expect(presentStudyProfile({ institutionId: '001002', institutionName: 'Apa saja', regionCode: '32.76.03', studyFields: ['ui-ux'] })).toEqual({
      institution: 'Universitas Indonesia (UI)',
      kind: 'PTN',
      region: 'Kota Depok, Jawa Barat',
      fields: ['Desain UI/UX'],
    });
    expect(presentStudyProfile({ institutionId: null, institutionName: 'Kursus Uji', regionCode: null, studyFields: [] })).toMatchObject({ institution: 'Kursus Uji', kind: null, region: null });
  });
});
