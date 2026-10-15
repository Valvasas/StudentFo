'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { loadManagedEvent, workspacePath } from '@/components/organizer/event-workspace';
import { toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser, toEventActor } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formTrimmed } from '@/lib/form-data';
import { parseRegistrationFormInput } from '@/lib/registration-form';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Simpan formulir pendaftaran internal satu acara (ADR-056).
 *
 * Hak kelola diperiksa repository (di produksi: RLS + trigger), bukan oleh
 * halaman yang merender form ini — `eventId` datang dari klien.
 */
export async function saveRegistrationFormAction(formData: FormData): Promise<void> {
  const eventId = formTrimmed(formData, 'eventId');
  if (!eventId || eventId.length > 64) redirect(withQuery('/penyelenggara', { error: 'invalid_request' }));
  const returnTo = safeNextPath(workspacePath(eventId, 'formulir'), '/penyelenggara');
  const user = await requireUser(returnTo);

  const parsed = parseRegistrationFormInput(formData);
  if (!parsed.ok) redirect(withQuery(returnTo, { notice: undefined, error: parsed.error }));

  // Slug hanya untuk mencabut cache halaman publik; acara yang tidak dikelola
  // berhenti di sini dengan kode yang sama seperti penolakan repository.
  const context = await loadManagedEvent(user, eventId);
  if (!context) redirect(withQuery(returnTo, { notice: undefined, error: 'not_event_manager' }));

  try {
    await (await getEventRepository()).saveRegistrationForm(toEventActor(user), eventId, parsed.value);
  } catch (error) {
    redirect(withQuery(returnTo, { notice: undefined, error: toActionErrorCode(error) }));
  }

  revalidatePath(`/events/${context.event.slug}`, 'layout');
  revalidatePath('/penyelenggara', 'layout');
  redirect(withQuery(returnTo, { error: undefined, notice: 'registration_form_saved' }));
}
