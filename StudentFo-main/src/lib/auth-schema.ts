import { z } from 'zod';
import { EDUCATION_LEVELS } from '@/types/domain';

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
 * Supabase Auth — memotong masukan di 72 byte. Tanpa batas ini, dua kata
 * sandi berbeda yang 72 karakter pertamanya sama akan sama-sama diterima,
 * dan pengguna tidak pernah diberi tahu.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Kata sandi minimal 8 karakter.')
  .max(72, 'Kata sandi maksimal 72 karakter.')
  .regex(/[a-zA-Z]/, 'Kata sandi harus memuat setidaknya satu huruf.')
  .regex(/[0-9]/, 'Kata sandi harus memuat setidaknya satu angka.');

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

export const signUpSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

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
