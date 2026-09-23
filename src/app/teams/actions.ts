'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { AppError } from '@/lib/errors';
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
 */

/**
 * Pesan `AppError` ditulis manusia dan aman dibaca siapa pun (lihat
 * errors.ts), jadi boleh diteruskan ke URL. Error lain TIDAK: pesannya bisa
 * memuat detail driver Postgres. Untuk itu dipakai kalimat generik, dan
 * aslinya dibiarkan naik ke log server.
 */
function redirectWithError(returnTo: string, error: unknown): never {
  const message =
    error instanceof AppError ? error.message : 'Terjadi kesalahan. Coba lagi sebentar lagi.';
  const separator = returnTo.includes('?') ? '&' : '?';
  redirect(`${returnTo}${separator}error=${encodeURIComponent(message)}`);
}

export async function createTeamAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formData.get('returnTo')?.toString(), '/teams');
  const user = await requireUser(returnTo);

  const parsed = parseCreateTeamForm(formData);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? 'Data tim belum lengkap.';
    redirect(`${returnTo}?error=${encodeURIComponent(first)}`);
  }

  const repository = await getEventRepository();
  let teamId: string;
  try {
    teamId = await repository.createTeam({
      eventId: parsed.data.eventId,
      title: parsed.data.title,
      description: parsed.data.description,
      slotsNeeded: parsed.data.slotsNeeded,
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
  const returnTo = safeNextPath(formData.get('returnTo')?.toString(), '/teams');
  const user = await requireUser(returnTo);

  const teamId = formData.get('teamId')?.toString().trim();
  if (!teamId) redirect(returnTo);

  const repository = await getEventRepository();
  try {
    await repository.joinTeam(user.id, user.fullName, teamId);
  } catch (error) {
    redirectWithError(returnTo, error);
  }

  revalidatePath('/teams');
  revalidatePath(`/teams/${teamId}`);
  redirect(returnTo);
}

export async function leaveTeamAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formData.get('returnTo')?.toString(), '/teams');
  const user = await requireUser(returnTo);

  const teamId = formData.get('teamId')?.toString().trim();
  if (!teamId) redirect(returnTo);

  const repository = await getEventRepository();
  try {
    await repository.leaveTeam(user.id, teamId);
  } catch (error) {
    redirectWithError(returnTo, error);
  }

  revalidatePath('/teams');
  revalidatePath(`/teams/${teamId}`);
  redirect(returnTo);
}

export async function removeTeamMemberAction(formData: FormData): Promise<void> {
  const teamId = formData.get('teamId')?.toString().trim() ?? '';
  const returnTo = safeNextPath(formData.get('returnTo')?.toString(), `/teams/${teamId}`);
  const user = await requireUser(returnTo);

  const memberId = formData.get('memberId')?.toString().trim();
  if (!teamId || !memberId) redirect(returnTo);

  const repository = await getEventRepository();
  try {
    await repository.removeTeamMember(user.id, teamId, memberId);
  } catch (error) {
    redirectWithError(returnTo, error);
  }

  revalidatePath(`/teams/${teamId}`);
  redirect(returnTo);
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formData.get('returnTo')?.toString(), '/teams');
  const user = await requireUser(returnTo);

  const teamId = formData.get('teamId')?.toString().trim();
  if (!teamId) redirect(returnTo);

  const repository = await getEventRepository();
  try {
    await repository.deleteTeam(user.id, teamId);
  } catch (error) {
    // Tim yang gagal dibubarkan tidak boleh mengarahkan balik ke halaman
    // detailnya seolah berhasil — kembalikan ke daftar dengan pesan.
    redirectWithError('/teams', error);
  }

  revalidatePath('/teams');
  redirect('/teams');
}
