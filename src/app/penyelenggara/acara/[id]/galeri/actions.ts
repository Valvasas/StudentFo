'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { workspacePath } from '@/components/organizer/event-workspace';
import { type ActionErrorCode, type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser, toEventActor, type AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { GALLERY_LIMITS } from '@/lib/data/repository';
import { formText, formTrimmed } from '@/lib/form-data';
import { formFiles, readImageUpload, type UploadedImage } from '@/lib/image-file';
import { safeNextPath } from '@/lib/safe-redirect';
import { stripMarkup } from '@/lib/submission-schema';

/**
 * Galeri foto acara (ADR-056). Tujuan kembali dihitung dari `eventId`, bukan
 * dari isian form; hak kelola diperiksa repository (di produksi: RLS +
 * trigger `enforce_event_photo_insert`), bukan oleh halaman yang merender form.
 */

function galleryPath(eventId: string): string {
  return eventId ? safeNextPath(workspacePath(eventId, 'galeri'), '/penyelenggara') : '/penyelenggara';
}

function failed(returnTo: string, error: ActionErrorCode): never {
  redirect(withQuery(returnTo, { notice: undefined, error }));
}

async function done(user: AuthUser, eventId: string, returnTo: string, notice: ActionNoticeCode): Promise<never> {
  const slug = (await (await getEventRepository()).listManagedEvents(user.id)).find((entry) => entry.event.id === eventId)?.event.slug;
  if (slug) revalidatePath(`/events/${slug}`);
  else revalidatePath('/events/[slug]', 'page');
  revalidatePath(workspacePath(eventId, 'galeri'));
  revalidatePath(workspacePath(eventId));
  redirect(withQuery(returnTo, { error: undefined, notice }));
}

/** Satu keterangan untuk semua foto di unggahan itu; kosong = tanpa keterangan. */
function readCaption(formData: FormData): string | null {
  const caption = Array.from(stripMarkup(formText(formData, 'caption')).replace(/\s+/g, ' ').trim())
    .slice(0, GALLERY_LIMITS.captionMax)
    .join('')
    .trim();
  return caption || null;
}

export async function uploadPhotosAction(formData: FormData): Promise<void> {
  const eventId = formTrimmed(formData, 'eventId');
  const returnTo = galleryPath(eventId);
  const user = await requireUser(returnTo);

  const files = formFiles(formData, 'photos');
  if (files.length === 0) failed(returnTo, 'image_missing');
  if (files.length > GALLERY_LIMITS.perUpload) failed(returnTo, 'too_many_photos');

  const images: UploadedImage[] = [];
  for (const file of files) {
    const result = await readImageUpload(file);
    if (!result.ok) failed(returnTo, result.error);
    images.push(result.image);
  }

  try {
    await (await getEventRepository()).addEventPhotos(toEventActor(user), eventId, images, readCaption(formData));
  } catch (error) {
    failed(returnTo, toActionErrorCode(error));
  }
  await done(user, eventId, returnTo, 'photos_uploaded');
}

export async function deletePhotoAction(formData: FormData): Promise<void> {
  const eventId = formTrimmed(formData, 'eventId');
  const returnTo = galleryPath(eventId);
  const user = await requireUser(returnTo);

  const photoId = formTrimmed(formData, 'photoId');
  if (!photoId) failed(returnTo, 'photo_not_found');

  try {
    await (await getEventRepository()).deleteEventPhoto(toEventActor(user), photoId);
  } catch (error) {
    failed(returnTo, toActionErrorCode(error));
  }
  await done(user, eventId, returnTo, 'photo_deleted');
}
