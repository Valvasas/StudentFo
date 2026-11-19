'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionErrorCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { internalPayment, resolveTemplate, starterInternalForm } from '@/lib/admin-event';
import { checkAdminAccess, getSessionUser, toEventActor } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { EVENTS_CACHE_TAG } from '@/lib/data/cache';
import { siteUrl } from '@/lib/env';
import { formText } from '@/lib/form-data';
import { readImageUpload, type UploadedImage } from '@/lib/image-file';
import { parseSubmissionForm, SUBMISSION_POSTER_FIELD } from '@/lib/submission-schema';

const PAGE = '/admin/acara/baru';

/**
 * "Buat acara StudentFo" (ADR-093). Admin (lolos MFA) membuat kegiatan yang
 * langsung tayang — tanpa antrean dan tanpa batas laju kiriman. Lomba
 * mandiri mendapat formulir awal dari templat yang masih TERTUTUP, lalu
 * admin diantar ke penyusun formulir untuk memeriksa & membukanya.
 *
 * Semua isian (termasuk poster) divalidasi SEBELUM kegiatan dibuat: isian
 * yang salah tidak boleh meninggalkan kegiatan setengah jadi di katalog.
 */
export async function createInternalEventAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');
  const user = await getSessionUser();
  if (!user) redirect('/admin?status=forbidden');
  const actor = toEventActor(user);

  const internal = formText(formData, 'registrationMode') !== 'external';
  // Kolom DB tetap NOT NULL http(s); untuk lomba mandiri tautan ini tidak pernah
  // ditampilkan (registration_mode = studentfo), sama dengan /submit (ADR-092).
  if (internal) formData.set('registrationLink', new URL('/events', siteUrl).toString());
  formData.set('email', user.email);

  const parsed = parseSubmissionForm(formData);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))].filter(Boolean).join(',');
    redirect(withQuery(PAGE, { error: 'invalid_submission', fields }));
  }
  const { submittedByEmail: _email, ...fields } = parsed.data;

  const payment = internal ? internalPayment(fields.isFree, fields.priceAmount, formText(formData, 'paymentInstructions')) : null;
  if (payment && !payment.ok) redirect(withQuery(PAGE, { error: 'payment_instructions_required', fields: 'paymentInstructions' }));

  let poster: UploadedImage | null = null;
  const posterFile = formData.get(SUBMISSION_POSTER_FIELD);
  if (posterFile && typeof posterFile !== 'string' && posterFile.size > 0) {
    const upload = await readImageUpload(posterFile);
    if (!upload.ok) redirect(withQuery(PAGE, { error: upload.error, fields: 'poster' }));
    poster = upload.image;
  }

  const repository = await getEventRepository();
  let created: { readonly id: string; readonly slug: string } | null = null;
  let failure: ActionErrorCode | null = null;
  try {
    created = await repository.createEventAsAdmin(actor, { ...fields, ...(internal ? { registrationMode: 'studentfo' as const } : {}) });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure || !created) redirect(withQuery(PAGE, { error: failure ?? 'unknown' }));

  // Langkah lanjutan TIDAK membatalkan kegiatan yang sudah tayang: poster &
  // formulir bisa dilengkapi dari studio. Gagalnya dicatat untuk diperiksa.
  if (poster) {
    try {
      await repository.addEventPhotos(actor, created.id, [poster], null, { asPoster: true });
    } catch (error) {
      console.error('[buat-acara] poster gagal dipasang:', created.id, error);
    }
  }
  if (internal && payment?.ok) {
    try {
      await repository.saveRegistrationForm(actor, created.id, starterInternalForm(resolveTemplate(formText(formData, 'template'), fields.eventType), payment));
    } catch (error) {
      console.error('[buat-acara] formulir awal gagal disimpan:', created.id, error);
    }
  }

  revalidateTag(EVENTS_CACHE_TAG);
  revalidatePath('/admin/acara');
  revalidatePath('/events');
  revalidatePath('/');
  redirect(
    internal
      ? withQuery(`/penyelenggara/acara/${created.id}/formulir`, { notice: 'internal_event_created' })
      : withQuery(`/events/${created.slug}`, { notice: 'admin_event_created' }),
  );
}
