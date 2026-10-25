/**
 * Panduan "Mulai di sini" di beranda peserta (ADR-061). Disembunyikan lewat
 * cookie supaya server langsung merender tanpanya (tanpa kedip) dan tombolnya
 * berupa <form> biasa. Isinya daftar id akun: perangkat bersama tidak ikut
 * menyembunyikan panduan untuk akun lain.
 */
export const GETTING_STARTED_COOKIE = 'sf_mulai';
export const GETTING_STARTED_MAX_AGE = 60 * 60 * 24 * 365;
/** Cookie tetap kecil walau banyak akun bergantian di satu perangkat. */
const REMEMBERED_ACCOUNTS = 5;

function idsOf(value: string | undefined): string[] {
  return (value ?? '').split('.').filter((id) => /^[0-9a-f-]{1,64}$/i.test(id));
}

export function isGettingStartedHidden(value: string | undefined, userId: string): boolean {
  return idsOf(value).includes(userId);
}

export function hideGettingStartedFor(value: string | undefined, userId: string): string {
  return [...idsOf(value).filter((id) => id !== userId), userId].slice(-REMEMBERED_ACCOUNTS).join('.');
}
