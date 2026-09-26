'use server';

import { redirect } from 'next/navigation';
import { toActionErrorCode, type ActionErrorCode } from '@/lib/action-feedback';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { currentClientIp, isRateLimited, passesCaptcha } from '@/lib/rate-limit-server';
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

  // Batas per email di Postgres (ADR-023) mudah diakali dengan mengarang
  // email; batas per IP menutupnya, dan dihitung sebelum CAPTCHA supaya
  // banjir dari satu mesin tidak menghabiskan kuota verifikasi Turnstile.
  const ip = await currentClientIp();
  if (await isRateLimited(ip, [[RATE_LIMITS.submissionPerIp]])) {
    redirect('/submit?error=submission_rate_limited');
  }
  if (!(await passesCaptcha(formData, ip))) redirect('/submit?error=captcha_failed');

  const { submittedByEmail, ...payload } = parsed.data;
  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    // Pengirim yang sedang masuk dikabari saat kirimannya ditinjau (ADR-037).
    const user = await getSessionUser();
    await repository.createSubmission({ submittedByEmail, submittedBy: user?.id ?? null, payload });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(`/submit?error=${failure}`);
  redirect('/submit?notice=submission_received');
}
