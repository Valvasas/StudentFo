'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionErrorCode, type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { checkAdminAccess } from '@/lib/auth';
import { getEventRepository, resetDemoData } from '@/lib/data';
import { EVENTS_CACHE_TAG } from '@/lib/data/cache';
import { dataMode } from '@/lib/env';
import { toApiError } from '@/lib/errors';
import { parsePresentationForm } from '@/lib/event-presentation';
import { formText, formTrimmed } from '@/lib/form-data';
import { isDeleteConfirmed, MODERATION_NOTE_MAX, normalizeUserSearch } from '@/lib/trust-safety';

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
  // Data Cache katalog publik (SupabaseEventRepository): tanpa ini event yang
  // baru disetujui baru tampil setelah TTL 5 menit habis.
  revalidateTag(EVENTS_CACHE_TAG);
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
    const reason = formText(formData, 'reason').trim().slice(0, 500);
    await repository.reviewSubmission({
      submissionId,
      decision,
      reviewerId: gate.userId,
      reviewerName: gate.userName,
      ...(decision === 'REJECTED' && reason ? { reason } : {}),
    });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(`/admin?error=${failure}`);

  refreshPublicViews();
  redirect(`/admin?notice=${decision === 'APPROVED' ? 'submission_approved' : 'submission_rejected'}`);
}

// ----------------------------------------------------------------------
// Lencana otoritas & promosi berbayar (ADR-049)
// ----------------------------------------------------------------------

const PRESENTATION_PAGE = '/admin/promosi';

export async function updateEventPresentationAction(formData: FormData): Promise<void> {
  // Pencarian yang sedang dibuka ikut dibawa pulang, tapi hanya sebagai
  // NILAI parameter `q` — bukan path bebas dari form (open redirect).
  const search = formText(formData, 'q').trim().slice(0, 120);
  const returnTo = withQuery(PRESENTATION_PAGE, { q: search || undefined });

  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const parsed = parsePresentationForm(formData);
  if (!parsed.success) redirect(withQuery(returnTo, { error: 'invalid_presentation' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).updateEventPresentation(parsed.data);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(withQuery(returnTo, { error: failure }));

  // Lencana & urutan promosi tampil di katalog publik yang di-cache.
  refreshPublicViews();
  revalidatePath(PRESENTATION_PAGE);
  redirect(withQuery(returnTo, { notice: 'presentation_saved' }));
}

// ----------------------------------------------------------------------
// Penyelenggara, klaim, dan perubahan acara (ADR-042)
// ----------------------------------------------------------------------

const TRUST_QUEUE = '/admin/penyelenggara';

function trustReturnTo(formData: FormData): string {
  const tab = formText(formData, 'tab');
  return tab === 'klaim' || tab === 'perubahan' ? `${TRUST_QUEUE}?tab=${tab}` : TRUST_QUEUE;
}

async function runTrustDecision(
  formData: FormData,
  notice: ActionNoticeCode,
  decide: (gate: { userId: string; userName: string }, note: string | null) => Promise<void>,
  refreshCatalog: boolean,
): Promise<never> {
  const returnTo = trustReturnTo(formData);
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  // Menolak/mencabut tanpa alasan tidak bisa dipertanggungjawabkan ke
  // pemohon maupun di riwayat — `required` di form saja bisa dilewati.
  const note = formText(formData, 'note').trim().slice(0, 500) || null;
  const decision = formText(formData, 'decision');
  if (!note && (decision === 'REJECTED' || decision === 'REVOKED')) {
    redirect(withQuery(returnTo, { error: 'invalid_request' }));
  }

  let failure: ActionErrorCode | null = null;
  try {
    await decide(gate, note);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(withQuery(returnTo, { error: failure }));

  revalidatePath(TRUST_QUEUE);
  revalidatePath('/admin/riwayat');
  // Lencana & isi acara publik berubah: status penyelenggara memengaruhi
  // lencana di semua acaranya, revisi mengubah isi acara.
  if (refreshCatalog) refreshPublicViews();
  redirect(withQuery(returnTo, { notice }));
}

export async function reviewOrganizerAction(formData: FormData): Promise<void> {
  const userId = formTrimmed(formData, 'userId');
  const decision = formText(formData, 'decision');
  if (!userId || (decision !== 'VERIFIED' && decision !== 'REJECTED' && decision !== 'REVOKED')) {
    redirect(withQuery(trustReturnTo(formData), { error: 'invalid_request' }));
  }
  await runTrustDecision(
    formData,
    'organizer_reviewed',
    async (gate, note) =>
      (await getEventRepository()).reviewOrganizer({ userId, decision, reviewerId: gate.userId, reviewerName: gate.userName, note }),
    true,
  );
}

export async function reviewClaimAction(formData: FormData): Promise<void> {
  const claimId = formTrimmed(formData, 'claimId');
  const decision = parseDecision(formData);
  if (!claimId || !decision) redirect(withQuery(trustReturnTo(formData), { error: 'invalid_request' }));
  await runTrustDecision(
    formData,
    'claim_reviewed',
    async (gate, note) =>
      (await getEventRepository()).reviewClaim({ claimId, decision, reviewerId: gate.userId, reviewerName: gate.userName, note }),
    decision === 'APPROVED',
  );
}

export async function reviewRevisionAction(formData: FormData): Promise<void> {
  const revisionId = formTrimmed(formData, 'revisionId');
  const decision = parseDecision(formData);
  if (!revisionId || !decision) redirect(withQuery(trustReturnTo(formData), { error: 'invalid_request' }));
  await runTrustDecision(
    formData,
    'revision_reviewed',
    async (gate, note) =>
      (await getEventRepository()).reviewRevision({ revisionId, decision, reviewerId: gate.userId, reviewerName: gate.userName, note }),
    decision === 'APPROVED',
  );
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

/**
 * Jalan balik "Tolak" (ADR-046): kegiatan/kiriman kembali ke antrean.
 * Perubahan statusnya tercatat di log seperti keputusan lain, jadi
 * pemulihan pun punya jejak siapa & kapan.
 */
export async function restoreRejectedAction(formData: FormData): Promise<void> {
  const HISTORY = '/admin/riwayat';
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const subjectType = formTrimmed(formData, 'subjectType');
  const subjectId = formTrimmed(formData, 'subjectId');
  if ((subjectType !== 'event' && subjectType !== 'submission') || !subjectId) {
    redirect(withQuery(HISTORY, { error: 'invalid_request' }));
  }

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).restoreRejected({
      subjectType,
      subjectId,
      reviewerId: gate.userId,
      reviewerName: gate.userName,
    });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(withQuery(HISTORY, { error: failure }));
  revalidatePath('/admin');
  revalidatePath(HISTORY);
  redirect(withQuery(HISTORY, { notice: 'moderation_restored' }));
}

// ----------------------------------------------------------------------
// Laporan konten & manajemen pengguna (ADR-061)
// ----------------------------------------------------------------------

const REPORTS_PAGE = '/admin/laporan';
const USERS_PAGE = '/admin/pengguna';

export async function resolveReportAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const reportId = formTrimmed(formData, 'reportId');
  const outcome = formText(formData, 'outcome');
  const note = formText(formData, 'note').trim().slice(0, MODERATION_NOTE_MAX);
  // Hanya terkirim bila kotak "turunkan kegiatan" dicentang.
  const takedownEventId = formTrimmed(formData, 'takedownEventId');
  if (!reportId || (outcome !== 'RESOLVED' && outcome !== 'DISMISSED')) redirect(withQuery(REPORTS_PAGE, { error: 'invalid_request' }));

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    if (outcome === 'RESOLVED' && takedownEventId) {
      // Jalur moderasi biasa: tercatat di log sebagai APPROVED → REJECTED oleh admin ini.
      await repository.reviewEvent({
        eventId: takedownEventId,
        decision: 'REJECTED',
        reviewerId: gate.userId,
        reviewerName: gate.userName,
        reason: note || 'Diturunkan setelah laporan pengguna',
      });
    }
    await repository.resolveReport({ reportId, actorId: gate.userId, actorName: gate.userName, outcome, note: note || null });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(withQuery(REPORTS_PAGE, { error: failure }));
  if (outcome === 'RESOLVED' && takedownEventId) refreshPublicViews();
  revalidatePath(REPORTS_PAGE);
  redirect(withQuery(REPORTS_PAGE, { notice: outcome === 'RESOLVED' ? 'report_resolved' : 'report_dismissed' }));
}

/** Kembali ke pencarian yang sama — hanya sebagai NILAI `q`, bukan path dari form. */
function usersPage(formData: FormData, feedback: { error?: ActionErrorCode; notice?: ActionNoticeCode }): string {
  return withQuery(USERS_PAGE, { q: normalizeUserSearch(formText(formData, 'q')) || undefined, ...feedback });
}

export async function setUserSuspensionAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const userId = formTrimmed(formData, 'userId');
  const mode = formText(formData, 'mode');
  if (!userId || (mode !== 'suspend' && mode !== 'restore')) redirect(usersPage(formData, { error: 'invalid_request' }));

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    await repository.setUserSuspension({
      userId,
      actorId: gate.userId,
      actorName: gate.userName,
      suspend: mode === 'suspend',
      reason: formText(formData, 'reason').trim().slice(0, MODERATION_NOTE_MAX) || null,
    });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(usersPage(formData, { error: failure }));
  revalidatePath(USERS_PAGE);
  redirect(usersPage(formData, { notice: mode === 'suspend' ? 'user_suspended' : 'user_unsuspended' }));
}

/**
 * Hapus akun atas permintaan pemiliknya (mis. lewat email, UU PDP Pasal 8) atau
 * karena pelanggaran berat. Wajib alasan + frasa konfirmasi; tercatat di riwayat
 * tanpa nama pemilik.
 */
export async function deleteUserAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const userId = formTrimmed(formData, 'userId');
  const reason = formText(formData, 'reason').trim().slice(0, MODERATION_NOTE_MAX);
  if (!userId) redirect(usersPage(formData, { error: 'invalid_request' }));
  if (!isDeleteConfirmed(formText(formData, 'confirm'))) redirect(usersPage(formData, { error: 'account_delete_confirm' }));
  if (reason.length < 5) redirect(usersPage(formData, { error: 'suspension_reason_required' }));

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    await repository.deleteAccount({ userId, actorId: gate.userId, actorName: gate.userName, reason });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(usersPage(formData, { error: failure }));
  revalidatePath(USERS_PAGE);
  redirect(withQuery(USERS_PAGE, { notice: 'user_deleted' }));
}
