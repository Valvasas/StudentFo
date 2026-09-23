'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Menandai notifikasi sudah dibaca.
 *
 * Otorisasi diperiksa DI DALAM action ini lewat `requireUser()`, bukan
 * diwariskan dari halaman yang merender tombolnya — Server Action adalah
 * endpoint HTTP tersendiri yang bisa dipanggil langsung (AGENTS.md §6).
 *
 * `userId` juga diteruskan ke repository dan ikut jadi filter di query
 * UPDATE, sehingga id notifikasi milik orang lain yang ditebak-tebak tidak
 * mengubah apa pun. Tidak ada pesan error khusus untuk kasus itu: memberi
 * tahu "id ini ada tapi bukan milikmu" adalah kebocoran informasi.
 */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), '/');
  const user = await requireUser(returnTo);

  const notificationId = formTrimmed(formData, 'notificationId');
  if (!notificationId) {
    redirect(returnTo);
  }

  const repository = await getEventRepository();
  await repository.markNotificationAsRead(user.id, notificationId);

  revalidatePath(returnTo);
  redirect(returnTo);
}

export async function markAllNotificationsReadAction(formData: FormData): Promise<void> {
  const returnTo = safeNextPath(formText(formData, 'returnTo'), '/');
  const user = await requireUser(returnTo);

  const repository = await getEventRepository();
  await repository.markAllNotificationsAsRead(user.id);

  revalidatePath(returnTo);
  redirect(returnTo);
}
