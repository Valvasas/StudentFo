import { describe, expect, it } from 'vitest';
import districts from '@/data/wilayah/districts.json';
import regions from '@/data/wilayah/regions.json';
import { REGIONS } from './regions';
import { ALL_CITY_NAMES, CITY_GROUPS, citiesOfProvince, isRegionCode, PROVINCE_OPTIONS, REGENCY_PICKER_OPTIONS, regenciesOf, regionLabel, shortCityName, shortRegencyName } from './wilayah';
import { districtName, districtsOf, isDistrictCode } from './wilayah-districts';

describe('data wilayah (ADR-074)', () => {
  it('lengkap menurut Kepmendagri terbaru: 38 provinsi, 514 kab/kota, 7.285 kecamatan', () => {
    expect(regions.provinces).toHaveLength(38);
    expect(regions.regencies).toHaveLength(514);
    expect(districts.districts).toHaveLength(7285);
  });

  it('hierarki utuh: setiap kab/kota punya provinsi, setiap kecamatan punya kab/kota', () => {
    const provinceCodes = new Set(regions.provinces.map(([code]) => code));
    const regencyCodes = new Set(regions.regencies.map(([code]) => code));
    expect(regions.regencies.every(([code]) => provinceCodes.has(code!.slice(0, 2)))).toBe(true);
    expect(districts.districts.every(([code]) => regencyCodes.has(code!.slice(0, 5)))).toBe(true);
  });

  it('nama kab/kota unik se-Indonesia — pemilih memetakan label kembali ke kode', () => {
    const labels = REGENCY_PICKER_OPTIONS.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('provinsi baru hasil pemekaran ada (Papua Selatan/Tengah/Pegunungan/Barat Daya)', () => {
    const names = PROVINCE_OPTIONS.map((province) => province.name);
    expect(names).toEqual(expect.arrayContaining(['Papua Selatan', 'Papua Tengah', 'Papua Pegunungan', 'Papua Barat Daya', 'DKI Jakarta', 'DI Yogyakarta']));
  });
});

describe('label & validasi kode', () => {
  it('label sampai kab/kota, kecamatan tidak pernah ikut', () => {
    expect(regionLabel('32.73')).toBe('Kota Bandung, Jawa Barat');
    expect(regionLabel('32.73.01')).toBe('Kota Bandung, Jawa Barat');
    expect(regionLabel('32')).toBe('Jawa Barat');
    expect(regionLabel('31.71')).toBe('Kota Adm. Jakarta Pusat, DKI Jakarta');
    expect(regionLabel('99.99')).toBeNull();
    expect(regionLabel(null)).toBeNull();
  });

  it('kode harus ada, bukan sekadar berbentuk benar', () => {
    expect(isRegionCode('32')).toBe(true);
    expect(isRegionCode('32.73')).toBe(true);
    expect(isRegionCode('32.99')).toBe(false);
    expect(isRegionCode('32.73.01')).toBe(false);
    expect(isDistrictCode('32.73.01')).toBe(true);
    expect(isDistrictCode('32.73.99')).toBe(false);
  });

  it('kecamatan per kab/kota; kode asing = kosong', () => {
    expect(districtsOf('32.73').length).toBe(30);
    expect(districtsOf('../etc')).toEqual([]);
    expect(districtName('32.73.01')).toBeTruthy();
    expect(regenciesOf('31')).toHaveLength(6);
  });

  it('nama ringkas', () => {
    expect(shortRegencyName('Kabupaten Bandung')).toBe('Kab. Bandung');
    expect(shortRegencyName('Kabupaten Administrasi Kepulauan Seribu')).toBe('Kab. Adm. Kepulauan Seribu');
    expect(shortRegencyName('Kota Depok')).toBe('Kota Depok');
  });
});

describe('kota untuk lokasi acara', () => {
  it('memilih satu provinsi tidak melewati batas 40 lokasi di URL (search-params)', () => {
    for (const [province, cities] of CITY_GROUPS) expect(cities.length, province).toBeLessThanOrEqual(40);
  });

  it('nama lama REGIONS tetap ada supaya acara lama bisa disaring; nama ringkas tanpa awalan', () => {
    const all = new Set(ALL_CITY_NAMES);
    for (const city of REGIONS.flatMap(([, cities]) => cities)) expect(all.has(city), city).toBe(true);
    expect(shortCityName('Kota Administrasi Jakarta Selatan')).toBe('Jakarta Selatan');
    expect(shortCityName('Kabupaten Sleman')).toBe('Sleman');
    expect(citiesOfProvince('Jawa Barat')).toContain('Pangandaran');
  });
});
