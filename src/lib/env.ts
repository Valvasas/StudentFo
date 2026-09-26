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
  /** Opt-in eksplisit untuk menjalankan mode demo di build produksi (mis. situs pratinjau). */
  ALLOW_DEMO_IN_PRODUCTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Penanda tangan cookie sesi demo. Opsional; wajib kalau demo jalan di >1 instance. */
  DEMO_SESSION_SECRET: z.string().min(32).optional(),
  /** Kunci HMAC untuk ember pembatas laju (IP tidak pernah disimpan mentah). */
  RATE_LIMIT_SECRET: z.string().min(32).optional(),
  /**
   * Cloudflare Turnstile di /submit. Keduanya diisi, atau keduanya kosong (CAPTCHA mati).
   * Sengaja TANPA awalan NEXT_PUBLIC_: nilai berawalan itu dibekukan saat build,
   * padahal kunci ini hanya dibaca server dan harus bisa diganti tanpa build ulang.
   */
  TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
}).refine(
  (value) => Boolean(value.TURNSTILE_SITE_KEY) === Boolean(value.TURNSTILE_SECRET_KEY),
  {
    // Setengah terkonfigurasi = widget tampil tapi server tidak bisa
    // memverifikasi (semua kiriman ditolak), atau sebaliknya CAPTCHA diam-diam mati.
    message: 'TURNSTILE_SITE_KEY dan TURNSTILE_SECRET_KEY harus diisi berpasangan.',
    path: ['TURNSTILE_SECRET_KEY'],
  },
);

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
    ALLOW_DEMO_IN_PRODUCTION: process.env.ALLOW_DEMO_IN_PRODUCTION || undefined,
    DEMO_SESSION_SECRET: process.env.DEMO_SESSION_SECRET || undefined,
    RATE_LIMIT_SECRET: process.env.RATE_LIMIT_SECRET || undefined,
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY || undefined,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || undefined,
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

export type DataMode = 'supabase' | 'seed';

export interface DataModeInput {
  readonly supabaseUrl: string | undefined;
  readonly anonKey: string | undefined;
  readonly nodeEnv: ServerEnv['NODE_ENV'];
  readonly allowDemoInProduction: boolean;
  /** `process.env.NEXT_PHASE`; saat `next build` bernilai 'phase-production-build'. */
  readonly nextPhase: string | undefined;
}

/**
 * 'supabase' hanya kalau URL + anon key dua-duanya ada. Setengah
 * terkonfigurasi lebih berbahaya daripada tidak terkonfigurasi: klien
 * terbentuk, lalu setiap query gagal dengan 401 yang membingungkan.
 *
 * PENGAMAN PRODUKSI: sebelumnya server produksi yang kehilangan env
 * Supabase diam-diam jatuh ke mode seed — situs publik menampilkan
 * kegiatan fiktif dengan tenggat fiktif, dan tidak ada log yang berteriak.
 * Sekarang kondisi itu melempar error, kecuali mode demo memang diminta
 * secara eksplisit lewat ALLOW_DEMO_IN_PRODUCTION=true (situs pratinjau,
 * job CI aksesibilitas). Fase `next build` dikecualikan karena build
 * memang berjalan dengan NODE_ENV=production tanpa perlu kredensial.
 */
export function resolveDataMode(input: DataModeInput): DataMode {
  if (input.supabaseUrl && input.anonKey) return 'supabase';

  const isRuntimeProduction =
    input.nodeEnv === 'production' && input.nextPhase !== 'phase-production-build';

  if (isRuntimeProduction && !input.allowDemoInProduction) {
    throw new Error(
      'Kredensial Supabase kosong di produksi. Isi NEXT_PUBLIC_SUPABASE_URL & ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY, atau set ALLOW_DEMO_IN_PRODUCTION=true ' +
        'kalau deploy ini memang situs demo berdata fiktif.',
    );
  }

  return 'seed';
}

export const dataMode: DataMode = resolveDataMode({
  supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  nodeEnv: env.NODE_ENV,
  allowDemoInProduction: env.ALLOW_DEMO_IN_PRODUCTION,
  nextPhase: process.env.NEXT_PHASE,
});

export const siteUrl = env.NEXT_PUBLIC_SITE_URL;
