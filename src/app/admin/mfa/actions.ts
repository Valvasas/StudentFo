'use server';

import { redirect } from 'next/navigation';
import { type ActionErrorCode, withQuery } from '@/lib/action-feedback';
import { isPendingTotpFactor, normalizeTotpCode, verifiedTotpFactorId, verifyTotp } from '@/lib/admin-mfa';
import { ADMIN_MFA_PATH, getSessionUser } from '@/lib/auth';
import { isUuid } from '@/lib/data/supabase-mappers';
import { dataMode } from '@/lib/env';
import { formText, formTrimmed } from '@/lib/form-data';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { isAccountRateLimited } from '@/lib/rate-limit-server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const VERIFY_ERROR: Record<'invalid' | 'rate_limited' | 'failed', ActionErrorCode> = {
  invalid: 'mfa_invalid_code',
  rate_limited: 'mfa_rate_limited',
  failed: 'mfa_failed',
};

/**
 * Satu jalur untuk dua langkah (ADR-062 #4): `verify` memakai faktor
 * terverifikasi milik sesi (bukan id dari form); `enroll` menerima id faktor
 * dari form, tapi hanya bila itu faktor TOTP BELUM terverifikasi milik sesi
 * ini — GoTrue juga menolak faktor orang lain.
 */
async function submitCode(formData: FormData, mode: 'verify' | 'enroll'): Promise<never> {
  if (dataMode === 'seed') redirect('/admin');
  const user = await getSessionUser();
  if (!user || user.role !== 'ADMIN') redirect('/');

  const pendingId = mode === 'enroll' ? formTrimmed(formData, 'factorId') : '';
  // Salah ketik saat memasang: kembali ke faktor yang SAMA (QR sudah dipindai), bukan QR baru.
  const back = (error: ActionErrorCode) => withQuery(ADMIN_MFA_PATH, { error, faktor: isUuid(pendingId) ? pendingId : undefined });

  const code = normalizeTotpCode(formText(formData, 'code'));
  if (!code) redirect(back('mfa_invalid_code'));
  if (await isAccountRateLimited(user.id, RATE_LIMITS.mfaPerAccount)) redirect(back('mfa_rate_limited'));

  const supabase = await createSupabaseServerClient();
  const factorId =
    mode === 'enroll'
      ? isUuid(pendingId) && (await isPendingTotpFactor(supabase, pendingId))
        ? pendingId
        : null
      : await verifiedTotpFactorId(supabase);
  if (!factorId) redirect(withQuery(ADMIN_MFA_PATH, { error: 'mfa_failed' }));

  const result = await verifyTotp(supabase, factorId, code);
  if (result === 'ok') redirect(withQuery('/admin', { notice: mode === 'enroll' ? 'mfa_enabled' : 'mfa_verified' }));
  redirect(back(VERIFY_ERROR[result]));
}

export async function verifyAdminMfaAction(formData: FormData): Promise<void> {
  await submitCode(formData, 'verify');
}

export async function confirmAdminMfaEnrollmentAction(formData: FormData): Promise<void> {
  await submitCode(formData, 'enroll');
}
