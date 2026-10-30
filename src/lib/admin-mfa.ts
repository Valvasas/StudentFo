import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * MFA TOTP wajib untuk admin (ADR-062 #4) — operasi GoTrue lewat supabase-js.
 * Menerima klien sebagai parameter (tanpa next/headers) supaya bisa diuji
 * terhadap GoTrue sungguhan (`npm run test:integration:services`).
 *
 * Penegakan ada di DUA tempat: `checkAdminAccess()` (rute service_role) dan
 * `is_admin()` di database (semua yang lewat token pengguna).
 */

/** Yang masih kurang sebelum sesi admin sah: pasang autentikator, atau masukkan kodenya. */
export type AdminMfaStep = 'enroll' | 'verify';

export type TotpVerifyResult = 'ok' | 'invalid' | 'rate_limited' | 'failed';

export interface TotpEnrollment {
  readonly factorId: string;
  /** Data URI SVG yang aman dipakai di `<img src>` (GoTrue mengirim SVG mentah dengan `#`). */
  readonly qrCode: string;
  readonly secret: string;
}

export const TOTP_CODE_PATTERN = /^\d{6}$/;

/** Spasi/tanda hubung yang ditempel dari aplikasi autentikator dibuang; selain 6 digit = tidak sah. */
export function normalizeTotpCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').replace(/[\s-]/g, '');
  return TOTP_CODE_PATTERN.test(code) ? code : null;
}

/** Rahasia dikelompokkan per 4 karakter supaya bisa diketik manual tanpa salah baca. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * null = sesi sudah aal2. Token diverifikasi ulang ke GoTrue
 * (`getAuthenticatorAssuranceLevel(jwt)` memanggil getUser) — klaim `aal`
 * tidak dibaca dari cookie apa adanya. Gagal membaca = 'verify' (gagal
 * tertutup: halaman MFA yang menjelaskan, bukan panel yang terbuka).
 */
export async function readAdminMfaStep(supabase: SupabaseClient): Promise<AdminMfaStep | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return 'verify';
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);
  if (error || !data) return 'verify';
  if (data.currentLevel === 'aal2') return null;
  return data.nextLevel === 'aal2' ? 'verify' : 'enroll';
}

export async function verifiedTotpFactorId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return null;
  return data.totp.find((factor) => factor.status === 'verified')?.id ?? null;
}

/** Faktor TOTP milik sesi ini yang belum diverifikasi (untuk mengulang kode tanpa memindai ulang). */
export async function isPendingTotpFactor(supabase: SupabaseClient, factorId: string): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return false;
  return data.all.some((factor) => factor.id === factorId && factor.factor_type === 'totp' && factor.status === 'unverified');
}

/**
 * Pendaftaran baru. Faktor lama yang belum diverifikasi dihapus dulu: setiap
 * "tampilkan kode QR" membuat rahasia baru, dan sisa yang menumpuk bisa
 * menabrak batas jumlah faktor GoTrue.
 */
export async function startTotpEnrollment(supabase: SupabaseClient): Promise<TotpEnrollment | null> {
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return null;
  for (const factor of factors.all) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'StudentFo', friendlyName: `Admin ${Date.now()}` });
  if (error || !data || data.type !== 'totp') return null;
  const svg = data.totp.qr_code.slice(data.totp.qr_code.indexOf(',') + 1);
  return {
    factorId: data.id,
    qrCode: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    secret: data.totp.secret,
  };
}

/** Sukses = supabase-js menyimpan sesi aal2 baru (di server: lewat cookie). */
export async function verifyTotp(supabase: SupabaseClient, factorId: string, code: string): Promise<TotpVerifyResult> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (!error) return 'ok';
  if (error.status === 429) return 'rate_limited';
  if (error.code === 'mfa_verification_failed' || error.code === 'mfa_challenge_expired' || error.status === 422) return 'invalid';
  return 'failed';
}
