'use server';

import { redirect } from 'next/navigation';
import { toActionErrorCode, type ActionErrorCode } from '@/lib/action-feedback';
import { getEventRepository } from '@/lib/data';
import { isLikelyBot, parseSubmissionForm } from '@/lib/submission-schema';

/**
 * Kirim kegiatan dari komunitas (Phase 3).
 *
 * Boleh dipanggil tamu — policy `ugc_public_insert` memang mengizinkannya,
 * dan penyelenggara yang ingin mendaftarkan acaranya belum tentu punya akun.
 * Yang menjaga kualitas bukan gerbang login, tapi antrean moderasi: kiriman
 * TIDAK PERNAH tayang sebelum admin menyetujuinya di /admin.
 */
export async function submitEventAction(formData: FormData): Promise<void> {
  // Bot diperlakukan seolah berhasil. Memberi tahu bahwa ia tertangkap hanya
  // mengajarinya kolom mana yang harus dikosongkan.
  if (isLikelyBot(formData)) redirect('/submit?notice=submission_received');

  const parsed = parseSubmissionForm(formData);
  if (!parsed.success) {
    // Kolom yang gagal dioper sebagai daftar NAMA field dari skema kita
    // sendiri — bukan pesan — supaya halaman bisa menandai kolomnya tanpa
    // membuka pintu teks bebas di URL.
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))]
      .filter(Boolean)
      .join(',');
    redirect(`/submit?error=invalid_submission&fields=${encodeURIComponent(fields)}`);
  }

  const { submittedByEmail, ...payload } = parsed.data;
  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    await repository.createSubmission({ submittedByEmail, payload });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(`/submit?error=${failure}`);
  redirect('/submit?notice=submission_received');
}
