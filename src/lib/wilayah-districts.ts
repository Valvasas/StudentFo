import 'server-only';
import data from '@/data/wilayah/districts.json';
import { DISTRICT_CODE, REGENCY_CODE, type WilayahOption } from '@/lib/wilayah';

/** Kecamatan (ADR-074) — server saja; peramban memintanya per kab/kota lewat `/api/wilayah/[kode]`. */
const DISTRICT_ROWS = data.districts as unknown as readonly (readonly [code: string, name: string])[];
const DISTRICT_NAME = new Map(DISTRICT_ROWS);

export function districtsOf(regencyCode: string): readonly WilayahOption[] {
  if (!REGENCY_CODE.test(regencyCode)) return [];
  return DISTRICT_ROWS.filter(([code]) => code.startsWith(`${regencyCode}.`)).map(([code, name]) => ({ code, name }));
}

export function isDistrictCode(value: string): boolean {
  return DISTRICT_CODE.test(value) && DISTRICT_NAME.has(value);
}

export function districtName(code: string): string | null {
  return DISTRICT_NAME.get(code) ?? null;
}
