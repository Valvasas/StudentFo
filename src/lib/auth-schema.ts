import { z } from 'zod';
import { EDUCATION_LEVELS } from '@/types/domain';
import { PASSWORD_DIGIT, PASSWORD_LETTER, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordByteLength } from './password-rules';

/**
 * Aturan validasi form akun.
 *
 * Sengaja dipisah dari `auth.ts` (yang `server-only`) supaya bisa diuji
 * tanpa menyalakan runtime React Server Component.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  // 254 adalah batas panjang alamat email menurut RFC 5321. Kolom
  // `users.email` juga VARCHAR(255).
  .max(254, 'Alamat email terlalu panjang.')
  .email('Format email belum benar.');

/**
 * Panjang minimum 8 mengikuti NIST SP 800-63B: panjang jauh lebih menentukan
 * daripada aturan "wajib ada simbol", yang justru mendorong pola tertebak
 * seperti "Password1!".
 *
 * Batas ATAS 72 bukan pilihan desain: bcrypt — algoritma yang dipakai
 * Supabase Auth — memotong masukan di 72 byte, dan GoTrue menolak yang lebih
 * panjang. Dihitung dalam byte UTF-8, bukan karakter: tanpa itu 57 huruf
 * beraksen lolos di sini lalu ditolak Supabase dengan error yang tak jelas.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`)
  .regex(PASSWORD_LETTER, 'Kata sandi harus memuat setidaknya satu huruf.')
  .regex(PASSWORD_DIGIT, 'Kata sandi harus memuat setidaknya satu angka.')
  .refine(
    (value) => passwordByteLength(value) <= PASSWORD_MAX_LENGTH,
    `Kata sandi terlalu panjang: maksimal ${PASSWORD_MAX_LENGTH} karakter, dan huruf beraksen atau emoji dihitung lebih dari satu.`,
  );

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Nama minimal 2 karakter.')
  .max(120, 'Nama maksimal 120 karakter.')
  // Rapikan spasi ganda supaya "Budi   Santoso" tidak tersimpan apa adanya.
  .transform((value) => value.replace(/\s+/g, ' '));

export const signInSchema = z.object({
  email: emailSchema,
  // Saat MASUK, kata sandi tidak divalidasi terhadap aturan kekuatan —
  // hanya dicek tidak kosong. Akun lama yang dibuat sebelum aturan berubah
  // tetap harus bisa masuk; yang menolak kredensial salah adalah server auth.
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
});

/**
 * Jenis akun yang dipilih saat daftar. Hanya menentukan tujuan pertama
 * setelah konfirmasi dan disimpan di user metadata sebagai catatan —
 * BUKAN izin: status penyelenggara tetap lewat pengajuan & verifikasi admin.
 */
export const ACCOUNT_TYPES = ['participant', 'organizer'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function parseAccountType(value: unknown): AccountType | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (ACCOUNT_TYPES as readonly unknown[]).includes(raw) ? (raw as AccountType) : null;
}

/** Nilai kotak centang persetujuan S&K + Kebijakan privasi di form daftar. */
export const PRIVACY_CONSENT_VALUE = 'yes';
/**
 * Nilai kotak centang pernyataan usia (≥ 18, atau 13–17 dengan izin orang
 * tua/wali — UU PDP Pasal 25, PP 17/2025). Terpisah dari persetujuan: UU PDP
 * Pasal 22 meminta persetujuan bisa dibedakan jelas dari pernyataan lain.
 */
export const AGE_CONFIRM_VALUE = 'yes';

export const signUpSchema = z.object({
  accountType: z.enum(ACCOUNT_TYPES),
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  ageConfirm: z.literal(AGE_CONFIRM_VALUE, {
    errorMap: () => ({ message: 'Konfirmasi usiamu untuk membuat akun.' }),
  }),
  privacyConsent: z.literal(PRIVACY_CONSENT_VALUE, {
    errorMap: () => ({ message: 'Setujui Syarat & Ketentuan dan Kebijakan privasi untuk membuat akun.' }),
  }),
});

/**
 * Tujuan pertama setelah akun aktif. Penyelenggara selalu ke studio, tempat
 * pengajuan verifikasinya dimulai; peserta ke `next` (sudah lolos
 * `safeNextPath`), yang bawaannya beranda pribadi — di sana ada ajakan
 * mengisi minat & jenjang dan sambutan `email_confirmed`.
 */
export function postSignUpPath(accountType: AccountType, next: string): string {
  return accountType === 'organizer' ? '/penyelenggara' : next;
}

export const resetRequestSchema = z.object({
  email: emailSchema,
});

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Konfirmasi kata sandi tidak sama.',
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Konfirmasi kata sandi tidak sama.',
  })
  .refine((value) => value.password !== value.currentPassword, {
    path: ['password'],
    message: 'Kata sandi baru harus berbeda dari yang sekarang.',
  });

export const profileSchema = z.object({
  fullName: fullNameSchema,
  educationLevel: z.enum(EDUCATION_LEVELS).nullable(),
  major: z.string().trim().max(100, 'Jurusan maksimal 100 karakter.').nullable(),
  // Minat disimpan sebagai slug kategori supaya `categoryMatch()` di
  // recommendation.ts membandingkan nilai yang identik dengan
  // `EventSummary.categorySlugs` — bukan label bebas yang tidak pernah cocok.
  interests: z.array(z.string().regex(/^[a-z0-9-]{1,50}$/)).max(12),
});

/** Pesan pertama untuk sebuah field, atau undefined kalau field itu lolos. */
export function firstIssue(error: z.ZodError, path: string): string | undefined {
  return error.issues.find((issue) => issue.path[0] === path)?.message;
}
