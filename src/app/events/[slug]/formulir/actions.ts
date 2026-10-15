'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CONSENT_FIELD } from '@/components/registration/registration-view';
import { type ActionErrorCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser, toEventActor } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { AppError } from '@/lib/errors';
import { formText, formTrimmed } from '@/lib/form-data';
import { readAnswers } from '@/lib/registration-form';
import { safeNextPath } from '@/lib/safe-redirect';
import type { EventRegistration } from '@/types/domain';

function failed(formPath: string, error: ActionErrorCode, field?: string): never {
  redirect(withQuery(formPath, { notice: undefined, error, kolom: field }));
}

/**
 * Kirim formulir pendaftaran internal (ADR-056).
 *
 * Yang dipercaya dari form hanya slug & jawaban. Acara dibaca ulang dari
 * slug dan id-nya harus sama dengan `eventId` yang dikirim — kalau slug
 * berpindah ke acara lain di antara buka & kirim, jawaban tidak menempel ke
 * acara yang salah. Jawaban divalidasi terhadap formulir TERBARU dari
 * repository, bukan kolom yang tampil saat halaman dibuka (penyelenggara
 * bisa mengubahnya sementara orang mengisi). Kuota, tenggat, dan batas laju
 * diperiksa repository.
 */
export async function registerForEventAction(formData: FormData): Promise<void> {
  const slug = formTrimmed(formData, 'slug');
  const formPath = safeNextPath(`/events/${encodeURIComponent(slug)}/formulir`, '/events');
  const user = await requireUser(formPath);

  const repository = await getEventRepository();
  const event = slug ? await repository.getEventBySlug(slug) : null;
  if (!event || event.id !== formTrimmed(formData, 'eventId')) failed(formPath, 'invalid_request');

  const form = await repository.getRegistrationForm(event.id);
  if (!form) failed(formPath, 'registration_closed');

  if (formText(formData, CONSENT_FIELD) !== 'on') failed(formPath, 'invalid_registration', CONSENT_FIELD);
  const answers = readAnswers(form.fields, formData);
  if (!answers.ok) failed(formPath, 'invalid_registration', answers.fieldId);

  let registration: EventRegistration;
  try {
    registration = await repository.registerForEvent(toEventActor(user), event.id, answers.answers);
  } catch (error) {
    // Dua tab, atau Kembali setelah berhasil lalu kirim ulang: tunjukkan pendaftaran yang sudah ada.
    if (error instanceof AppError && error.reason === 'registration_exists') {
      const existing = await repository.getMyRegistration(user.id, event.id);
      if (existing) redirect(`/pembayaran/${encodeURIComponent(existing.id)}`);
    }
    failed(formPath, toActionErrorCode(error));
  }

  revalidatePath(`/events/${event.slug}`);
  revalidatePath('/pembayaran', 'layout');
  redirect(
    withQuery(`/pembayaran/${encodeURIComponent(registration.id)}`, {
      notice: registration.status === 'CONFIRMED' ? 'registration_confirmed' : 'registration_awaiting_payment',
    }),
  );
}
