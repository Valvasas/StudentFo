import type { ZodError } from 'zod';
import type { AuthErrorCode } from '@/lib/auth-messages';
import { firstIssue } from '@/lib/auth-schema';
import { ORGANIZER_DRAFT_FIELDS } from '@/lib/organizer';
import { PASSWORD_MAX_LENGTH, passwordByteLength } from '@/lib/password-rules';

/**
 * Galat validasi form akun → SATU kode tertutup (ADR-012/019). Satu redirect
 * hanya membawa satu kode, jadi urutannya adalah keputusan UX: yang paling
 * perlu diperbaiki lebih dulu.
 *
 * Zod v3 tetap menjalankan `refine` pencocokan sandi walau kolom lain sudah
 * gagal (objeknya "kotor", bukan batal), sehingga galat `confirmPassword`
 * sering muncul BERSAMA galat sandi lemah. Sandi lemah selalu menang:
 * "ulangi kata sandi" tidak ada artinya sebelum sandinya sendiri sah.
 */

/** Kolom sandi BARU (daftar, setel ulang, ganti). null = kolom sandi tidak bermasalah. */
export function newPasswordFailure(error: ZodError, password: string): AuthErrorCode | null {
  // Huruf beraksen/emoji dihitung lebih dari satu byte — "isian belum benar" tidak menjelaskan itu.
  if (passwordByteLength(password) > PASSWORD_MAX_LENGTH) return 'password_too_long';
  const issue = error.issues.find((candidate) => candidate.path[0] === 'password');
  // Refine "harus berbeda dari yang sekarang" (ganti sandi) ada di jalur `password`, bertipe `custom`.
  if (issue?.code === 'custom') return 'same_password';
  if (issue) return 'weak_password';
  if (firstIssue(error, 'confirmPassword')) return 'password_mismatch';
  return null;
}

/** Form daftar peserta maupun penyelenggara. */
export function signUpValidationFailure(error: ZodError, password: string): AuthErrorCode {
  if (firstIssue(error, 'ageConfirm')) return 'age_required';
  if (firstIssue(error, 'privacyConsent')) return 'consent_required';
  if (firstIssue(error, 'authority')) return 'authority_required';
  if (ORGANIZER_DRAFT_FIELDS.some((name) => firstIssue(error, name))) return 'organizer_details';
  return newPasswordFailure(error, password) ?? 'validation';
}
