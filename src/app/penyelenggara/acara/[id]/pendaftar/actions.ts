'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { workspacePath } from '@/components/organizer/event-workspace';
import { toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser, toEventActor } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { parseReviewNote, reviewDecisionOf, reviewNoteRequired } from '@/lib/registration-form';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Keputusan panitia atas satu pendaftaran: konfirmasi / tolak bukti / tolak
 * pendaftaran (ADR-056). Hak = pengelola acara pendaftaran itu, diperiksa
 * repository terhadap acara MILIK pendaftaran — bukan `eventId` dari form,
 * yang hanya dipakai untuk alamat kembali.
 */
export async function reviewRegistrationAction(formData: FormData): Promise<void> {
  const eventId = formTrimmed(formData, 'eventId');
  const returnTo = safeNextPath(formText(formData, 'returnTo'), eventId ? workspacePath(eventId, 'pendaftar') : '/penyelenggara');
  const user = await requireUser(returnTo);

  const registrationId = formTrimmed(formData, 'registrationId');
  const decision = reviewDecisionOf(formTrimmed(formData, 'decision'));
  if (!decision || !registrationId || registrationId.length > 128) {
    redirect(withQuery(returnTo, { notice: undefined, open: undefined, error: 'invalid_request' }));
  }
  const note = parseReviewNote(formText(formData, 'note'));
  if (reviewNoteRequired(decision) && !note) {
    redirect(`${withQuery(returnTo, { notice: undefined, open: registrationId, error: 'review_note_required' })}#${rowAnchor(registrationId)}`);
  }

  try {
    await (await getEventRepository()).reviewRegistration(toEventActor(user), registrationId, decision, note);
  } catch (error) {
    redirect(withQuery(returnTo, { notice: undefined, open: undefined, error: toActionErrorCode(error) }));
  }

  revalidatePath('/penyelenggara', 'layout');
  // Baris yang baru diputuskan dibuka lagi (dan digulir ke sana) supaya status
  // barunya terlihat tanpa mencari ulang di daftar panjang.
  redirect(`${withQuery(returnTo, { error: undefined, open: registrationId, notice: 'registration_reviewed' })}#${rowAnchor(registrationId)}`);
}

function rowAnchor(registrationId: string): string {
  return `pendaftar-${encodeURIComponent(registrationId)}`;
}
