'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { toActionErrorCode, type ActionErrorCode } from '@/lib/action-feedback';
import { checkAdminAccess } from '@/lib/auth';
import { getEventRepository, resetDemoData } from '@/lib/data';
import { dataMode } from '@/lib/env';
import { toApiError } from '@/lib/errors';
import { formText, formTrimmed } from '@/lib/form-data';

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

type Decision = 'APPROVED' | 'REJECTED';

function parseDecision(formData: FormData): Decision | null {
  const decision = formText(formData, 'decision');
  return decision === 'APPROVED' || decision === 'REJECTED' ? decision : null;
}

function refreshPublicViews(): void {
  revalidatePath('/admin');
  revalidatePath('/admin/riwayat');
  revalidatePath('/events');
  revalidatePath('/');
}

export async function reviewEventAction(formData: FormData): Promise<void> {
  let outcome: 'ok' | 'forbidden' | 'invalid' | 'failed' = 'ok';

  try {
    const gate = await checkAdminAccess();
    const eventId = formTrimmed(formData, 'eventId');
    const decision = parseDecision(formData);
    const reason = formText(formData, 'reason').slice(0, 500);

    if (!gate.allowed) {
      outcome = 'forbidden';
    } else if (!eventId || !decision) {
      outcome = 'invalid';
    } else {
      const repository = await getEventRepository();
      await repository.reviewEvent({
        eventId,
        decision,
        reviewerId: gate.userId,
        reviewerName: gate.userName,
        ...(reason ? { reason } : {}),
      });
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

  refreshPublicViews();
}

export async function reviewSubmissionAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const submissionId = formTrimmed(formData, 'submissionId');
  const decision = parseDecision(formData);
  if (!submissionId || !decision) redirect('/admin?error=invalid_request');

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    await repository.reviewSubmission({
      submissionId,
      decision,
      reviewerId: gate.userId,
      reviewerName: gate.userName,
    });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(`/admin?error=${failure}`);

  refreshPublicViews();
  redirect(`/admin?notice=${decision === 'APPROVED' ? 'submission_approved' : 'submission_rejected'}`);
}

/**
 * Bangun ulang data demo dari seed. Hanya mode seed + admin demo; di mode
 * Supabase aksi ini menolak, karena tidak ada "data contoh" untuk direset
 * dan tombol hapus-semua di produksi tidak boleh ada sama sekali.
 */
export async function resetDemoDataAction(): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed || dataMode !== 'seed') redirect('/admin?status=forbidden');

  resetDemoData();
  revalidatePath('/', 'layout');
  redirect('/admin?notice=demo_reset');
}
