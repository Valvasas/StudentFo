'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { actionError, toActionErrorCode, withQuery, type ActionErrorCode } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { parsePortfolioInput } from '@/lib/portfolio';
import { recordSignal } from '@/lib/recommendation-signals';
import { safeNextPath } from '@/lib/safe-redirect';
import { TRACKER_STATUSES, type TrackerStatus } from '@/types/domain';

/**
 * Aksi saved events & application tracker.
 *
 * Setiap aksi memanggil `requireUser()` sendiri (AGENTS.md §6). Kegagalan
 * repository ditangkap dan dilaporkan sebagai KODE di URL, bukan dibiarkan
 * naik jadi halaman error — menekan "Simpan" di kartu tidak boleh
 * menjatuhkan seluruh halaman jelajah.
 */

function isTrackerStatus(value: string): value is TrackerStatus {
  return (TRACKER_STATUSES as readonly string[]).includes(value);
}

function refreshTrackerViews(): void {
  revalidatePath('/tracker');
  revalidatePath('/events');
  revalidatePath('/');
}

export async function toggleSaveEventAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), '/events');
  const user = await requireUser(returnTo);

  const eventId = formTrimmed(formData, 'eventId');
  if (!eventId) redirect(returnTo);

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    if (await repository.isEventSaved(user.id, eventId)) {
      await repository.unsaveEvent(user.id, eventId);
    } else {
      await repository.saveEvent(user.id, eventId);
      await repository.addTrackerItemIfAbsent(user.id, eventId);
      await recordSignal('save', eventId, user);
    }
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(withQuery(returnTo, { error: failure }));
  refreshTrackerViews();
  redirect(returnTo);
}

export async function updateTrackerStatusAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), '/tracker');
  const user = await requireUser(returnTo);

  const eventId = formTrimmed(formData, 'eventId');
  const status = formTrimmed(formData, 'status');
  const notesRaw = formData.get('notes');
  const notes = typeof notesRaw === 'string' ? notesRaw.slice(0, 500).trim() || null : undefined;

  if (!eventId || !isTrackerStatus(status)) {
    redirect(withQuery(returnTo, { error: 'invalid_request' }));
  }

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    await repository.upsertTrackerItem(user.id, eventId, status, notes);
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(withQuery(returnTo, { error: failure }));
  revalidatePath('/tracker');
  redirect(returnTo);
}

export async function removeTrackerAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), '/tracker');
  const user = await requireUser(returnTo);

  const eventId = formTrimmed(formData, 'eventId');
  if (!eventId) redirect(returnTo);

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    await repository.removeTrackerItem(user.id, eventId);
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(withQuery(returnTo, { error: failure }));
  revalidatePath('/tracker');
  redirect(returnTo);
}

/**
 * Hasil & visibilitas portofolio (ADR-046). Jenis kegiatan dibaca dari
 * tracker milik pengguna sendiri — bukan dari form — supaya pilihan hasil
 * divalidasi terhadap kegiatan yang benar.
 */
export async function updatePortfolioAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), '/profile?tab=portofolio');
  const user = await requireUser(returnTo);

  const eventId = formTrimmed(formData, 'eventId');
  if (!eventId) redirect(withQuery(returnTo, { error: 'invalid_request' }));

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    const item = (await repository.listTrackerItems(user.id)).find((entry) => entry.eventId === eventId);
    if (!item) throw actionError('portfolio_not_eligible');
    const input = parsePortfolioInput(
      {
        achievement: formTrimmed(formData, 'achievement'),
        note: formText(formData, 'achievementNote'),
        proofUrl: formText(formData, 'proofUrl'),
        visible: formData.get('visible') === 'on',
      },
      item.event.eventType,
    );
    if (!input) throw actionError('invalid_portfolio');
    await repository.updatePortfolioEntry(user.id, eventId, input);
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(withQuery(returnTo, { error: failure, notice: undefined }));
  revalidatePath('/profile');
  revalidatePath('/tracker');
  redirect(withQuery(returnTo, { notice: 'portfolio_saved', error: undefined }));
}
