'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionUser, requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { safeNextPath } from '@/lib/safe-redirect';
import { TRACKER_STATUSES, type TrackerStatus } from '@/types/domain';

/**
 * Server Action untuk menyimpan atau membatalkan simpanan kegiatan.
 * Mengikuti prinsip zero client-side JavaScript (form submit + redirect aman).
 */
export async function toggleSaveEventAction(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId')?.toString().trim();
  const returnTo = safeNextPath(formData.get('returnTo')?.toString(), '/events');

  if (!eventId) {
    redirect(returnTo);
  }

  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }

  const repository = await getEventRepository();
  const isSaved = await repository.isEventSaved(user.id, eventId);

  if (isSaved) {
    await repository.unsaveEvent(user.id, eventId);
  } else {
    await repository.saveEvent(user.id, eventId);
    // Masukkan ke tracker otomatis dengan status SAVED jika belum ada di tracker
    await repository.upsertTrackerItem(user.id, eventId, 'SAVED');
  }

  revalidatePath('/tracker');
  revalidatePath('/events');
  revalidatePath('/');
  redirect(returnTo);
}

/**
 * Server Action untuk memperbarui tahapan status lamaran di application_tracker.
 */
export async function updateTrackerStatusAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formData.get('returnTo')?.toString(), '/tracker');
  const user = await requireUser(returnTo);

  const eventId = formData.get('eventId')?.toString().trim();
  const rawStatus = formData.get('status')?.toString().trim() as TrackerStatus;
  const notesRaw = formData.get('notes')?.toString();
  const notes = notesRaw !== undefined ? notesRaw.slice(0, 500).trim() : undefined;

  if (!eventId || !TRACKER_STATUSES.includes(rawStatus)) {
    redirect(`${returnTo}?error=invalid_status`);
  }

  const repository = await getEventRepository();
  await repository.upsertTrackerItem(user.id, eventId, rawStatus, notes);

  revalidatePath('/tracker');
  redirect(returnTo);
}

/**
 * Server Action untuk menghapus entri dari tracker.
 */
export async function removeTrackerAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formData.get('returnTo')?.toString(), '/tracker');
  const user = await requireUser(returnTo);

  const eventId = formData.get('eventId')?.toString().trim();
  if (!eventId) {
    redirect(returnTo);
  }

  const repository = await getEventRepository();
  await repository.removeTrackerItem(user.id, eventId);

  revalidatePath('/tracker');
  redirect(returnTo);
}

