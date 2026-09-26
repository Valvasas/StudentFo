import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Klien Supabase untuk Server Component / Route Handler.
 * Memakai anon key dan MENGHORMATI RLS — inilah jalur normal semua
 * pembacaan data publik. Sesi user dibawa lewat cookie, jadi klien yang
 * sama otomatis jadi "klien terautentikasi" begitu Phase 2 aktif.
 */
export async function createSupabaseServerClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL & ANON_KEY.');
  }

  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component tidak boleh menulis cookie. Ini bukan kondisi
          // error: middleware yang bertugas menyegarkan sesi. Diabaikan
          // dengan sadar, bukan ditelan diam-diam.
        }
      },
    },
  });
}

/**
 * Klien anon TANPA cookie untuk data publik yang di-cache lintas pengunjung.
 * Di dalam `unstable_cache` memanggil `cookies()` dilarang (dan hasilnya akan
 * bocor antarpengguna), jadi query publik tidak boleh membawa sesi siapa pun.
 * RLS untuk anon dan pengguna biasa identik di data katalog.
 */
export function createSupabasePublicClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL & ANON_KEY.');
  }

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => undefined },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Klien service_role — BYPASS RLS.
 *
 * Hanya untuk pipeline scraper dan aksi admin yang sudah diverifikasi di
 * sisi server. Fungsi ini `server-only`; kalau ada berkas client yang
 * mengimpornya, build akan GAGAL. Itu disengaja: kunci ini setara akses
 * penuh ke seluruh database, dan satu impor ceroboh saja sudah cukup
 * untuk mengirimnya ke browser.
 */
export function createSupabaseAdminClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diset untuk operasi admin.');
  }

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => undefined },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
