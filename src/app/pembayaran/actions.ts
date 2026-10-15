'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionErrorCode, type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser, toEventActor } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { readImageUpload } from '@/lib/image-file';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Aksi peserta atas pendaftarannya sendiri (ADR-056). Id pendaftaran datang
 * dari form, jadi kepemilikan & transisi status diperiksa repository (di
 * produksi oleh RPC DEFINER) — pendaftaran orang lain = `registration_not_found`.
 */

const FALLBACK = '/pembayaran';

function done(returnTo: string, notice: ActionNoticeCode): never {
  revalidatePath(FALLBACK, 'layout');
  redirect(withQuery(returnTo, { error: undefined, notice }));
}

function failed(returnTo: string, error: ActionErrorCode): never {
  redirect(withQuery(returnTo, { notice: undefined, error }));
}

function target(formData: FormData): { registrationId: string; returnTo: string } {
  return {
    registrationId: formTrimmed(formData, 'registrationId'),
    returnTo: safeNextPath(formText(formData, 'returnTo'), FALLBACK),
  };
}

export async function submitPaymentProofAction(formData: FormData): Promise<void> {
  const { registrationId, returnTo } = target(formData);
  const user = await requireUser(returnTo);
  if (!registrationId) failed(returnTo, 'invalid_request');

  const upload = await readImageUpload(formData.get('proof'));
  if (!upload.ok) failed(returnTo, upload.error);

  try {
    await (await getEventRepository()).submitPaymentProof(toEventActor(user), registrationId, upload.image);
  } catch (error) {
    failed(returnTo, toActionErrorCode(error));
  }
  done(returnTo, 'payment_submitted');
}

export async function cancelRegistrationAction(formData: FormData): Promise<void> {
  const { registrationId, returnTo } = target(formData);
  const user = await requireUser(returnTo);
  if (!registrationId) failed(returnTo, 'invalid_request');

  try {
    await (await getEventRepository()).cancelRegistration(toEventActor(user), registrationId);
  } catch (error) {
    failed(returnTo, toActionErrorCode(error));
  }
  done(returnTo, 'registration_cancelled');
}
