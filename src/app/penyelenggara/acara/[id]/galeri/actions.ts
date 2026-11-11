'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { workspacePath } from '@/components/organizer/event-workspace';
import { type ActionErrorCode, type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser, toEventActor, type AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { EVENTS_CACHE_TAG } from '@/lib/data/cache';
import { GALLERY_LIMITS } from '@/lib/data/repository';
import { formText, formTrimmed } from '@/lib/form-data';
import { formFiles, readImageUpload, type UploadedImage } from '@/lib/image-file';
import { adminMediaPath } from '@/lib/media-paths';
import { safeNextPath } from '@/lib/safe-redirect';
import { stripMarkup } from '@/lib/submission-schema';
import { normalizeVideoUrl } from '@/lib/video';

/**
 * Galeri, poster & video acara (ADR-056, ADR-079) — dipakai studio
 * penyelenggara DAN halaman media admin. Tujuan kembali dihitung dari konteks
 * tertutup (`studio`/`admin`) + id/slug yang di-encode, bukan path dari form;
 * hak kelola diperiksa repository (di produksi: RLS, trigger, dan RPC
 * DEFINER), bukan oleh halaman yang merender form.
 */

interface MediaTarget {
  readonly eventId: string;
  readonly returnTo: string;
}

function readTarget(formData: FormData): MediaTarget {
  const eventId = formTrimmed(formData, 'eventId');
  if (formText(formData, 'context') === 'admin') {
    const slug = formTrimmed(formData, 'slug');
    return { eventId, returnTo: slug ? safeNextPath(adminMediaPath(slug), '/admin/promosi') : '/admin/promosi' };
  }
  return { eventId, returnTo: eventId ? safeNextPath(workspacePath(eventId, 'galeri'), '/penyelenggara') : '/penyelenggara' };
}

function failed(returnTo: string, error: ActionErrorCode): never {
  redirect(withQuery(returnTo, { notice: undefined, error }));
}

async function done(user: AuthUser, { eventId, returnTo }: MediaTarget, notice: ActionNoticeCode): Promise<never> {
  const slug = (await (await getEventRepository()).listManagedEvents(user.id)).find((entry) => entry.event.id === eventId)?.event.slug;
  if (slug) revalidatePath(`/events/${slug}`);
  else revalidatePath('/events/[slug]', 'page');
  // Poster tampil di kartu setiap daftar (beranda, /events, tersimpan) yang di-cache dengan tag ini.
  revalidateTag(EVENTS_CACHE_TAG);
  revalidatePath(workspacePath(eventId, 'galeri'));
  revalidatePath(workspacePath(eventId));
  revalidatePath(returnTo.split('?')[0] ?? returnTo);
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
  const target = readTarget(formData);
  const user = await requireUser(target.returnTo);

  const files = formFiles(formData, 'photos');
  if (files.length === 0) failed(target.returnTo, 'image_missing');
  if (files.length > GALLERY_LIMITS.perUpload) failed(target.returnTo, 'too_many_photos');

  const images: UploadedImage[] = [];
  for (const file of files) {
    const result = await readImageUpload(file);
    if (!result.ok) failed(target.returnTo, result.error);
    images.push(result.image);
  }

  const asPoster = formText(formData, 'asPoster') === 'on';
  try {
    await (await getEventRepository()).addEventPhotos(toEventActor(user), target.eventId, images, readCaption(formData), { asPoster });
  } catch (error) {
    failed(target.returnTo, toActionErrorCode(error));
  }
  await done(user, target, asPoster ? 'poster_set' : 'photos_uploaded');
}

export async function deletePhotoAction(formData: FormData): Promise<void> {
  const target = readTarget(formData);
  const user = await requireUser(target.returnTo);

  const photoId = formTrimmed(formData, 'photoId');
  if (!photoId) failed(target.returnTo, 'photo_not_found');

  try {
    await (await getEventRepository()).deleteEventPhoto(toEventActor(user), photoId);
  } catch (error) {
    failed(target.returnTo, toActionErrorCode(error));
  }
  await done(user, target, 'photo_deleted');
}

export async function setPosterAction(formData: FormData): Promise<void> {
  const target = readTarget(formData);
  const user = await requireUser(target.returnTo);

  const photoId = formTrimmed(formData, 'photoId');
  if (!photoId) failed(target.returnTo, 'photo_not_found');
  const isPoster = formText(formData, 'poster') === 'on';

  try {
    await (await getEventRepository()).setEventPoster(toEventActor(user), photoId, isPoster);
  } catch (error) {
    failed(target.returnTo, toActionErrorCode(error));
  }
  await done(user, target, isPoster ? 'poster_set' : 'poster_unset');
}

export async function saveVideoAction(formData: FormData): Promise<void> {
  const target = readTarget(formData);
  const user = await requireUser(target.returnTo);

  // "Lepas video" dan isian yang dikosongkan sama-sama melepas.
  const raw = formData.get('remove') === 'on' ? '' : formText(formData, 'videoUrl');
  const canonical = raw.trim() ? normalizeVideoUrl(raw) : null;
  if (raw.trim() && !canonical) failed(target.returnTo, 'invalid_video_url');

  try {
    await (await getEventRepository()).setEventVideo(toEventActor(user), target.eventId, canonical);
  } catch (error) {
    failed(target.returnTo, toActionErrorCode(error));
  }
  await done(user, target, canonical ? 'video_saved' : 'video_removed');
}
