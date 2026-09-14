'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkAdminAccess } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { toApiError } from '@/lib/errors';

/**
 * Aksi moderasi.
 *
 * Otorisasi DIPERIKSA DI DALAM aksi, bukan hanya di halaman yang
 * merendernya. Server Action adalah endpoint HTTP yang bisa dipanggil
 * langsung; mengandalkan "halamannya kan sudah dijaga" berarti siapa pun
 * yang menemukan id aksinya bisa menyetujui event apa pun.
 *
 * Mengembalikan void dan melaporkan kegagalan lewat redirect berparameter,
 * bukan lewat nilai balik: dengan begitu form tetap berfungsi penuh tanpa
 * JavaScript, dan pesan errornya tetap sampai ke user.
 */
export async function reviewEventAction(formData: FormData): Promise<void> {
  let outcome: 'ok' | 'forbidden' | 'invalid' | 'failed' = 'ok';

  try {
    const gate = await checkAdminAccess();
    if (!gate.allowed) {
      outcome = 'forbidden';
    } else {
      const eventId = String(formData.get('eventId') ?? '').trim();
      const decision = String(formData.get('decision') ?? '');
      const reason = String(formData.get('reason') ?? '').slice(0, 500);

      if (!eventId || (decision !== 'APPROVED' && decision !== 'REJECTED')) {
        outcome = 'invalid';
      } else {
        const repository = await getEventRepository();
        await repository.reviewEvent({
          eventId,
          decision,
          reviewerId: gate.userId,
          ...(reason ? { reason } : {}),
        });
      }
    }
  } catch (error) {
    // Detail teknis hanya ke log server; user cuma perlu tahu aksinya gagal.
    toApiError(error);
    outcome = 'failed';
  }

  if (outcome !== 'ok') {
    // redirect() melempar internal — harus di luar try/catch, kalau tidak
    // blok catch di atas akan menangkapnya dan navigasinya batal.
    redirect(`/admin?status=${outcome}`);
  }

  revalidatePath('/admin');
  revalidatePath('/events');
  revalidatePath('/');
}
