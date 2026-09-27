'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { parseConnectionMessage, parseNetworkProfileForm } from '@/lib/network';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Server Action fitur Koneksi (ADR-040).
 *
 * Setiap action memanggil `requireUser()` SENDIRI (AGENTS.md §6); siapa
 * yang boleh menjawab/memutus diperiksa di repository, dengan RLS sebagai
 * penjaga terakhirnya di produksi. Hasil dioper sebagai KODE (ADR-019).
 *
 * `AuthUser` memenuhi `NetworkViewer` apa adanya, jadi diteruskan langsung
 * — mode seed butuh nama & profil pelaku untuk ditampilkan ke pihak lain.
 */

const FALLBACK = '/connections';

function done(returnTo: string, notice: ActionNoticeCode): never {
  revalidatePath('/connections');
  redirect(withQuery(returnTo, { error: undefined, notice }));
}

function failed(returnTo: string, error: unknown): never {
  redirect(withQuery(returnTo, { notice: undefined, error: toActionErrorCode(error) }));
}

export async function requestConnectionAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), FALLBACK);
  const user = await requireUser(returnTo);

  const targetId = formTrimmed(formData, 'targetId');
  if (!targetId) redirect(withQuery(returnTo, { error: 'invalid_request' }));
  const message = parseConnectionMessage(formText(formData, 'message'));
  if (!message.success) redirect(withQuery(returnTo, { error: 'invalid_connection_message' }));

  let outcome: 'requested' | 'accepted';
  try {
    outcome = await (await getEventRepository()).requestConnection(user, targetId, message.data);
  } catch (error) {
    failed(returnTo, error);
  }
  done(returnTo, outcome === 'accepted' ? 'connection_matched' : 'connection_requested');
}

export async function respondConnectionAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), FALLBACK);
  const user = await requireUser(returnTo);

  const connectionId = formTrimmed(formData, 'connectionId');
  const decision = formText(formData, 'decision');
  if (!connectionId || (decision !== 'accept' && decision !== 'decline')) {
    redirect(withQuery(returnTo, { error: 'invalid_request' }));
  }

  try {
    await (await getEventRepository()).respondToConnection(user.id, connectionId, decision);
  } catch (error) {
    failed(returnTo, error);
  }
  done(returnTo, decision === 'accept' ? 'connection_accepted' : 'connection_declined');
}

export async function removeConnectionAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), FALLBACK);
  const user = await requireUser(returnTo);

  const connectionId = formTrimmed(formData, 'connectionId');
  if (!connectionId) redirect(withQuery(returnTo, { error: 'invalid_request' }));

  try {
    await (await getEventRepository()).removeConnection(user.id, connectionId);
  } catch (error) {
    failed(returnTo, error);
  }
  done(returnTo, formText(formData, 'kind') === 'cancel' ? 'connection_cancelled' : 'connection_removed');
}

export async function updateNetworkProfileAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), FALLBACK);
  const user = await requireUser(returnTo);

  const parsed = parseNetworkProfileForm(formData);
  if (!parsed.success) redirect(withQuery(returnTo, { error: 'invalid_network_profile' }));

  try {
    await (await getEventRepository()).updateNetworkProfile(user, parsed.data);
  } catch (error) {
    failed(returnTo, error);
  }
  done(returnTo, 'network_profile_saved');
}

/**
 * Blokir (ADR-041). Memutus koneksi/ajakan yang ada di antara kedua pihak
 * dan mencegah ajakan baru dari kedua arah — bukan cuma dari yang diblokir.
 */
export async function blockPersonAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), FALLBACK);
  const user = await requireUser(returnTo);

  const targetId = formTrimmed(formData, 'targetId');
  if (!targetId) redirect(withQuery(returnTo, { error: 'invalid_request' }));
  if (targetId === user.id) redirect(withQuery(returnTo, { error: 'block_self' }));

  try {
    await (await getEventRepository()).blockPerson(user.id, targetId);
  } catch (error) {
    failed(returnTo, error);
  }
  done(returnTo, 'person_blocked');
}

export async function unblockPersonAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), FALLBACK);
  const user = await requireUser(returnTo);

  const targetId = formTrimmed(formData, 'targetId');
  if (!targetId) redirect(withQuery(returnTo, { error: 'invalid_request' }));

  try {
    await (await getEventRepository()).unblockPerson(user.id, targetId);
  } catch (error) {
    failed(returnTo, error);
  }
  done(returnTo, 'person_unblocked');
}
