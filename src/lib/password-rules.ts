/**
 * Aturan kata sandi baru — satu sumber untuk validasi server (`auth-schema`)
 * dan indikator kekuatan di peramban. Sengaja tanpa zod: berkas ini ikut
 * dibundel ke klien, dan zod belum ada di bundle mana pun.
 */
export const PASSWORD_MIN_LENGTH = 8;
/**
 * Batas bcrypt (Supabase Auth) dalam BYTE UTF-8, bukan karakter: huruf
 * beraksen dan emoji memakan 2–4 byte. Sebagai `maxLength` isian (yang
 * menghitung karakter) ia hanya batas longgar — satu karakter ≥ satu byte.
 */
export const PASSWORD_MAX_LENGTH = 72;
/** Di atas syarat minimum, panjang yang paling menambah kekuatan (NIST SP 800-63B). */
export const PASSWORD_STRONG_LENGTH = 12;
export const PASSWORD_LETTER = /[a-zA-Z]/;
export const PASSWORD_DIGIT = /[0-9]/;

export type PasswordStrength = 'empty' | 'weak' | 'fair' | 'strong';

export interface PasswordAssessment {
  readonly strength: PasswordStrength;
  readonly length: boolean;
  readonly letter: boolean;
  readonly digit: boolean;
}

export function passwordByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function assessPassword(value: string): PasswordAssessment {
  const length = value.length >= PASSWORD_MIN_LENGTH && passwordByteLength(value) <= PASSWORD_MAX_LENGTH;
  const letter = PASSWORD_LETTER.test(value);
  const digit = PASSWORD_DIGIT.test(value);

  let strength: PasswordStrength = 'weak';
  if (!value) strength = 'empty';
  else if (length && letter && digit) strength = value.length >= PASSWORD_STRONG_LENGTH ? 'strong' : 'fair';

  return { strength, length, letter, digit };
}
