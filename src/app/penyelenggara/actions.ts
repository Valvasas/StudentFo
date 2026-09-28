'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { buildRevisionChanges, eventClaimSchema, parseOrganizerApplication } from '@/lib/organizer';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Server Action penyelenggara (ADR-042).
 *
 * Setiap action memanggil `requireUser()` SENDIRI (AGENTS.md §6). Hak
 * (terverifikasi? mengelola acara ini?) diperiksa repository — dan di
 * produksi oleh RLS/trigger — bukan oleh halaman yang merender form-nya.
 */

const FALLBACK = '/penyelenggara';

function done(returnTo: string, notice: ActionNoticeCode): never {
  revalidatePath('/penyelenggara', 'layout');
  redirect(withQuery(returnTo, { error: undefined, notice }));
}

function failed(returnTo: string, error: unknown): never {
  redirect(withQuery(returnTo, { notice: undefined, error: toActionErrorCode(error) }));
}

export async function applyOrganizerAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), FALLBACK);
  const user = await requireUser(returnTo);

  const parsed = parseOrganizerApplication(formData);
  if (!parsed.success) redirect(withQuery(returnTo, { notice: undefined, error: 'invalid_organizer_application' }));

  try {
    await (await getEventRepository()).applyAsOrganizer(
      { id: user.id, fullName: user.fullName, email: user.email },
      parsed.data,
    );
  } catch (error) {
    failed(returnTo, error);
  }
  done(returnTo, 'organizer_applied');
}

export async function claimEventAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), FALLBACK);
  const user = await requireUser(returnTo);

  const parsed = eventClaimSchema.safeParse({
    eventId: formTrimmed(formData, 'eventId'),
    evidence: formText(formData, 'evidence'),
  });
  if (!parsed.success) redirect(withQuery(returnTo, { notice: undefined, error: 'invalid_claim' }));

  try {
    await (await getEventRepository()).claimEvent(user.id, parsed.data.eventId, parsed.data.evidence);
  } catch (error) {
    failed(returnTo, error);
  }
  done(returnTo, 'claim_submitted');
}

export async function proposeRevisionAction(formData: FormData): Promise<void> {
  const eventId = formTrimmed(formData, 'eventId');
  const returnTo = safeNextPath(formText(formData, 'returnTo'), FALLBACK);
  const user = await requireUser(returnTo);

  // Selisih dihitung terhadap data acara SAAT INI dari server, bukan
  // terhadap nilai lama yang dikirim form (yang bisa dikarang).
  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(formTrimmed(formData, 'slug'));
  if (!event || event.id !== eventId) redirect(withQuery(returnTo, { notice: undefined, error: 'not_event_manager' }));

  const built = buildRevisionChanges(event, formData);
  if (!built.ok) redirect(withQuery(returnTo, { notice: undefined, error: built.error }));

  try {
    await repository.proposeEventRevision(user.id, event.id, built.changes, built.note);
  } catch (error) {
    failed(returnTo, error);
  }
  done(returnTo, 'revision_submitted');
}
