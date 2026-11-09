import { formText, formTrimmed } from '@/lib/form-data';
import { cleanText } from '@/lib/registration-form';
import { PROFILE_VISIBILITIES, type ProfileVisibility } from '@/types/domain';

/**
 * Username, bio, dan keterlihatan profil (ADR-077). Aturan bentuk HARUS sama
 * dengan CHECK `users_username_shape` di migration 20261109100001 (dikunci
 * `profile-identity.test.ts`): 3–30 karakter huruf kecil/angka/titik/garis
 * bawah, diawali & diakhiri huruf/angka, tanpa tanda baca berurutan.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$/;
export const USERNAME_LIMITS = { min: 3, max: 30 } as const;
export const BIO_MAX = 280;

/** Nama yang bisa disalahpahami sebagai akun resmi/sistem. */
export const RESERVED_USERNAMES: readonly string[] = [
  'admin',
  'administrator',
  'moderator',
  'studentfo',
  'support',
  'bantuan',
  'api',
  'root',
  'system',
  'official',
  'resmi',
  'help',
  'null',
  'undefined',
];

/** "@Rani.P " → "rani.p" — orang mengetik dengan @ dan huruf besar; yang disimpan selalu bentuk ini. */
export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value) && !/[._]{2}/.test(value) && !RESERVED_USERNAMES.includes(value);
}

/**
 * Saran dari nama lengkap: "Rani Prameswari" → "rani.prameswari". Huruf
 * beraksen disederhanakan, sisa karakter dibuang. Bukan jaminan tersedia —
 * keunikan diperiksa database saat menyimpan.
 */
export function suggestUsername(fullName: string): string {
  const base = fullName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, USERNAME_LIMITS.max)
    .replace(/\.+$/, '');
  const candidate = base.length >= USERNAME_LIMITS.min ? base : `${base || 'pengguna'}.sf`;
  return isValidUsername(candidate) ? candidate : `${candidate.replace(/[._]+$/, '')}1`.slice(0, USERNAME_LIMITS.max);
}

export function isProfileVisibility(value: unknown): value is ProfileVisibility {
  return typeof value === 'string' && (PROFILE_VISIBILITIES as readonly string[]).includes(value);
}

export interface ProfileIdentityInput {
  readonly username: string | null;
  readonly bio: string | null;
  readonly visibility: ProfileVisibility;
}

export type ProfileIdentityProblem = 'invalid_username' | 'invalid_bio';

export function parseProfileIdentity(formData: FormData): { ok: true; value: ProfileIdentityInput } | { ok: false; problem: ProfileIdentityProblem } {
  const username = normalizeUsername(formTrimmed(formData, 'username'));
  if (username && !isValidUsername(username)) return { ok: false, problem: 'invalid_username' };
  const bio = cleanText(formText(formData, 'bio'));
  if (bio.length > BIO_MAX) return { ok: false, problem: 'invalid_bio' };
  const visibility = formText(formData, 'profileVisibility');
  return {
    ok: true,
    value: { username: username || null, bio: bio || null, visibility: isProfileVisibility(visibility) ? visibility : 'MEMBERS' },
  };
}

/** Alamat profil: `/u/<username>` bila ada, selain itu `/orang/<id>` (tetap berlaku, dialihkan bila username dipasang). */
export function profileHref(person: { readonly userId: string; readonly username?: string | null }): string {
  return person.username ? `/u/${person.username}` : `/orang/${person.userId}`;
}
