import data from '@/data/wilayah/regions.json';

/**
 * Wilayah administratif lengkap (ADR-074): 38 provinsi & 514 kabupaten/kota
 * menurut Kepmendagri terbaru, dari `idn-area-data` (ODbL 1.0 — atribusi di
 * /sumber-data). Kecamatan (7.285) sengaja di modul server terpisah
 * (`wilayah-districts.ts`) supaya ±190 KB itu tidak ikut ke peramban.
 *
 * BUKAN pengganti `lib/regions.ts`: filter lokasi acara & jarak tim memakai
 * daftar kota bertitik-tengah di sana (`geo.ts`), yang tidak tersedia untuk
 * setiap kabupaten. Modul ini untuk "dari mana orangnya" — domisili & pendataan.
 *
 * Kode hierarkis: `32` (provinsi) → `32.73` (kab/kota) → `32.73.01` (kecamatan).
 */

type Row = readonly [code: string, name: string];

export const WILAYAH_SOURCE: string = data.source;

const PROVINCE_ROWS = data.provinces as unknown as readonly Row[];
const REGENCY_ROWS = data.regencies as unknown as readonly Row[];

/** Nama resmi yang terlalu panjang untuk label — kependekan yang lazim dipakai sendiri oleh instansinya. */
const PROVINCE_SHORT: Readonly<Record<string, string>> = {
  '31': 'DKI Jakarta',
  '34': 'DI Yogyakarta',
  '19': 'Kep. Bangka Belitung',
};

export const PROVINCE_CODE = /^\d{2}$/;
export const REGENCY_CODE = /^\d{2}\.\d{2}$/;
export const DISTRICT_CODE = /^\d{2}\.\d{2}\.\d{2}$/;

const PROVINCE_NAME = new Map(PROVINCE_ROWS.map(([code, name]) => [code, PROVINCE_SHORT[code] ?? name]));
const REGENCY_NAME = new Map(REGENCY_ROWS);

export interface WilayahOption {
  readonly code: string;
  readonly name: string;
}

export const PROVINCE_OPTIONS: readonly WilayahOption[] = PROVINCE_ROWS.map(([code]) => ({ code, name: PROVINCE_NAME.get(code) ?? code }));

export function regenciesOf(provinceCode: string): readonly WilayahOption[] {
  return REGENCY_ROWS.filter(([code]) => code.startsWith(`${provinceCode}.`)).map(([code, name]) => ({ code, name }));
}

export function provinceName(code: string): string | null {
  return PROVINCE_NAME.get(code.slice(0, 2)) ?? null;
}

export function regencyName(code: string): string | null {
  return REGENCY_NAME.get(code.slice(0, 5)) ?? null;
}

/** "Kabupaten Bandung" → "Kab. Bandung" — label ringkas untuk kartu & daftar. */
export function shortRegencyName(name: string): string {
  return name.replace(/^Kabupaten Administrasi /, 'Kab. Adm. ').replace(/^Kabupaten /, 'Kab. ').replace(/^Kota Administrasi /, 'Kota Adm. ');
}

/** Kode provinsi atau kab/kota yang benar-benar ada — kecamatan diperiksa `isDistrictCode` di server. */
export function isRegionCode(value: string): boolean {
  if (PROVINCE_CODE.test(value)) return PROVINCE_NAME.has(value);
  if (REGENCY_CODE.test(value)) return REGENCY_NAME.has(value);
  return false;
}

/**
 * Label tampilan sampai tingkat kab/kota: "Kota Bandung, Jawa Barat". Kode
 * kecamatan dipotong ke kab/kota — kecamatan tidak pernah ditampilkan ke
 * orang lain (cukup presisi untuk "dari mana", tidak cukup untuk menemukan rumah).
 */
export function regionLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const province = provinceName(code);
  if (!province) return null;
  if (code.length === 2) return province;
  const regency = regencyName(code);
  return regency ? `${shortRegencyName(regency)}, ${province}` : province;
}

/** Semua kab/kota berkelompok provinsi — sumber pemilih melayang (nama kab/kota unik se-Indonesia, diuji). */
export const REGENCY_PICKER_OPTIONS: readonly { readonly label: string; readonly group: string; readonly code: string }[] = REGENCY_ROWS.map(
  ([code, name]) => ({ label: name, group: PROVINCE_NAME.get(code.slice(0, 2)) ?? '', code }),
);
