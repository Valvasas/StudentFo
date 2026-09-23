import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { dataMode } from '@/lib/env';
import { loginHref } from '@/lib/safe-redirect';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UserProfileRow } from '@/types/database';
import type { EducationLevel } from '@/types/domain';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: 'USER' | 'ADMIN';
  readonly educationLevel: EducationLevel | null;
  readonly major: string | null;
  readonly interests: readonly string[];
  /** 'email', 'google', … — halaman profil memakainya untuk tahu apakah ada kata sandi yang bisa diganti. */
  readonly providers: readonly string[];
}

/**
 * Pengguna yang sedang masuk, atau null.
 *
 * Dibungkus `cache()`: navbar, halaman, dan komponen lain memanggil ini di
 * request yang sama, dan tanpa dedupe setiap pemanggilan berarti satu
 * round-trip verifikasi token plus satu query profil.
 *
 * Memakai `getUser()`, BUKAN `getSession()`. `getSession()` hanya membaca
 * cookie dan mempercayai isinya apa adanya — cookie yang dikirim klien.
 * `getUser()` memverifikasi token ke server auth. Untuk keputusan otorisasi,
 * hanya yang kedua yang boleh dijadikan dasar.
 */
export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  if (dataMode === 'seed') return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role, education_level, major, interests')
    .eq('id', user.id)
    .maybeSingle<UserProfileRow>();

  const metadataName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null;

  return {
    id: user.id,
    email: user.email ?? '',
    // Baris profil bisa absen kalau trigger handle_new_user() melewati
    // insert (mis. email sudah dipakai baris lain). Sesi tetap sah, jadi
    // yang benar adalah menampilkan nama dari metadata — bukan melempar
    // error dan mengunci pengguna dari akunnya sendiri.
    fullName: profile?.full_name ?? metadataName ?? (user.email ?? '').split('@')[0] ?? 'Pengguna',
    role: profile?.role ?? 'USER',
    educationLevel: profile?.education_level ?? null,
    major: profile?.major ?? null,
    interests: profile?.interests ?? [],
    providers: user.app_metadata?.providers ?? (user.app_metadata?.provider ? [user.app_metadata.provider] : []),
  };
});

/** Profil dianggap lengkap kalau dua sinyal rekomendasi (§6) sudah terisi. */
export function isProfileComplete(user: AuthUser | null): boolean {
  return Boolean(user && user.educationLevel !== null && user.interests.length > 0);
}

/**
 * Untuk halaman yang mensyaratkan sesi. Mengembalikan pengguna atau
 * mengalihkan ke /login dengan tujuan kembali yang sudah divalidasi.
 */
export async function requireUser(returnTo: string): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) redirect(loginHref(returnTo));
  return user;
}

export type AdminGate =
  | { allowed: true; reason: 'demo' | 'admin'; userId: string | null }
  | { allowed: false; reason: 'unauthenticated' | 'not-admin' };

/**
 * Gerbang dasbor moderasi.
 *
 * CATATAN KONTRADIKSI BLUEPRINT: §8 menaruh dasbor admin di Phase 1,
 * sementara tabel `users` (satu-satunya tempat kolom `role` berada) baru
 * aktif di Phase 2. Sejak sistem akun aktif, jalur `admin` di bawah sudah
 * berlaku penuh; cabang `demo` tersisa khusus untuk mode data contoh, di
 * mana tidak ada data nyata yang bisa dirusak dan halamannya ditandai
 * terang-terangan sebagai pratinjau.
 */
export async function checkAdminAccess(): Promise<AdminGate> {
  if (dataMode === 'seed') {
    return { allowed: true, reason: 'demo', userId: null };
  }

  const user = await getSessionUser();
  if (!user) return { allowed: false, reason: 'unauthenticated' };
  if (user.role !== 'ADMIN') return { allowed: false, reason: 'not-admin' };

  return { allowed: true, reason: 'admin', userId: user.id };
}
