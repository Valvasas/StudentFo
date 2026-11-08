'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isPerAddressEmailThrottle, mapSupabaseAuthError, type AuthErrorCode } from '@/lib/auth-messages';
import {
  AGE_CONFIRM_VALUE,
  AUTHORITY_CONFIRM_VALUE,
  changePasswordSchema,
  newPasswordSchema,
  parseAccountType,
  postSignUpPath,
  PRIVACY_CONSENT_VALUE,
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  type AccountType,
} from '@/lib/auth-schema';
import { writeOrganizerDraftCookie } from '@/lib/organizer-draft-cookie';
import { newPasswordFailure, signUpValidationFailure } from '@/lib/auth-failure';
import { ORGANIZER_DRAFT_FIELDS, organizerApplicationSchema, organizerSignUpSchema, toOrganizerDraft } from '@/lib/organizer';
import { seedDemoNetwork, seedDemoOrganizer, seedDemoParticipation, seedDemoPortfolio } from '@/lib/data';
import { DEMO_PERSONAS, demoEmailOf, isDemoPersonaId } from '@/lib/demo/personas';
import { isDemoAdminPersonaAllowed, isDemoAvailable } from '@/lib/demo/gate';
import { endDemoSession, startDemoSession } from '@/lib/demo/session';
import { dataMode, siteUrl } from '@/lib/env';
import { formText as field } from '@/lib/form-data';
import { LEGAL_REVISION, legalConsentRecord } from '@/lib/legal';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { currentClientIp, isAccountRateLimited, isRateLimited, passesCaptcha } from '@/lib/rate-limit-server';
import {
  audienceHome,
  audienceLoginPath,
  ORGANIZER_HOME_PATH,
  ORGANIZER_REGISTER_PATH,
  parseAuthAudience,
  safeNextPath,
} from '@/lib/safe-redirect';
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

/** Halaman ganti kata sandi & sesi (ADR-067). */
const SECURITY_SETTINGS_PATH = '/profile/settings/keamanan';

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

/**
 * `consent` = revisi dokumen hukum yang dicentang di /register. OAuth tidak
 * bisa membawa metadata akun, jadi callback yang mencatat persetujuannya.
 */
function callbackUrl(next: string, consentRevision?: string): string {
  const consent = consentRevision ? `&consent=${encodeURIComponent(consentRevision)}` : '';
  return `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}${consent}`;
}

/** Kembali ke halaman daftar asalnya (peserta / penyelenggara, ADR-063) dengan tujuan tetap utuh. */
function registerHref(failure: AuthErrorCode, email: string, accountType: AccountType | null, next: string): string {
  const organizer = accountType === 'organizer';
  return authHref(organizer ? ORGANIZER_REGISTER_PATH : '/register', {
    error: failure,
    email: echoEmail(email),
    next: next === audienceHome(organizer ? 'organizer' : 'participant') ? undefined : next,
  });
}

/** Kembali ke halaman masuk asalnya; `audience` dikirim form sebagai isian tersembunyi. */
function loginFailureHref(formData: FormData, failure: AuthErrorCode, next: string, email?: string): string {
  const audience = parseAuthAudience(field(formData, 'audience'));
  return authHref(audienceLoginPath(audience), {
    error: failure,
    email: email === undefined ? undefined : echoEmail(email),
    next: next === audienceHome(audience) ? undefined : next,
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

  if (failure) redirect(loginFailureHref(formData, failure, next, email));

  // Navbar dirender di layout dan ikut ter-cache di router klien; tanpa
  // revalidasi, pengguna yang baru masuk masih melihat tombol "Masuk".
  revalidatePath('/', 'layout');
  redirect(next);
}

type SignUpOutcome = { readonly failure: AuthErrorCode } | { readonly failure: null; readonly hasSession: boolean };

/**
 * Inti daftar dengan email untuk kedua pintu (peserta & penyelenggara).
 *
 * Batas laju & CAPTCHA diperiksa SEBELUM Supabase dipanggil — urutan ini
 * yang membuat `email_taken` (ADR-069) aman: setiap alamat yang diperiksa
 * menghabiskan satu CAPTCHA dan satu dari lima jatah per jam per IP.
 */
async function signUpWithEmail(
  formData: FormData,
  account: { email: string; password: string; fullName: string; accountType: AccountType; organizerDraft?: Record<string, string> },
  destination: string,
): Promise<SignUpOutcome> {
  const ip = await currentClientIp();
  if (await isRateLimited(ip, [[RATE_LIMITS.signUpPerIp]])) return { failure: 'rate_limited' };
  // Setelah pembatas laju (pola /submit): banjir dari satu mesin tidak ikut
  // menghabiskan kuota verifikasi Turnstile.
  if (!(await passesCaptcha(formData, ip))) return { failure: 'captcha_failed' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: account.email,
    password: account.password,
    options: {
      // full_name dibaca trigger handle_new_user(). account_type,
      // legal_consent, dan organizer_application hanya catatan/draf: user
      // metadata bisa diubah pemiliknya sendiri, jadi tidak pernah dipakai
      // untuk izin apa pun.
      data: {
        full_name: account.fullName,
        account_type: account.accountType,
        legal_consent: legalConsentRecord('email'),
        ...(account.organizerDraft ? { organizer_application: account.organizerDraft } : {}),
      },
      emailRedirectTo: callbackUrl(destination),
    },
  });

  if (error && isPerAddressEmailThrottle(error)) {
    // Jeda per alamat hanya terpasang untuk akun yang ADA tetapi BELUM
    // dikonfirmasi (akun terkonfirmasi dijawab tanpa mengirim email), dan
    // tautan pertamanya masih berlaku — "cek email" tetap kalimat yang benar.
    console.error('[auth] daftar: jeda per alamat dari Supabase:', error.code ?? error.status);
    return { failure: null, hasSession: false };
  }
  if (error) return { failure: mapSupabaseAuthError(error) };
  // Konfirmasi email NYALA: Supabase menjawab alamat yang sudah terkonfirmasi
  // dengan pengguna samaran tanpa identitas, tanpa membuat akun & tanpa
  // email. Dulu kasus ini sengaja ditelan (ADR-011) sehingga daftar ulang
  // tampak "berhasil"; kini dijawab terang (ADR-069). Konfirmasi MATI
  // menjawabnya `user_already_exists` → kode yang sama lewat mapper.
  if (data.user && data.user.identities?.length === 0) return { failure: 'email_taken' };
  return { failure: null, hasSession: data.session !== null };
}

function finishSignUp(outcome: SignUpOutcome, failureHref: (failure: AuthErrorCode) => string, email: string, destination: string): never {
  if (outcome.failure) redirect(failureHref(outcome.failure));
  // Kalau konfirmasi email dimatikan di project Supabase, signUp langsung
  // memberi sesi dan pengguna tidak perlu dilempar ke halaman "cek email".
  if (outcome.hasSession) {
    revalidatePath('/', 'layout');
    redirect(destination);
  }
  redirect(authHref('/verify-email', { email: echoEmail(email), next: destination === '/' ? undefined : destination }));
}

/** Pintu daftar peserta (`/register`). */
export async function signUpAction(formData: FormData): Promise<void> {
  const next = safeNextPath(field(formData, 'next'));
  const email = field(formData, 'email');
  const password = field(formData, 'password');
  // Form penyelenggara lama (tanpa data lembaga) yang masih terbuka di tab
  // seseorang tetap bisa dikirim; pengajuannya diisi di studio.
  const accountType = parseAccountType(field(formData, 'accountType'));
  const destination = postSignUpPath(accountType ?? 'participant', next);
  const failureHref = (failure: AuthErrorCode) => registerHref(failure, email, accountType, next);

  if (dataMode === 'seed') redirect(failureHref('unavailable'));

  const parsed = signUpSchema.safeParse({
    accountType: field(formData, 'accountType'),
    fullName: field(formData, 'fullName'),
    email,
    password,
    confirmPassword: field(formData, 'confirmPassword'),
    ageConfirm: field(formData, 'ageConfirm'),
    privacyConsent: field(formData, 'privacyConsent'),
  });
  if (!parsed.success) redirect(failureHref(signUpValidationFailure(parsed.error, password)));

  const outcome = await signUpWithEmail(formData, parsed.data, destination);
  finishSignUp(outcome, failureHref, email, destination);
}

/**
 * Pintu daftar penyelenggara (`/penyelenggara/daftar`, ADR-069). Data
 * lembaga divalidasi dengan skema pengajuan studio dan dibawa sebagai draf
 * di metadata — sebelum email dikonfirmasi belum ada sesi untuk mengajukan.
 */
export async function organizerSignUpAction(formData: FormData): Promise<void> {
  const email = field(formData, 'email');
  const password = field(formData, 'password');
  const failureHref = (failure: AuthErrorCode) => registerHref(failure, email, 'organizer', ORGANIZER_HOME_PATH);

  if (dataMode === 'seed') redirect(failureHref('unavailable'));

  const parsed = organizerSignUpSchema.safeParse({
    fullName: field(formData, 'fullName'),
    email,
    password,
    confirmPassword: field(formData, 'confirmPassword'),
    ageConfirm: field(formData, 'ageConfirm'),
    privacyConsent: field(formData, 'privacyConsent'),
    authority: field(formData, 'authority'),
    ...readOrganizerFields(formData),
  });
  if (!parsed.success) redirect(failureHref(signUpValidationFailure(parsed.error, password)));

  const outcome = await signUpWithEmail(
    formData,
    { ...parsed.data, accountType: 'organizer', organizerDraft: toOrganizerDraft(parsed.data) },
    ORGANIZER_HOME_PATH,
  );
  finishSignUp(outcome, failureHref, email, ORGANIZER_HOME_PATH);
}

function readOrganizerFields(formData: FormData): Record<(typeof ORGANIZER_DRAFT_FIELDS)[number], string> {
  return Object.fromEntries(ORGANIZER_DRAFT_FIELDS.map((name) => [name, field(formData, name)])) as Record<(typeof ORGANIZER_DRAFT_FIELDS)[number], string>;
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  // Dari halaman daftar tombol Google berada di form daftar yang sama, jadi
  // ikut mengirim jenis akun & persetujuan; dari /login keduanya tidak ada.
  const accountType = parseAccountType(field(formData, 'accountType'));
  const requested = safeNextPath(field(formData, 'next'));
  const next = accountType ? postSignUpPath(accountType, requested) : requested;
  // Form penyelenggara (ADR-069) mengirim data lembaga; tombol Google lewat
  // `formNoValidate`, jadi syaratnya diperiksa ulang di sini — pintu Google
  // tidak boleh lebih longgar daripada pintu email.
  const organizerForm = accountType === 'organizer' && formData.has('orgName');
  let destination: string | null = null;
  let organizerDraft: Record<string, string> | null = null;
  let failure: AuthErrorCode | null = dataMode === 'seed' ? 'unavailable' : null;

  if (!failure && organizerForm) {
    const parsed = organizerApplicationSchema.safeParse(readOrganizerFields(formData));
    if (!parsed.success) failure = 'organizer_details';
    else if (field(formData, 'authority') !== AUTHORITY_CONFIRM_VALUE) failure = 'authority_required';
    else organizerDraft = toOrganizerDraft(parsed.data);
  }
  if (!failure && accountType && field(formData, 'ageConfirm') !== AGE_CONFIRM_VALUE) failure = 'age_required';
  if (!failure && accountType && field(formData, 'privacyConsent') !== PRIVACY_CONSENT_VALUE) failure = 'consent_required';

  if (!failure) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(next, accountType ? LEGAL_REVISION : undefined) },
    });

    // Di Server Action, signInWithOAuth TIDAK mengalihkan browser sendiri —
    // ia mengembalikan URL consent Google dan menulis code verifier PKCE ke
    // cookie. Pengalihannya urusan kita.
    if (error || !data.url) {
      failure = error ? mapSupabaseAuthError(error) : 'unknown';
    } else {
      destination = data.url;
      // OAuth tidak membawa metadata akun: draf dititipkan di cookie berumur
      // pendek yang hanya terkirim ke /auth/callback, lalu dipindah ke
      // metadata di sana (pola yang sama dengan bukti persetujuan).
      if (organizerDraft) await writeOrganizerDraftCookie(organizerDraft);
    }
  }

  if (failure) {
    redirect(
      accountType
        ? registerHref(failure, field(formData, 'email'), accountType, requested)
        : loginFailureHref(formData, failure, next),
    );
  }

  redirect(destination!);
}

/**
 * Masuk sebagai persona demo — HANYA di mode seed.
 *
 * Di mode Supabase, atau di host yang tidak terdaftar sebagai host demo, aksi
 * ini sengaja menolak (bukan diam-diam lolos): Server Action bisa dipanggil
 * langsung, jadi tombolnya disembunyikan saja tidak cukup untuk mencegah siapa
 * pun membuat sesi admin palsu. Persona Admin tambahan butuh kunci tautan khusus.
 */
export async function demoSignInAction(formData: FormData): Promise<void> {
  const next = safeNextPath(field(formData, 'next'));
  const persona = field(formData, 'persona');

  if (!(await isDemoAvailable())) {
    redirect(authHref('/login', { error: 'unavailable' }));
  }
  if (!isDemoPersonaId(persona) || (persona === 'admin' && !isDemoAdminPersonaAllowed(field(formData, 'akses')))) {
    redirect(authHref('/login', { error: 'validation' }));
  }

  const uid = await startDemoSession(persona);
  if (persona === 'mahasiswa') {
    seedDemoNetwork(uid);
    seedDemoPortfolio(uid);
    seedDemoParticipation({ id: uid, fullName: DEMO_PERSONAS.mahasiswa.fullName, email: demoEmailOf(persona) });
  }
  if (persona === 'penyelenggara') {
    seedDemoOrganizer({ id: uid, fullName: DEMO_PERSONAS.penyelenggara.fullName, email: demoEmailOf(persona) });
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

/**
 * Keluar dari SEMUA perangkat (ADR-067): mencabut setiap refresh token akun
 * ini, termasuk sesi di komputer lab/warnet yang lupa ditutup. Token akses
 * yang sudah terbit tetap sah sampai kedaluwarsa (±1 jam, batas Supabase) —
 * kalimat di halaman keamanan tidak menjanjikan "seketika".
 * Akun demo hanya hidup di cookie perangkat ini, jadi sama dengan keluar biasa.
 */
export async function signOutEverywhereAction(): Promise<void> {
  if (dataMode === 'seed') {
    await endDemoSession();
  } else {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: 'global' });
  }

  revalidatePath('/', 'layout');
  redirect(authHref('/login', { notice: 'signed_out_everywhere' }));
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
      failure = newPasswordFailure(parsed.error, field(formData, 'password')) ?? 'validation';
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
  redirect(authHref(SECURITY_SETTINGS_PATH, { notice: 'password_updated' }));
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
      failure = newPasswordFailure(parsed.error, field(formData, 'password')) ?? 'validation';
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

  // Gagal = form tetap terbuka (`ubah=sandi`) supaya orang langsung bisa mencoba lagi.
  if (failure) {
    redirect(authHref(SECURITY_SETTINGS_PATH, { error: failure, ubah: failure === 'unavailable' ? undefined : 'sandi' }));
  }

  revalidatePath('/', 'layout');
  redirect(authHref(SECURITY_SETTINGS_PATH, { notice: 'password_updated' }));
}
