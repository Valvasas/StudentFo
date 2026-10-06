'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { formIssueFields, parseRegistrationForm, REGISTRATION_DECISIONS, REGISTRATION_LIMITS, type RegistrationDecision } from '@/lib/registration';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Pendaftaran langsung — sisi penyelenggara (ADR-055).
 *
 * Seperti action penyelenggara lain: `requireUser()` di setiap action, hak
 * kelola diperiksa repository (dan RPC `manages_event()` di produksi) —
 * halaman yang merender formnya tidak dipercaya sebagai penjaga.
 */

const studioPath = (eventId: string) => `/penyelenggara/acara/${encodeURIComponent(eventId)}`;

function refresh(eventId: string) {
  revalidatePath('/penyelenggara', 'layout');
  revalidatePath(studioPath(eventId), 'layout');
}

export async function saveRegistrationFormAction(formData: FormData): Promise<void> {
  const eventId = formTrimmed(formData, 'eventId');
  const formPath = `${studioPath(eventId)}/pendaftaran/formulir`;
  const user = await requireUser(formPath);

  const parsed = parseRegistrationForm(formData);
  if (!parsed.success) {
    redirect(
      withQuery(formPath, {
        notice: undefined,
        error: 'invalid_registration_form',
        fields: formIssueFields(formData, parsed.error.issues).join(','),
      }),
    );
  }

  const repository = await getEventRepository();
  try {
    await repository.saveRegistrationForm(user.id, eventId, parsed.data);
  } catch (error) {
    redirect(withQuery(formPath, { notice: undefined, error: toActionErrorCode(error) }));
  }

  const dashboard = `${studioPath(eventId)}/pendaftaran`;
  if (formTrimmed(formData, 'intent') === 'open') {
    try {
      await repository.setRegistrationFormStatus(user.id, eventId, 'OPEN');
    } catch (error) {
      // Formulirnya SUDAH tersimpan; yang gagal hanya membukanya (mis. tenggat lewat).
      refresh(eventId);
      redirect(withQuery(dashboard, { notice: 'registration_form_saved', error: toActionErrorCode(error) }));
    }
    refresh(eventId);
    redirect(withQuery(dashboard, { error: undefined, notice: 'registration_form_opened' }));
  }
  refresh(eventId);
  redirect(withQuery(dashboard, { error: undefined, notice: 'registration_form_saved' }));
}

export async function setRegistrationFormStatusAction(formData: FormData): Promise<void> {
  const eventId = formTrimmed(formData, 'eventId');
  const returnTo = safeNextPath(formText(formData, 'returnTo'), `${studioPath(eventId)}/pendaftaran`);
  const user = await requireUser(returnTo);
  const status = formTrimmed(formData, 'status') === 'OPEN' ? 'OPEN' : 'CLOSED';

  try {
    await (await getEventRepository()).setRegistrationFormStatus(user.id, eventId, status);
  } catch (error) {
    redirect(withQuery(returnTo, { notice: undefined, error: toActionErrorCode(error) }));
  }
  refresh(eventId);
  redirect(withQuery(returnTo, { error: undefined, notice: status === 'OPEN' ? 'registration_form_opened' : 'registration_form_closed' }));
}

export async function decideRegistrationAction(formData: FormData): Promise<void> {
  const eventId = formTrimmed(formData, 'eventId');
  const returnTo = safeNextPath(formText(formData, 'returnTo'), `${studioPath(eventId)}/pendaftar`);
  const user = await requireUser(returnTo);

  const decisionRaw = formTrimmed(formData, 'decision');
  const registrationId = formTrimmed(formData, 'registrationId');
  if (!(REGISTRATION_DECISIONS as readonly string[]).includes(decisionRaw) || !registrationId) {
    redirect(withQuery(returnTo, { notice: undefined, error: 'registration_invalid_transition' }));
  }
  const note = formTrimmed(formData, 'note').replace(/\s+/g, ' ').slice(0, REGISTRATION_LIMITS.decisionNoteMax) || null;

  try {
    await (await getEventRepository()).decideRegistration(user.id, registrationId, decisionRaw as RegistrationDecision, note);
  } catch (error) {
    redirect(withQuery(returnTo, { notice: undefined, error: toActionErrorCode(error) }));
  }
  refresh(eventId);
  redirect(withQuery(returnTo, { error: undefined, notice: 'registration_decided' }));
}
