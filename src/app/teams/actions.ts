'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { safeNextPath } from '@/lib/safe-redirect';
import { parseCreateTeamForm } from '@/lib/team-schema';

/**
 * Server Action untuk tim lomba (Phase 3).
 *
 * Setiap action di berkas ini memanggil `requireUser()` SENDIRI. Server
 * Action adalah endpoint HTTP tersendiri: halaman yang merender tombolnya
 * boleh saja sudah memeriksa sesi, tapi pemanggil bisa melewati halaman itu
 * sepenuhnya (AGENTS.md §6).
 *
 * Kepemilikan tim (siapa boleh mengeluarkan anggota / membubarkan tim)
 * diperiksa di lapisan repository, tempat RLS jadi penjaga terakhirnya di
 * produksi — bukan di sini.
 *
 * Kegagalan dilaporkan sebagai KODE (`?error=team_full`), tidak pernah
 * sebagai teks pesan — lihat `action-feedback.ts` untuk alasannya.
 */

function redirectWithError(returnTo: string, error: unknown): never {
  redirect(withQuery(returnTo, { error: toActionErrorCode(error) }));
}

export async function createTeamAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), '/teams');
  const user = await requireUser(returnTo);

  const parsed = parseCreateTeamForm(formData);
  if (!parsed.success) redirect(withQuery(returnTo, { error: 'invalid_team_form' }));

  let teamId: string;
  try {
    const repository = await getEventRepository();
    teamId = await repository.createTeam({
      ...parsed.data,
      createdBy: user.id,
      createdByName: user.fullName,
    });
  } catch (error) {
    redirectWithError(returnTo, error);
  }

  revalidatePath('/teams');
  redirect(`/teams/${teamId}`);
}

export async function joinTeamAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), '/teams');
  const user = await requireUser(returnTo);

  const teamId = formTrimmed(formData, 'teamId');
  if (!teamId) redirect(returnTo);

  try {
    const repository = await getEventRepository();
    await repository.joinTeam(user.id, user.fullName, teamId);
  } catch (error) {
    redirectWithError(returnTo, error);
  }

  revalidatePath('/teams');
  revalidatePath(`/teams/${teamId}`);
  redirect(returnTo);
}

export async function leaveTeamAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), '/teams');
  const user = await requireUser(returnTo);

  const teamId = formTrimmed(formData, 'teamId');
  if (!teamId) redirect(returnTo);

  try {
    const repository = await getEventRepository();
    await repository.leaveTeam(user.id, teamId);
  } catch (error) {
    redirectWithError(returnTo, error);
  }

  revalidatePath('/teams');
  revalidatePath(`/teams/${teamId}`);
  redirect(returnTo);
}

export async function removeTeamMemberAction(formData: FormData): Promise<void> {
  const teamId = formTrimmed(formData, 'teamId');
  const returnTo = safeNextPath(formText(formData, 'returnTo'), `/teams/${teamId}`);
  const user = await requireUser(returnTo);

  const memberId = formTrimmed(formData, 'memberId');
  if (!teamId || !memberId) redirect(returnTo);

  try {
    const repository = await getEventRepository();
    await repository.removeTeamMember(user.id, teamId, memberId);
  } catch (error) {
    redirectWithError(returnTo, error);
  }

  revalidatePath(`/teams/${teamId}`);
  redirect(returnTo);
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), '/teams');
  const user = await requireUser(returnTo);

  const teamId = formTrimmed(formData, 'teamId');
  if (!teamId) redirect(returnTo);

  try {
    const repository = await getEventRepository();
    await repository.deleteTeam(user.id, teamId);
  } catch (error) {
    // Tim yang gagal dibubarkan tidak boleh mengarahkan balik ke halaman
    // detailnya seolah berhasil — kembalikan ke daftar dengan pesan.
    redirectWithError('/teams', error);
  }

  revalidatePath('/teams');
  redirect('/teams');
}
