'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formTrimmed } from '@/lib/form-data';
import { parseRegistrationSubmission } from '@/lib/registration';

/**
 * Pendaftaran langsung — sisi peserta (ADR-055).
 *
 * `slug` dari form hanya dipakai untuk MENCARI acara; semua jalur redirect
 * dirakit dari `event.slug` hasil database, jadi isian palsu tidak bisa
 * membelokkan redirect. Formulir yang berlaku dibaca ulang di sini — bukan
 * versi yang dilihat peserta saat halaman dibuka — dan repository/RPC
 * memeriksa ulang gerbang, kuota, dan kelayakan di bawah kunci.
 */

const formPathOf = (slug: string) => `/events/${encodeURIComponent(slug)}/pendaftaran`;

export async function submitRegistrationAction(formData: FormData): Promise<void> {
  const slug = formTrimmed(formData, 'slug');
  const user = await requireUser(formPathOf(slug));
  const repository = await getEventRepository();
  const event = slug ? await repository.getEventBySlug(slug) : null;
  if (!event) redirect('/events');

  const formPath = formPathOf(event.slug);
  const form = await repository.getRegistrationForm(event.id);
  if (!form) redirect(withQuery(formPath, { error: 'registration_closed' }));

  const parsed = parseRegistrationSubmission(formData, form);
  if (!parsed.success) redirect(withQuery(formPath, { error: 'invalid_registration', fields: parsed.fields.join(',') }));

  try {
    await repository.submitRegistration({ id: user.id, fullName: user.fullName, email: user.email }, event.id, parsed.data);
  } catch (error) {
    redirect(withQuery(formPath, { error: toActionErrorCode(error) }));
  }

  revalidatePath(`/events/${event.slug}`);
  redirect(withQuery(`${formPath}/tiket`, { notice: 'registration_submitted' }));
}

export async function cancelRegistrationAction(formData: FormData): Promise<void> {
  const slug = formTrimmed(formData, 'slug');
  const user = await requireUser(`${formPathOf(slug)}/tiket`);
  const repository = await getEventRepository();
  const event = slug ? await repository.getEventBySlug(slug) : null;
  if (!event) redirect('/events');

  const ticketPath = `${formPathOf(event.slug)}/tiket`;
  try {
    await repository.cancelRegistration(user.id, event.id);
  } catch (error) {
    redirect(withQuery(ticketPath, { error: toActionErrorCode(error) }));
  }

  revalidatePath(`/events/${event.slug}`);
  redirect(withQuery(ticketPath, { notice: 'registration_cancelled' }));
}
