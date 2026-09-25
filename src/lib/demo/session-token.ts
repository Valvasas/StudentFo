import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { EDUCATION_LEVELS } from '@/types/domain';
import { DEMO_PERSONA_IDS } from './personas';

/**
 * Token sesi demo: `base64url(JSON) + "." + base64url(HMAC-SHA256)`.
 *
 * KENAPA DITANDATANGANI padahal datanya fiktif: tanpa tanda tangan, siapa pun
 * bisa mengedit cookie menjadi `role: "ADMIN"`. Di mode demo itu murah, tapi
 * gerbang admin yang bisa ditembus dengan DevTools mengajarkan pola yang
 * salah — dan mode demo inilah yang dibaca kontributor untuk memahami alur
 * otorisasi produk. Perilakunya harus setara dengan produksi.
 *
 * KENAPA PROFIL DISIMPAN DI TOKEN, bukan di memori server: token bersifat
 * stateless, jadi profil bertahan saat server dev di-reload atau saat demo
 * berjalan di beberapa instance serverless. Ukurannya dibatasi skema.
 *
 * Modul ini murni (tanpa `cookies()`), sehingga bisa diuji deterministik.
 */

export const DEMO_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_VERSION = 1;

export const demoSessionSchema = z.object({
  v: z.literal(TOKEN_VERSION),
  /** UUID acak per login: isolasi data simpan/tracker antarpengunjung. */
  uid: z.string().uuid(),
  persona: z.enum(DEMO_PERSONA_IDS),
  role: z.enum(['USER', 'ADMIN']),
  fullName: z.string().trim().min(1).max(100),
  educationLevel: z.enum(EDUCATION_LEVELS).nullable(),
  major: z.string().max(100).nullable(),
  interests: z.array(z.string().regex(/^[a-z0-9-]{1,50}$/)).max(12),
  /** Detik epoch saat token diterbitkan. */
  iat: z.number().int().nonnegative(),
});

export type DemoSession = z.infer<typeof demoSessionSchema>;

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function encodeDemoSession(session: DemoSession, secret: string): string {
  const body = Buffer.from(JSON.stringify(demoSessionSchema.parse(session))).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/**
 * null untuk SEGALA bentuk token yang tidak sah: format rusak, tanda tangan
 * salah, JSON rusak, skema tidak cocok, kedaluwarsa, atau iat di masa depan.
 * Pemanggil cukup memperlakukannya sebagai "belum masuk".
 */
export function decodeDemoSession(
  token: string | undefined | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): DemoSession | null {
  if (!token || token.length > 4096) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];

  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  // Panjang dicek dulu: timingSafeEqual melempar kalau panjangnya beda.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const parsed = demoSessionSchema.safeParse(raw);
  if (!parsed.success) return null;

  const age = nowSeconds - parsed.data.iat;
  // Toleransi 60 detik untuk jam server yang sedikit bergeser.
  if (age < -60 || age > DEMO_SESSION_MAX_AGE_SECONDS) return null;

  return parsed.data;
}
