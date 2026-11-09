'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formTrimmed } from '@/lib/form-data';
import { parseLobbyMember } from '@/lib/lobby';

/**
 * Aksi lobi lomba (ADR-071). Setiap aksi memanggil `requireUser()` sendiri
 * (AGENTS.md §6); kelayakan (sudah mendaftar, lomba masih buka, ajakan hanya
 * ke koneksi) diperiksa repository — di produksi oleh RPC SECURITY DEFINER.
 *
 * Tujuan kembali selalu dirakit dari slug yang divalidasi, bukan dari
 * `returnTo` bebas: lobi hanya punya satu halaman.
 */

async function lobbyContext(formData: FormData) {
  const slug = formTrimmed(formData, 'slug');
  if (!/^[a-z0-9-]{1,255}$/.test(slug)) redirect('/lobi');
  const page = `/lobi/${slug}`;
  const user = await requireUser(page);
  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(slug);
  if (!event) redirect('/lobi');
  return { user, repository, event, page };
}

function done(page: string, notice: ActionNoticeCode, anchor = ''): never {
  revalidatePath('/lobi', 'layout');
  redirect(`${withQuery(page, { error: undefined, notice })}${anchor}`);
}

function failed(page: string, error: unknown, anchor = ''): never {
  redirect(`${withQuery(page, { notice: undefined, error: toActionErrorCode(error) })}${anchor}`);
}

export async function joinLobbyAction(formData: FormData): Promise<void> {
  const { user, repository, event, page } = await lobbyContext(formData);
  const parsed = parseLobbyMember(formData);
  if (!parsed.success) redirect(withQuery(page, { notice: undefined, error: 'invalid_lobby' }));

  const wasMember = (await repository.getLobby(user, event.id))?.me !== null;
  try {
    await repository.joinLobby(user, event.id, parsed.data);
  } catch (error) {
    failed(page, error);
  }
  done(page, wasMember ? 'lobby_updated' : 'lobby_joined');
}

export async function leaveLobbyAction(formData: FormData): Promise<void> {
  const { user, repository, event, page } = await lobbyContext(formData);
  try {
    await repository.leaveLobby(user.id, event.id);
  } catch (error) {
    failed(page, error);
  }
  done(page, 'lobby_left');
}

export async function inviteToLobbyAction(formData: FormData): Promise<void> {
  const { user, repository, event, page } = await lobbyContext(formData);
  const inviteeId = formTrimmed(formData, 'inviteeId');
  if (!inviteeId) redirect(withQuery(page, { notice: undefined, error: 'lobby_invite_invalid' }));

  let outcome: 'invited' | 'already';
  try {
    outcome = await repository.inviteToLobby(user, event.id, inviteeId);
  } catch (error) {
    failed(page, error, '#ajak-teman');
  }
  done(page, outcome === 'invited' ? 'lobby_invited' : 'lobby_already_invited', '#ajak-teman');
}
