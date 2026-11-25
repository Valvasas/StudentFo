'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { workspacePath } from '@/components/organizer/event-workspace';
import { type ActionErrorCode, type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser, toEventActor, type AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { parseSchedule } from '@/lib/event-schedule';
import { EVENTS_CACHE_TAG } from '@/lib/data/cache';
import { GALLERY_LIMITS } from '@/lib/data/repository';
import { formText, formTrimmed } from '@/lib/form-data';
import { formFiles, readImageUpload, type UploadedImage } from '@/lib/image-file';
import { adminMediaPath } from '@/lib/media-paths';
import { safeNextPath } from '@/lib/safe-redirect';
import { movePhotoOrder } from '@/lib/data/listing';
import { cleanCaption, readSlideCaptions } from '@/lib/slides';
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
    return { eventId, returnTo: slug ? safeNextPath(adminMediaPath(slug, eventId || undefined), '/admin/promosi') : '/admin/promosi' };
  }
  return { eventId, returnTo: eventId ? safeNextPath(workspacePath(eventId, 'galeri'), '/penyelenggara') : '/penyelenggara' };
}

function failed(returnTo: string, error: ActionErrorCode): never {
  redirect(withQuery(returnTo, { notice: undefined, error }));
}

async function done(user: AuthUser, { eventId, returnTo }: MediaTarget, notice: ActionNoticeCode): Promise<never> {
  const slug = eventId ? (await (await getEventRepository()).getManagedEvent(user.id, eventId))?.event.slug : undefined;
  if (slug) revalidatePath(`/events/${slug}`);
  else revalidatePath('/events/[slug]', 'page');
  // Poster tampil di kartu setiap daftar (beranda, /events, tersimpan) yang di-cache dengan tag ini.
  revalidateTag(EVENTS_CACHE_TAG);
  revalidatePath(workspacePath(eventId, 'galeri'));
  revalidatePath(workspacePath(eventId));
  revalidatePath(returnTo.split('?')[0] ?? returnTo);
  redirect(withQuery(returnTo, { error: undefined, notice }));
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
  // Keterangan bersama (tanpa JS) jadi cadangan; keterangan per gambar menang bila diisi.
  const captions = readSlideCaptions(formData, 'photoCaption', images.length);
  try {
    await (await getEventRepository()).addEventPhotos(toEventActor(user), target.eventId, images, cleanCaption(formText(formData, 'caption')), {
      asPoster,
      captions,
    });
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

/**
 * Waktu pelaksanaan (ADR-100). Isian `datetime-local` ditafsirkan WIB di
 * server (`parseSchedule`); hak & urutan diperiksa lagi oleh repository/RPC.
 */
export async function saveScheduleAction(formData: FormData): Promise<void> {
  const target = readTarget(formData);
  const user = await requireUser(target.returnTo);

  const clear = formData.get('clear') === 'on';
  const parsed = clear ? { ok: true as const, startsAt: null, endsAt: null } : parseSchedule(formText(formData, 'startsAt'), formText(formData, 'endsAt'));
  if (!parsed.ok) failed(target.returnTo, 'invalid_schedule');

  try {
    await (await getEventRepository()).setEventSchedule(toEventActor(user), target.eventId, { startsAt: parsed.startsAt, endsAt: parsed.endsAt });
  } catch (error) {
    failed(target.returnTo, toActionErrorCode(error));
  }
  await done(user, target, parsed.startsAt ? 'schedule_saved' : 'schedule_cleared');
}

/**
 * Geser satu slide selangkah (ADR-094). Form biasa, tanpa JavaScript: urutan
 * baru dihitung di server dari urutan TERSIMPAN, bukan dari klien — dua tab
 * yang menggeser bersamaan tidak saling menghapus.
 */
export async function movePhotoAction(formData: FormData): Promise<void> {
  const target = readTarget(formData);
  const user = await requireUser(target.returnTo);

  const photoId = formTrimmed(formData, 'photoId');
  const direction = formText(formData, 'direction') === 'earlier' ? 'earlier' : 'later';
  const repository = await getEventRepository();
  const photos = await repository.listEventPhotos(target.eventId);
  const poster = photos.find((photo) => photo.isPoster);
  const slides = photos.filter((photo) => !photo.isPoster).map((photo) => photo.id);
  const next = movePhotoOrder(slides, photoId, direction);
  if (!next) failed(target.returnTo, 'photo_not_found');

  try {
    await repository.reorderEventPhotos(toEventActor(user), target.eventId, poster ? [poster.id, ...next] : next);
  } catch (error) {
    failed(target.returnTo, toActionErrorCode(error));
  }
  await done(user, target, 'photos_reordered');
}

export async function saveCaptionAction(formData: FormData): Promise<void> {
  const target = readTarget(formData);
  const user = await requireUser(target.returnTo);

  const photoId = formTrimmed(formData, 'photoId');
  if (!photoId) failed(target.returnTo, 'photo_not_found');
  try {
    await (await getEventRepository()).setEventPhotoCaption(toEventActor(user), photoId, cleanCaption(formText(formData, 'caption')));
  } catch (error) {
    failed(target.returnTo, toActionErrorCode(error));
  }
  await done(user, target, 'caption_saved');
}
