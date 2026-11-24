'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { actionError, type ActionErrorCode, type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { isPerAddressEmailThrottle } from '@/lib/auth-messages';
import { checkAdminAccess } from '@/lib/auth';
import { getEventRepository, resetDemoData } from '@/lib/data';
import { EVENTS_CACHE_TAG } from '@/lib/data/cache';
import { dataMode, siteUrl } from '@/lib/env';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { isAccountRateLimited } from '@/lib/rate-limit-server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppError, toApiError } from '@/lib/errors';
import { parsePresentationForm } from '@/lib/event-presentation';
import { isEventDeleteConfirmed, takedownReasonText } from '@/lib/event-removal';
import { formList, formText, formTrimmed } from '@/lib/form-data';
import { isDeleteConfirmed, MODERATION_NOTE_MAX, normalizeUserSearch, SUSPENSION_REASON_MIN } from '@/lib/trust-safety';
import { runMediaImports } from '@/lib/media-import/run';
import { VERIFIED_FIELD } from '@/components/admin/verification-check';
import { EVENT_STATUSES, toVerificationLevel, type VerificationLevel } from '@/types/domain';

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

/** Centang `VerificationCheck` (ADR-096): tanpa centang, tingkat tidak diubah (bawaan Dari sumber publik). */
function verifiedLevel(formData: FormData, decision: Decision): { verificationLevel?: VerificationLevel } {
  return decision === 'APPROVED' && formText(formData, VERIFIED_FIELD) === '1' ? { verificationLevel: 'MODERATOR_VERIFIED' } : {};
}

export async function reviewEventAction(formData: FormData): Promise<void> {
  let outcome: 'ok' | 'forbidden' | 'invalid' | 'failed' = 'ok';
  let trustPending = false;

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
        ...verifiedLevel(formData, decision),
      });
    }
  } catch (error) {
    // Keputusannya SUDAH tersimpan; hanya labelnya menunggu migration.
    if (error instanceof AppError && error.reason === 'trust_unavailable') {
      trustPending = true;
    } else {
      // Detail teknis hanya ke log server; user cuma perlu tahu aksinya gagal.
      toApiError(error);
      outcome = 'failed';
    }
  }

  if (outcome !== 'ok') {
    // redirect() melempar internal — harus di luar try/catch, kalau tidak
    // blok catch di atas akan menangkapnya dan navigasinya batal.
    redirect(`/admin?status=${outcome}`);
  }

  refreshPublicViews();
  if (trustPending) redirect('/admin?error=trust_unavailable');
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
      ...verifiedLevel(formData, decision),
    });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  // `trust_unavailable` = kiriman SUDAH tayang; katalog tetap perlu disegarkan.
  if (failure === 'trust_unavailable') refreshPublicViews();
  if (failure) redirect(`/admin?error=${failure}`);

  refreshPublicViews();
  redirect(`/admin?notice=${decision === 'APPROVED' ? 'submission_approved' : 'submission_rejected'}`);
}

/** Sama dengan BULK_REVIEW_LIMIT di `components/admin/bulk-approve-bar.tsx`. */
const BULK_REVIEW_LIMIT = 50;

/**
 * "Setujui yang dipilih" (ADR-093). Gerbang admin SEKALI, lalu jalur yang
 * sama dengan satu kartu (`reviewEvent`/`reviewSubmission`) per id — riwayat
 * moderasi tetap tercatat per kegiatan. Satu yang gagal (duplikat, sudah
 * ditinjau admin lain) tidak menghentikan sisanya.
 */
export async function bulkApproveAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const kind = formText(formData, 'kind');
  if ((kind !== 'events' && kind !== 'submissions') || formText(formData, 'decision') !== 'APPROVED') {
    redirect(withQuery('/admin', { error: 'invalid_request' }));
  }
  const ids = [...new Set(formList(formData, 'ids').map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) redirect(withQuery('/admin', { error: 'bulk_empty' }));
  if (ids.length > BULK_REVIEW_LIMIT) redirect(withQuery('/admin', { error: 'bulk_too_many' }));

  const repository = await getEventRepository();
  let approved = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      if (kind === 'events') {
        await repository.reviewEvent({ eventId: id, decision: 'APPROVED', reviewerId: gate.userId, reviewerName: gate.userName });
      } else {
        await repository.reviewSubmission({ submissionId: id, decision: 'APPROVED', reviewerId: gate.userId, reviewerName: gate.userName });
      }
      approved += 1;
    } catch (error) {
      toApiError(error);
      failed += 1;
    }
  }

  if (approved > 0) refreshPublicViews();
  redirect(
    withQuery('/admin', {
      notice: approved > 0 ? 'bulk_approved' : undefined,
      error: failed > 0 ? 'bulk_partial' : undefined,
    }),
  );
}

/**
 * Email uji (ADR-093, audit 14 Nov §1 F5): kirim email atur ulang sandi ke
 * alamat admin SENDIRI lewat SMTP Supabase dan tampilkan hasilnya apa adanya.
 * Halaman lupa sandi untuk umum tetap seragam (AGENTS.md #12) — hanya admin
 * yang melihat kegagalan SMTP, dan hanya untuk alamatnya sendiri.
 */
export async function sendTestEmailAction(): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');
  if (dataMode === 'seed') redirect(withQuery('/', { error: 'email_test_unavailable' }));
  if (await isAccountRateLimited(gate.userId, RATE_LIMITS.emailTestPerAccount)) redirect(withQuery('/', { error: 'email_test_throttled' }));

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) redirect('/admin?status=forbidden');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  });
  if (error) {
    if (isPerAddressEmailThrottle(error)) redirect(withQuery('/', { error: 'email_test_throttled' }));
    console.error('[email-uji] gagal dikirim:', error.code ?? error.status, error.message);
    redirect(withQuery('/', { error: 'email_test_failed' }));
  }
  redirect(withQuery('/', { notice: 'email_test_sent' }));
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
  const hideQuestionId = formTrimmed(formData, 'hideQuestionId');
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
    if (outcome === 'RESOLVED' && hideQuestionId) {
      await repository.hideEventQuestion({ questionId: hideQuestionId, actorId: gate.userId, actorName: gate.userName, reason: note || 'Disembunyikan setelah laporan pengguna' });
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

/**
 * Laporan Komunitas (ADR-087): satu keputusan menutup SEMUA laporan terbuka
 * atas tulisan itu. "Sembunyikan" hanya bersama "ditindak" — final, bukan
 * otomatis; "abaikan" memunculkan lagi tulisan yang tersembunyi otomatis.
 */
export async function resolveCommunityReportAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const reportId = formTrimmed(formData, 'reportId');
  const outcome = formText(formData, 'outcome');
  if (!reportId || (outcome !== 'RESOLVED' && outcome !== 'DISMISSED')) redirect(withQuery(REPORTS_PAGE, { error: 'invalid_request' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).resolveCommunityReport({
      reportId,
      actorId: gate.userId,
      actorName: gate.userName,
      outcome,
      hide: outcome === 'RESOLVED' && formData.get('hide') === 'on',
      note: formText(formData, 'note').trim().slice(0, MODERATION_NOTE_MAX) || null,
    });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(withQuery(REPORTS_PAGE, { error: failure }));
  revalidatePath('/komunitas', 'layout');
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
 * Cabut foto profil & banner unggahan (ADR-083): untuk gambar tidak pantas
 * atau foto orang lain. Akunnya sendiri tidak disentuh — penangguhan adalah
 * keputusan terpisah — dan pemiliknya bisa mengunggah gambar baru.
 */
export async function clearProfileMediaAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const userId = formTrimmed(formData, 'userId');
  const reason = formText(formData, 'reason').trim().slice(0, MODERATION_NOTE_MAX);
  if (!userId) redirect(usersPage(formData, { error: 'invalid_request' }));
  if (reason.length < SUSPENSION_REASON_MIN) redirect(usersPage(formData, { error: 'suspension_reason_required' }));

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    await repository.clearProfileMediaAsAdmin({ userId, actorId: gate.userId, actorName: gate.userName, reason });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(usersPage(formData, { error: failure }));
  // Foto itu tampil di menu akun, Koneksi, tim, dan lobi — bukan hanya di halaman ini.
  revalidatePath('/', 'layout');
  redirect(usersPage(formData, { notice: 'profile_media_cleared' }));
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

// ----------------------------------------------------------------------
// Kelola postingan (ADR-092 #1): hapus (turunkan) kapan saja — juga sebelum
// tenggat — lalu urungkan / tayangkan lagi, atau hapus permanen.
// ----------------------------------------------------------------------

const EVENTS_PAGE = '/admin/acara';

/** Kembali ke pencarian yang sama — hanya sebagai NILAI parameter, bukan path dari form. */
function eventsPage(formData: FormData, feedback: { error?: ActionErrorCode; notice?: ActionNoticeCode; urungkan?: string }): string {
  const status = formText(formData, 'status');
  return withQuery(EVENTS_PAGE, {
    q: normalizeUserSearch(formText(formData, 'q')) || undefined,
    status: (EVENT_STATUSES as readonly string[]).includes(status) ? status : undefined,
    ...feedback,
  });
}

export async function takeDownEventAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const eventId = formTrimmed(formData, 'eventId');
  const reason = takedownReasonText(formText(formData, 'preset'), formText(formData, 'details'));
  if (!eventId) redirect(eventsPage(formData, { error: 'invalid_request' }));
  if (!reason) redirect(eventsPage(formData, { error: 'deletion_reason_required' }));

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    const event = await repository.getEventForAdmin(eventId);
    if (!event) throw actionError('event_not_found');
    // Tercatat di riwayat sebagai keputusan moderasi biasa (trigger log), bisa diurungkan.
    await repository.reviewEvent({ eventId, decision: 'REJECTED', reviewerId: gate.userId, reviewerName: gate.userName, reason });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(eventsPage(formData, { error: failure }));
  refreshPublicViews();
  revalidatePath(EVENTS_PAGE);
  redirect(eventsPage(formData, { notice: 'event_taken_down', urungkan: eventId }));
}

/** Urungkan / tayangkan lagi postingan yang diturunkan — langsung tayang, bukan kembali ke antrean. */
export async function restoreEventAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const eventId = formTrimmed(formData, 'eventId');
  if (!eventId) redirect(eventsPage(formData, { error: 'invalid_request' }));

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    const event = await repository.getEventForAdmin(eventId);
    if (!event) throw actionError('event_not_found');
    if (event.status !== 'REJECTED') throw actionError('moderation_not_rejected');
    await repository.reviewEvent({ eventId, decision: 'APPROVED', reviewerId: gate.userId, reviewerName: gate.userName });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(eventsPage(formData, { error: failure }));
  refreshPublicViews();
  revalidatePath(EVENTS_PAGE);
  redirect(eventsPage(formData, { notice: 'event_restored' }));
}

/**
 * Label kepercayaan & tanda data uji (ADR-096) dari Kelola postingan. Dua
 * field opsional; yang tidak dikirim tidak diubah. Bisa dibalik seketika,
 * jadi tanpa dialog konfirmasi (CONVENTIONS § konfirmasi).
 */
export async function setEventTrustAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const eventId = formTrimmed(formData, 'eventId');
  const level = toVerificationLevel(formText(formData, 'verificationLevel'));
  const demo = formText(formData, 'isDemo');
  const isDemo = demo === '1' ? true : demo === '0' ? false : undefined;
  if (!eventId || (!level && isDemo === undefined)) redirect(eventsPage(formData, { error: 'invalid_request' }));

  let failure: ActionErrorCode | null = null;
  try {
    const repository = await getEventRepository();
    await repository.setEventTrust({ eventId, ...(level ? { verificationLevel: level } : {}), ...(isDemo !== undefined ? { isDemo } : {}) });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(eventsPage(formData, { error: failure }));
  refreshPublicViews();
  revalidatePath(EVENTS_PAGE);
  redirect(eventsPage(formData, { notice: 'event_trust_updated' }));
}

export async function deleteEventPermanentlyAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const eventId = formTrimmed(formData, 'eventId');
  if (!eventId) redirect(eventsPage(formData, { error: 'invalid_request' }));
  if (!isEventDeleteConfirmed(formText(formData, 'confirm'))) redirect(eventsPage(formData, { error: 'event_delete_confirm' }));
  const reason = takedownReasonText(formText(formData, 'preset'), formText(formData, 'details'));
  if (!reason) redirect(eventsPage(formData, { error: 'deletion_reason_required' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).deleteEventPermanently({ eventId, actorId: gate.userId, actorName: gate.userName, reason });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(eventsPage(formData, { error: failure }));
  refreshPublicViews();
  revalidatePath(EVENTS_PAGE);
  revalidatePath('/admin/riwayat');
  redirect(eventsPage(formData, { notice: 'event_deleted' }));
}

/** Laporan komentar kegiatan (ADR-092) — pola laporan Komunitas: satu keputusan menutup semua laporan terbuka komentar itu. */
export async function resolveEventCommentReportAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  const reportId = formTrimmed(formData, 'reportId');
  const outcome = formText(formData, 'outcome');
  if (!reportId || (outcome !== 'RESOLVED' && outcome !== 'DISMISSED')) redirect(withQuery(REPORTS_PAGE, { error: 'invalid_request' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).resolveEventCommentReport({
      reportId,
      actorId: gate.userId,
      actorName: gate.userName,
      outcome,
      hide: outcome === 'RESOLVED' && formData.get('hide') === 'on',
      note: formText(formData, 'note').trim().slice(0, MODERATION_NOTE_MAX) || null,
    });
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(withQuery(REPORTS_PAGE, { error: failure }));
  revalidatePath('/events', 'layout');
  revalidatePath(REPORTS_PAGE);
  redirect(withQuery(REPORTS_PAGE, { notice: outcome === 'RESOLVED' ? 'report_resolved' : 'report_dismissed' }));
}

/**
 * Impor media otomatis (ADR-095): kerjakan antrean gambar sekarang, tanpa
 * menunggu jadwal. Satu batch per klik — sisanya diambil klik/jadwal
 * berikutnya; klaim bersewa membuat klik ganda tidak mengerjakan baris sama.
 */
export async function processMediaImportsAction(): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');
  let notice: ActionNoticeCode = 'media_imports_idle';
  let error: ActionErrorCode | undefined;
  try {
    const run = await runMediaImports(8);
    if (run.claimed > 0) notice = 'media_imports_processed';
  } catch (caught) {
    error = toActionErrorCode(caught);
  }
  revalidatePath('/admin');
  redirect(withQuery('/admin', error ? { error } : { notice }));
}

/** Antrekan daftar gambar bawaan untuk satu kegiatan (mis. yang masuk sebelum fitur ini ada). */
export async function queueMediaImportsAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');
  const eventId = formTrimmed(formData, 'eventId');
  let target: string;
  try {
    const added = await (await getEventRepository()).queueMediaImports(eventId, null);
    target = withQuery('/admin', added > 0 ? { notice: 'media_imports_queued' } : { error: 'media_imports_full' });
  } catch (caught) {
    target = withQuery('/admin', { error: toActionErrorCode(caught) });
  }
  revalidatePath('/admin');
  redirect(target);
}
