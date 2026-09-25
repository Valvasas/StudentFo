'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { mapSupabaseAuthError, type AuthErrorCode } from '@/lib/auth-messages';
import {
  changePasswordSchema,
  newPasswordSchema,
  resetRequestSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/auth-schema';
import { isDemoPersonaId } from '@/lib/demo/personas';
import { endDemoSession, startDemoSession } from '@/lib/demo/session';
import { dataMode, siteUrl } from '@/lib/env';
import { formText as field } from '@/lib/form-data';
import { safeNextPath } from '@/lib/safe-redirect';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Aksi akun.
 *
 * Semuanya mengembalikan `void` dan melaporkan hasil lewat redirect
 * berparameter, bukan lewat nilai balik yang perlu dibaca `useActionState`.
 * Konsekuensinya disengaja: seluruh alur masuk/daftar/atur-ulang tetap
 * berfungsi penuh tanpa JavaScript, sama seperti filter di /events.
 *
 * `redirect()` melempar secara internal, jadi ia SELALU dipanggil di luar
 * try/catch — kalau tidak, blok catch akan menangkapnya dan navigasinya
 * batal tanpa jejak.
 */

function authHref(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Email dikembalikan ke form supaya tidak perlu diketik ulang; dipotong sepanjang batas RFC. */
function echoEmail(raw: string): string | undefined {
  const trimmed = raw.trim().slice(0, 254);
  return trimmed || undefined;
}

function callbackUrl(next: string): string {
  return `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signInAction(formData: FormData): Promise<void> {
  const next = safeNextPath(field(formData, 'next'));
  const email = field(formData, 'email');
  let failure: AuthErrorCode | null = null;

  if (dataMode === 'seed') {
    failure = 'unavailable';
  } else {
    const parsed = signInSchema.safeParse({ email, password: field(formData, 'password') });

    if (!parsed.success) {
      // Kegagalan validasi bentuk email dipetakan ke pesan yang SAMA dengan
      // kredensial salah. Membedakannya akan memberi tahu penyerang bahwa
      // alamat yang dia coba setidaknya berformat benar — sinyal kecil yang
      // mempercepat penyusunan daftar target.
      failure = 'invalid_credentials';
    } else {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) failure = mapSupabaseAuthError(error);
    }
  }

  if (failure) {
    redirect(
      authHref('/login', {
        error: failure,
        email: echoEmail(email),
        next: next === '/' ? undefined : next,
      }),
    );
  }

  // Navbar dirender di layout dan ikut ter-cache di router klien; tanpa
  // revalidasi, pengguna yang baru masuk masih melihat tombol "Masuk".
  revalidatePath('/', 'layout');
  redirect(next);
}

export async function signUpAction(formData: FormData): Promise<void> {
  const next = safeNextPath(field(formData, 'next'));
  const email = field(formData, 'email');
  let failure: AuthErrorCode | null = null;
  let hasSession = false;

  if (dataMode === 'seed') {
    failure = 'unavailable';
  } else {
    const parsed = signUpSchema.safeParse({
      fullName: field(formData, 'fullName'),
      email,
      password: field(formData, 'password'),
    });

    if (!parsed.success) {
      failure = 'validation';
    } else {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          // Dibaca trigger handle_new_user() untuk mengisi users.full_name.
          data: { full_name: parsed.data.fullName },
          emailRedirectTo: callbackUrl(next),
        },
      });

      if (error) {
        failure = mapSupabaseAuthError(error);
      } else {
        hasSession = data.session !== null;
      }
    }
  }

  if (failure) {
    redirect(authHref('/register', { error: failure, email: echoEmail(email) }));
  }

  // Kalau konfirmasi email dimatikan di project Supabase, signUp langsung
  // memberi sesi dan pengguna tidak perlu dilempar ke halaman "cek email".
  if (hasSession) {
    revalidatePath('/', 'layout');
    redirect(next);
  }

  // TIDAK ada percabangan untuk "email sudah terdaftar" di sini, meski
  // Supabase menandainya lewat `identities: []`. Menampilkan pesan berbeda
  // untuk kasus itu mengubah halaman daftar jadi alat pemeriksa keanggotaan:
  // ketik email siapa pun, baca balasannya, tahu dia punya akun atau tidak.
  redirect(authHref('/login', { notice: 'check_email', email: echoEmail(email) }));
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const next = safeNextPath(field(formData, 'next'));
  let destination: string | null = null;
  let failure: AuthErrorCode | null = null;

  if (dataMode === 'seed') {
    failure = 'unavailable';
  } else {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(next) },
    });

    // Di Server Action, signInWithOAuth TIDAK mengalihkan browser sendiri —
    // ia mengembalikan URL consent Google dan menulis code verifier PKCE ke
    // cookie. Pengalihannya urusan kita.
    if (error || !data.url) {
      failure = error ? mapSupabaseAuthError(error) : 'unknown';
    } else {
      destination = data.url;
    }
  }

  if (failure) {
    redirect(authHref('/login', { error: failure, next: next === '/' ? undefined : next }));
  }

  redirect(destination!);
}

/**
 * Masuk sebagai persona demo — HANYA di mode seed.
 *
 * Di mode Supabase aksi ini sengaja menolak (bukan diam-diam lolos):
 * Server Action bisa dipanggil langsung, jadi tombolnya disembunyikan saja
 * tidak cukup untuk mencegah siapa pun membuat sesi admin palsu.
 */
export async function demoSignInAction(formData: FormData): Promise<void> {
  const next = safeNextPath(field(formData, 'next'));
  const persona = field(formData, 'persona');

  if (dataMode !== 'seed' || !isDemoPersonaId(persona)) {
    redirect(authHref('/login', { error: dataMode === 'seed' ? 'validation' : 'unknown' }));
  }

  await startDemoSession(persona);
  revalidatePath('/', 'layout');
  redirect(persona === 'admin' && next === '/' ? '/admin' : next);
}

export async function signOutAction(): Promise<void> {
  if (dataMode === 'seed') {
    await endDemoSession();
  } else {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const email = field(formData, 'email');
  let failure: AuthErrorCode | null = null;

  if (dataMode === 'seed') {
    failure = 'unavailable';
  } else {
    const parsed = resetRequestSchema.safeParse({ email });
    if (parsed.success) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
      });
      // Hanya pembatasan laju yang dilaporkan apa adanya — informasinya soal
      // perilaku kita, bukan soal keberadaan akun, dan tanpa itu pengguna
      // yang kena limit akan terus menekan tombol tanpa tahu apa yang salah.
      if (error && mapSupabaseAuthError(error) === 'rate_limited') failure = 'rate_limited';
    }
    // Email tidak valid atau tidak terdaftar tetap berujung pada pesan yang
    // sama persis. Halaman "lupa sandi" adalah tempat paling klasik untuk
    // memanen daftar alamat yang terdaftar.
  }

  if (failure) {
    redirect(authHref('/forgot-password', { error: failure, email: echoEmail(email) }));
  }

  redirect(authHref('/forgot-password', { notice: 'reset_email_sent' }));
}

export async function updatePasswordAction(formData: FormData): Promise<void> {
  let failure: AuthErrorCode | null = null;

  if (dataMode === 'seed') {
    failure = 'unavailable';
  } else {
    const parsed = newPasswordSchema.safeParse({
      password: field(formData, 'password'),
      confirmPassword: field(formData, 'confirmPassword'),
    });

    if (!parsed.success) {
      failure = 'validation';
    } else {
      const supabase = await createSupabaseServerClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        // Halaman ini hanya bisa dibuka lewat tautan pemulihan yang sudah
        // ditukar jadi sesi. Tanpa sesi, permintaannya tidak sah.
        failure = 'invalid_link';
      } else {
        const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
        if (error) {
          failure = mapSupabaseAuthError(error);
        } else {
          // Standar industri setelah kata sandi berganti: cabut sesi di
          // perangkat lain. Kalau akun ini dibajak, mengganti kata sandi
          // saja tidak mengusir penyerang yang sesinya masih hidup.
          await supabase.auth.signOut({ scope: 'others' });
        }
      }
    }
  }

  if (failure) {
    redirect(authHref('/reset-password', { error: failure }));
  }

  revalidatePath('/', 'layout');
  redirect(authHref('/profile', { notice: 'password_updated' }));
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  let failure: AuthErrorCode | null = null;

  if (dataMode === 'seed') {
    failure = 'unavailable';
  } else {
    const parsed = changePasswordSchema.safeParse({
      currentPassword: field(formData, 'currentPassword'),
      password: field(formData, 'password'),
      confirmPassword: field(formData, 'confirmPassword'),
    });

    if (!parsed.success) {
      failure = 'validation';
    } else {
      const supabase = await createSupabaseServerClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user?.email) {
        failure = 'session_missing';
      } else {
        // Kata sandi lama diverifikasi ulang sebelum diganti. Tanpa langkah
        // ini, laptop yang ditinggal terbuka di perpustakaan cukup untuk
        // mengambil alih akun secara permanen.
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: userData.user.email,
          password: parsed.data.currentPassword,
        });

        if (reauthError) {
          failure = 'invalid_credentials';
        } else {
          const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
          if (error) {
            failure = mapSupabaseAuthError(error);
          } else {
            await supabase.auth.signOut({ scope: 'others' });
          }
        }
      }
    }
  }

  if (failure) {
    redirect(authHref('/profile', { error: failure }));
  }

  revalidatePath('/', 'layout');
  redirect(authHref('/profile', { notice: 'password_updated' }));
}
