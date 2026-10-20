'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { parseSeekerForm } from '@/lib/matchmaking-schema';
import { parseConnectionMessage } from '@/lib/network';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Server Action pencocokan tim (ADR-057). Seperti aksi Koneksi: tiap aksi
 * memanggil `requireUser()` SENDIRI (AGENTS.md §6), hasilnya dioper sebagai
 * KODE (ADR-019), dan `AuthUser` memenuhi `NetworkViewer` apa adanya.
 */

const PAGE = '/teams/cocok';

/** Hanya kembali ke halaman ini (dengan saringannya), tidak ke tujuan lain. */
function matchReturnTo(value: string): string {
  const safe = safeNextPath(value, PAGE);
  return safe === PAGE || safe.startsWith(`${PAGE}?`) ? safe : PAGE;
}

export async function saveSeekerAction(formData: FormData): Promise<void> {
  const user = await requireUser(PAGE);

  const parsed = parseSeekerForm(formData);
  if (!parsed.success) {
    redirect(withQuery(PAGE, { error: 'invalid_seeker_profile', fields: parsed.fields.join(','), ubah: '1' }));
  }

  let wasOpen: boolean;
  try {
    const repository = await getEventRepository();
    wasOpen = (await repository.getSeekerProfile(user.id))?.open ?? false;
    await repository.saveSeekerProfile(user, parsed.data);
  } catch (error) {
    redirect(withQuery(PAGE, { error: toActionErrorCode(error), ubah: '1' }));
  }

  revalidatePath(PAGE);
  // Perayaan hanya saat kartu BARU dibuka; menyimpan ulang kartu yang sudah
  // terbuka cukup kabar biasa. `cari=1` memutar pemindaian pertama.
  const opened = parsed.data.open && !wasOpen;
  redirect(withQuery(PAGE, { notice: opened ? 'seeker_opened' : 'seeker_saved', cari: parsed.data.open ? '1' : undefined }));
}

export async function inviteMatchAction(formData: FormData): Promise<void> {
  const returnTo = matchReturnTo(formText(formData, 'returnTo'));
  const user = await requireUser(returnTo);

  const targetId = formTrimmed(formData, 'targetId');
  if (!targetId || targetId.length > 64) redirect(withQuery(returnTo, { error: 'invalid_request', cari: undefined }));
  const message = parseConnectionMessage(formText(formData, 'message'));
  if (!message.success) redirect(withQuery(returnTo, { error: 'invalid_connection_message', cari: undefined }));

  let outcome: 'requested' | 'accepted';
  try {
    outcome = await (await getEventRepository()).requestConnection(user, targetId, message.data);
  } catch (error) {
    // `cari` dibuang: kembali dari galat tidak perlu memutar ulang pemindaian.
    redirect(withQuery(returnTo, { notice: undefined, error: toActionErrorCode(error), cari: undefined }));
  }

  revalidatePath('/connections');
  redirect(withQuery(returnTo, { error: undefined, notice: outcome === 'accepted' ? 'connection_matched' : 'match_invited', cari: undefined }));
}
