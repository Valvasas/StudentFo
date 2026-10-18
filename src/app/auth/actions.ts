'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isPerAddressEmailThrottle, mapSupabaseAuthError, type AuthErrorCode } from '@/lib/auth-messages';
import {
  changePasswordSchema,
  firstIssue,
  newPasswordSchema,
  parseAccountType,
  postSignUpPath,
  PRIVACY_CONSENT_VALUE,
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  type AccountType,
} from '@/lib/auth-schema';
import { seedDemoNetwork, seedDemoOrganizer, seedDemoPortfolio } from '@/lib/data';
import { DEMO_PERSONAS, isDemoPersonaId } from '@/lib/demo/personas';
import { endDemoSession, startDemoSession } from '@/lib/demo/session';
import { dataMode, siteUrl } from '@/lib/env';
import { formText as field } from '@/lib/form-data';
import { PASSWORD_MAX_LENGTH, passwordByteLength } from '@/lib/password-rules';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { currentClientIp, isAccountRateLimited, isRateLimited, passesCaptcha } from '@/lib/rate-limit-server';
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

/**
 * Sandi > 72 byte UTF-8 (batas bcrypt) diberi kode sendiri: "Ada isian yang
 * belum benar" tidak memberi tahu bahwa huruf beraksen/emoji dihitung ganda.
 */
function passwordFailure(password: string): AuthErrorCode {
  return passwordByteLength(password) > PASSWORD_MAX_LENGTH ? 'password_too_long' : 'validation';
}

/** Kembali ke /register dengan pilihan jenis akun & tujuan tetap utuh. */
function registerHref(failure: AuthErrorCode, email: string, accountType: AccountType | null, next: string): string {
  return authHref('/register', {
    error: failure,
    email: echoEmail(email),
    type: accountType === 'organizer' ? accountType : undefined,
    next: next === '/' ? undefined : next,
  });
}

/**
 * Batas laju kita sendiri, SEBELUM memanggil Supabase Auth. Panggilan auth
 * berasal dari server Next.js, jadi batas per-IP bawaan Supabase melihat satu
 * IP untuk semua pengguna: tanpa lapisan ini, satu penyerang yang menebak
 * sandi menghabiskan kuota masuk seluruh pengguna (ADR-028).
 */
async function signInRateLimited(email: string): Promise<boolean> {
  return isRateLimited(await currentClientIp(), [
    [RATE_LIMITS.signInPerIp],
    [RATE_LIMITS.signInPerIpEmail, email.trim().toLowerCase()],
  ]);
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
    } else if (await signInRateLimited(parsed.data.email)) {
      failure = 'rate_limited';
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
  const accountType = parseAccountType(field(formData, 'accountType'));
  const destination = postSignUpPath(accountType ?? 'participant', next);
  let failure: AuthErrorCode | null = null;
  let hasSession = false;

  if (dataMode === 'seed') {
    failure = 'unavailable';
  } else {
    const parsed = signUpSchema.safeParse({
      accountType: field(formData, 'accountType'),
      fullName: field(formData, 'fullName'),
      email,
      password: field(formData, 'password'),
      privacyConsent: field(formData, 'privacyConsent'),
    });
    const ip = await currentClientIp();

    if (!parsed.success) {
      failure = firstIssue(parsed.error, 'privacyConsent') ? 'consent_required' : passwordFailure(field(formData, 'password'));
    } else if (await isRateLimited(ip, [[RATE_LIMITS.signUpPerIp]])) {
      failure = 'rate_limited';
    } else if (!(await passesCaptcha(formData, ip))) {
      // Setelah pembatas laju (pola /submit): banjir dari satu mesin tidak
      // ikut menghabiskan kuota verifikasi Turnstile.
      failure = 'captcha_failed';
    } else {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          // full_name dibaca trigger handle_new_user(). account_type hanya
          // catatan: user metadata bisa diubah pemiliknya sendiri, jadi tidak
          // pernah dipakai untuk izin apa pun.
          data: { full_name: parsed.data.fullName, account_type: parsed.data.accountType },
          emailRedirectTo: callbackUrl(destination),
        },
      });

      if (error && isPerAddressEmailThrottle(error)) {
        // Dua pendaftaran beruntun untuk alamat yang sama akan membedakan
        // "sudah punya akun" dari "baru" lewat jeda ini — jatuh ke halaman
        // "cek email" yang seragam, seperti lupa sandi & kirim ulang.
        console.error('[auth] daftar: jeda per alamat dari Supabase:', error.code ?? error.status);
      } else if (error) {
        failure = mapSupabaseAuthError(error);
      } else {
        hasSession = data.session !== null;
      }
    }
  }

  if (failure) {
    redirect(registerHref(failure, email, accountType, next));
  }

  // Kalau konfirmasi email dimatikan di project Supabase, signUp langsung
  // memberi sesi dan pengguna tidak perlu dilempar ke halaman "cek email".
  if (hasSession) {
    revalidatePath('/', 'layout');
    redirect(destination);
  }

  // TIDAK ada percabangan untuk "email sudah terdaftar" di sini, meski
  // Supabase menandainya lewat `identities: []`. Menampilkan pesan berbeda
  // untuk kasus itu mengubah halaman daftar jadi alat pemeriksa keanggotaan:
  // ketik email siapa pun, baca balasannya, tahu dia punya akun atau tidak.
  redirect(authHref('/verify-email', { email: echoEmail(email), next: destination === '/' ? undefined : destination }));
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  // Dari /register tombol Google berada di form daftar yang sama, jadi ikut
  // mengirim jenis akun & persetujuan; dari /login keduanya tidak ada.
  const accountType = parseAccountType(field(formData, 'accountType'));
  const requested = safeNextPath(field(formData, 'next'));
  const next = accountType ? postSignUpPath(accountType, requested) : requested;
  let destination: string | null = null;
  let failure: AuthErrorCode | null = null;

  if (dataMode === 'seed') {
    failure = 'unavailable';
  } else if (accountType && field(formData, 'privacyConsent') !== PRIVACY_CONSENT_VALUE) {
    failure = 'consent_required';
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
    redirect(
      accountType
        ? registerHref(failure, field(formData, 'email'), accountType, requested)
        : authHref('/login', { error: failure, next: next === '/' ? undefined : next }),
    );
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

  const uid = await startDemoSession(persona);
  if (persona === 'mahasiswa') {
    seedDemoNetwork(uid);
    seedDemoPortfolio(uid);
  }
  if (persona === 'penyelenggara') {
    seedDemoOrganizer({ id: uid, fullName: DEMO_PERSONAS.penyelenggara.fullName, email: `${persona}@demo.studentfo.local` });
  }
  revalidatePath('/', 'layout');
  const landing = persona === 'admin' ? '/admin' : persona === 'penyelenggara' ? '/penyelenggara' : null;
  redirect(landing && next === '/' ? landing : next);
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
    const ip = await currentClientIp();
    // Dihitung per IP untuk SETIAP permintaan, valid atau tidak — kalau hanya
    // email valid yang dihitung, lama respons membedakan keduanya.
    if (await isRateLimited(ip, [[RATE_LIMITS.passwordResetPerIp]])) {
      failure = 'rate_limited';
    } else if (!(await passesCaptcha(formData, ip))) {
      failure = 'captcha_failed';
    } else if (parsed.success) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
      });
      // Jeda per alamat dari Supabase TIDAK diteruskan: GoTrue hanya
      // memasangnya untuk akun yang ada (ADR-011, diperketat ADR-056); email
      // pertama sudah terkirim. Batas yang tidak bergantung alamat tetap
      // dilaporkan supaya orang tahu harus mencoba lagi.
      if (error && !isPerAddressEmailThrottle(error)) {
        const code = mapSupabaseAuthError(error);
        if (code === 'rate_limited') failure = code;
        else console.error('[auth] permintaan atur ulang sandi gagal:', error.code ?? error.status);
      }
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

export async function resendConfirmationAction(formData: FormData): Promise<void> {
  const email = field(formData, 'email');
  const next = safeNextPath(field(formData, 'next'));
  let failure: AuthErrorCode | null = null;

  if (dataMode === 'seed') {
    failure = 'unavailable';
  } else {
    const ip = await currentClientIp();
    if (await isRateLimited(ip, [[RATE_LIMITS.resendConfirmationPerIp]])) {
      failure = 'rate_limited';
    } else if (!(await passesCaptcha(formData, ip))) {
      failure = 'captcha_failed';
    } else {
      const parsed = resetRequestSchema.safeParse({ email });
      if (parsed.success) {
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: parsed.data.email,
          options: { emailRedirectTo: callbackUrl(next) },
        });
        // Jeda kirim ulang per alamat hanya berlaku untuk akun yang ada &
        // belum dikonfirmasi — meneruskannya membuka oracle keanggotaan.
        // Batas yang tidak bergantung alamat tetap dilaporkan.
        if (error && !isPerAddressEmailThrottle(error)) {
          const code = mapSupabaseAuthError(error);
          if (code === 'rate_limited') failure = code;
          else console.error('[auth] kirim ulang konfirmasi gagal:', error.code ?? error.status);
        }
      }
    }
  }

  const keep = { email: echoEmail(email), next: next === '/' ? undefined : next };
  if (failure) redirect(authHref('/verify-email', { error: failure, ...keep }));
  redirect(authHref('/verify-email', { notice: 'confirmation_resent', ...keep }));
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
      failure = passwordFailure(field(formData, 'password'));
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
  redirect(authHref('/profile/settings', { notice: 'password_updated' }));
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
      failure = passwordFailure(field(formData, 'password'));
    } else {
      const supabase = await createSupabaseServerClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user?.email) {
        failure = 'session_missing';
      } else if (
        // Verifikasi ulang = tebakan sandi lewat pintu samping. Tanpa batas di
        // sini, pemegang sesi curian bisa menebak sandi lama tanpa henti — dan
        // karena semua panggilan berasal dari IP server, kuota masuk Supabase
        // seluruh pengguna ikut habis (alasan yang sama dengan ADR-028).
        (
          await Promise.all([
            signInRateLimited(userData.user.email),
            isAccountRateLimited(userData.user.id, RATE_LIMITS.reauthPerAccount),
          ])
        ).some(Boolean)
      ) {
        failure = 'rate_limited';
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
    redirect(authHref('/profile/settings', { error: failure }));
  }

  revalidatePath('/', 'layout');
  redirect(authHref('/profile/settings', { notice: 'password_updated' }));
}
