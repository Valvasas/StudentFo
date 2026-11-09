import { describe, expect, it } from 'vitest';
import { institutionDisplayName } from './institution-kinds';
import { institutionById, institutionCount, searchInstitutions } from './institutions';

describe('direktori tempat studi (ADR-076)', () => {
  it('memuat PT & sekolah; tanpa PT luar negeri (kode 9xxxxx)', () => {
    expect(institutionCount()).toBeGreaterThan(3000);
    expect(institutionById('903230')).toBeNull();
  });

  it('singkatan terkurasi menang: "UI", "itb", "ugm"', () => {
    expect(searchInstitutions('UI')[0]).toMatchObject({ id: '001002', name: 'Universitas Indonesia', short: 'UI', kind: 'PTN' });
    expect(searchInstitutions('itb')[0]?.name).toBe('Institut Teknologi Bandung');
    expect(searchInstitutions('ugm')[0]?.name).toBe('Universitas Gadjah Mada');
  });

  it('bentuk lain nama sekolah: "sma negeri 8 jakarta" = "SMAN 8 Jakarta"', () => {
    expect(searchInstitutions('sman 8 jakarta')[0]?.name).toBe('SMAN 8 Jakarta');
    expect(searchInstitutions('sma negeri 8 jakarta')[0]?.name).toBe('SMAN 8 Jakarta');
  });

  it('cakupan kampus/sekolah, kueri terlalu pendek = kosong, hasil berbatas', () => {
    expect(searchInstitutions('jakarta', 'sekolah').every((hit) => ['SMA', 'SMK', 'MA', 'KEA', 'SLB', 'SM'].includes(hit.kind))).toBe(true);
    expect(searchInstitutions('jakarta', 'kampus').every((hit) => ['PTN', 'PTS', 'PTK'].includes(hit.kind))).toBe(true);
    expect(searchInstitutions('u')).toEqual([]);
    expect(searchInstitutions('universitas').length).toBeLessThanOrEqual(12);
  });

  it('lokasi ditampilkan sebagai kab/kota Kemendagri', () => {
    expect(institutionById('001001')?.region).toBe('Kab. Sleman, DI Yogyakarta');
    expect(institutionById('zzz')).toBeNull();
  });

  it('nama tampilan: singkatan dalam kurung kecuali sudah ada di nama', () => {
    expect(institutionDisplayName('Universitas Indonesia', 'UI')).toBe('Universitas Indonesia (UI)');
    expect(institutionDisplayName('Politeknik Statistika STIS', 'STIS')).toBe('Politeknik Statistika STIS');
    expect(institutionDisplayName('SMAN 8 Jakarta', null)).toBe('SMAN 8 Jakarta');
  });
});

describe('kualitas data impor', () => {
  it('IAIN yang sudah menjadi UIN tidak muncul ganda; UIN-nya bersingkatan', () => {
    expect(institutionById('202008')).toBeNull();
    expect(searchInstitutions('uin walisongo')[0]).toMatchObject({ id: '201010', short: 'UIN Walisongo' });
  });

  it('satuan keagamaan setara SMA & nama panjang ikut terklasifikasi', () => {
    expect(searchInstitutions('madrasah aliyah', 'sekolah').length).toBeGreaterThan(0);
    expect(searchInstitutions('smtk', 'sekolah').every((hit) => hit.kind === 'KEA')).toBe(true);
  });
});

describe('peringkat pencarian', () => {
  it('kota ikut dicari; kata persis mengalahkan awalan; kampus bersingkatan didahulukan', () => {
    expect(searchInstitutions('its surabaya')[0]?.short).toBe('ITS');
    expect(searchInstitutions('stis')[0]?.name).toBe('Politeknik Statistika STIS');
    expect(searchInstitutions('telkom')[0]?.name).toBe('Universitas Telkom');
    expect(searchInstitutions('man 2 kota malang')[0]?.name).toBe('MAN 2 Kota Malang');
  });
});
