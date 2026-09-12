import { z } from 'zod';

/**
 * Validasi environment variable di satu tempat.
 *
 * Kenapa tidak `process.env.X!` di titik pakai: kalau satu variabel salah
 * ketik, aplikasi gagal jauh dari sumber masalah (biasanya berupa error
 * jaringan aneh saat runtime di production). Di sini kesalahan terdeteksi
 * sekali, di satu tempat, dengan pesan yang menyebut nama variabelnya.
 *
 * `.optional()` di semua kunci Supabase adalah keputusan sadar: aplikasi
 * WAJIB tetap bisa jalan tanpa backend sama sekali (mode seed) supaya
 * onboarding kontributor baru = `npm install && npm run dev`, titik.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ServerEnv = z.infer<typeof serverSchema>;

function readEnv(): ServerEnv {
  // Next.js mengganti `process.env.NEXT_PUBLIC_*` secara statis saat build,
  // jadi variabel harus disebut satu per satu — destructuring dinamis
  // (`process.env[key]`) akan menghasilkan undefined di bundle client.
  const parsed = serverSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Konfigurasi environment tidak valid:\n${detail}`);
  }

  return parsed.data;
}

export const env: ServerEnv = readEnv();

/**
 * 'supabase' hanya kalau URL + anon key dua-duanya ada. Setengah
 * terkonfigurasi lebih berbahaya daripada tidak terkonfigurasi: klien
 * terbentuk, lalu setiap query gagal dengan 401 yang membingungkan.
 */
export type DataMode = 'supabase' | 'seed';

export const dataMode: DataMode =
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'supabase' : 'seed';

export const siteUrl = env.NEXT_PUBLIC_SITE_URL;
