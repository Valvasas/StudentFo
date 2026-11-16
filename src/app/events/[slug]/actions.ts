'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionErrorCode, type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { checkAdminAccess, getSessionUser, toEventActor } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { parseEventComment } from '@/lib/event-comments';
import { formText, formTrimmed } from '@/lib/form-data';
import { loginHref } from '@/lib/safe-redirect';
import { ANSWER_MAX, normalizeQuestionText, QUESTION_BODY_MAX, QUESTION_BODY_MIN } from '@/lib/trust-safety';
import { REPORT_REASONS, type ReportReason } from '@/types/domain';

/** Slug dari form hanya dipakai membangun path internal — bentuknya dibatasi. */
function questionsPage(formData: FormData): string {
  const slug = formTrimmed(formData, 'slug');
  return /^[a-z0-9-]{1,120}$/.test(slug) ? `/events/${slug}` : '/events';
}

function back(page: string, feedback: { error?: ActionErrorCode; notice?: ActionNoticeCode }): string {
  return `${withQuery(page, { tab: 'tanya', ...feedback })}#tanya`;
}

async function run(page: string, action: () => Promise<void>, notice: ActionNoticeCode): Promise<never> {
  let failure: ActionErrorCode | null = null;
  try {
    await action();
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(back(page, { error: failure }));
  revalidatePath(page);
  redirect(back(page, { notice }));
}

/** Tanya-jawab kegiatan (ADR-062 #7). Hak menjawab/menghapus dicek di repository (produksi: RPC). */
export async function askQuestionAction(formData: FormData): Promise<void> {
  const page = questionsPage(formData);
  const user = await getSessionUser();
  if (!user) redirect(loginHref(`${page}?tab=tanya`));
  const body = normalizeQuestionText(formText(formData, 'body'), QUESTION_BODY_MIN, QUESTION_BODY_MAX);
  if (!body) redirect(back(page, { error: 'invalid_question' }));
  const eventId = formTrimmed(formData, 'eventId');
  await run(page, async () => (await getEventRepository()).askEventQuestion({ id: user.id, fullName: user.fullName }, eventId, body), 'question_sent');
}

export async function answerQuestionAction(formData: FormData): Promise<void> {
  const page = questionsPage(formData);
  const user = await getSessionUser();
  if (!user) redirect(loginHref(`${page}?tab=tanya`));
  const answer = normalizeQuestionText(formText(formData, 'answer'), 2, ANSWER_MAX);
  if (!answer) redirect(back(page, { error: 'invalid_answer' }));
  const questionId = formTrimmed(formData, 'questionId');
  await run(page, async () => (await getEventRepository()).answerEventQuestion(toEventActor(user), questionId, answer), 'question_answered');
}

export async function deleteQuestionAction(formData: FormData): Promise<void> {
  const page = questionsPage(formData);
  const user = await getSessionUser();
  if (!user) redirect(loginHref(`${page}?tab=tanya`));
  const questionId = formTrimmed(formData, 'questionId');
  await run(page, async () => (await getEventRepository()).deleteEventQuestion(user.id, questionId), 'question_deleted');
}

// ----------------------------------------------------------------------
// Suka & komentar (ADR-092). Hak dicek repository (produksi: RPC DEFINER);
// di sini hanya sesi, bentuk input, dan tujuan kembali yang tertutup.
// ----------------------------------------------------------------------

/** Kembali ke bagian yang sama: suka ke baris interaksi, komentar ke tabnya (atau komentar tertentu). */
function engagementBack(page: string, anchor: string, tab: 'komentar' | null, feedback: { error?: ActionErrorCode; notice?: ActionNoticeCode }): string {
  return `${withQuery(page, { tab: tab ?? undefined, ...feedback })}#${anchor}`;
}

/** Jangkar `#k-<id>` hanya dari id berbentuk id — nilai form lain tidak boleh jadi teks bebas di URL (ADR-019). */
function commentAnchor(id: string | null, fallback: string): string {
  return id && /^[A-Za-z0-9-]{1,64}$/.test(id) ? `k-${id}` : fallback;
}

/** Tab asal dari form — hanya nilai yang dikenal, supaya tidak jadi kanal teks bebas di URL. */
function tabFrom(formData: FormData): 'komentar' | null {
  return formText(formData, 'tab') === 'komentar' ? 'komentar' : null;
}

export async function toggleEventLikeAction(formData: FormData): Promise<void> {
  const page = questionsPage(formData);
  const tab = tabFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(loginHref(tab ? `${page}?tab=${tab}` : page));
  const eventId = formTrimmed(formData, 'eventId');

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).toggleEventLike(user.id, eventId);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  revalidatePath(page);
  redirect(engagementBack(page, 'interaksi', tab, failure ? { error: failure } : {}));
}

export async function createEventCommentAction(formData: FormData): Promise<void> {
  const page = questionsPage(formData);
  const user = await getSessionUser();
  if (!user) redirect(loginHref(`${page}?tab=komentar`));
  const parentId = formTrimmed(formData, 'parentId') || null;
  const anchor = commentAnchor(parentId, 'komentar');
  const parsed = parseEventComment(formText(formData, 'body'));
  if (!parsed.ok) {
    redirect(engagementBack(page, anchor, 'komentar', { error: parsed.problem === 'contact' ? 'community_contact_blocked' : 'invalid_event_comment' }));
  }
  const eventId = formTrimmed(formData, 'eventId');

  let failure: ActionErrorCode | null = null;
  let created: string | null = null;
  try {
    created = await (await getEventRepository()).createEventComment(toEventActor(user), eventId, parsed.value, parentId);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(engagementBack(page, anchor, 'komentar', { error: failure }));
  revalidatePath(page);
  redirect(engagementBack(page, parentId ? anchor : commentAnchor(created, 'komentar'), 'komentar', { notice: 'comment_sent' }));
}

export async function deleteEventCommentAction(formData: FormData): Promise<void> {
  const page = questionsPage(formData);
  const user = await getSessionUser();
  if (!user) redirect(loginHref(`${page}?tab=komentar`));
  const commentId = formTrimmed(formData, 'commentId');
  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).deleteEventComment(user.id, commentId);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(engagementBack(page, 'komentar', 'komentar', { error: failure }));
  revalidatePath(page);
  redirect(engagementBack(page, 'komentar', 'komentar', { notice: 'comment_deleted' }));
}

export async function reportEventCommentAction(formData: FormData): Promise<void> {
  const page = questionsPage(formData);
  const user = await getSessionUser();
  if (!user) redirect(loginHref(`${page}?tab=komentar`));
  const commentId = formTrimmed(formData, 'commentId');
  const rawReason = formText(formData, 'reason');
  const reason = (REPORT_REASONS as readonly string[]).includes(rawReason) ? (rawReason as ReportReason) : null;
  if (!reason) redirect(engagementBack(page, commentAnchor(commentId, 'komentar'), 'komentar', { error: 'invalid_report' }));
  const details = formText(formData, 'details').trim().slice(0, 1000) || null;
  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).reportEventComment(user.id, { commentId, reason, details });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  revalidatePath(page);
  redirect(engagementBack(page, failure ? commentAnchor(commentId, 'komentar') : 'komentar', 'komentar', failure ? { error: failure } : { notice: 'report_sent' }));
}

/** Moderator menyembunyikan komentar langsung dari halaman kegiatan — otorisasi DI SINI (Server Action = endpoint). */
export async function hideEventCommentAction(formData: FormData): Promise<void> {
  const page = questionsPage(formData);
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect(engagementBack(page, 'komentar', 'komentar', { error: 'invalid_request' }));
  const commentId = formTrimmed(formData, 'commentId');
  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).hideEventCommentAsAdmin({
      commentId,
      actorId: gate.userId,
      actorName: gate.userName,
      reason: formText(formData, 'reason').trim().slice(0, 500) || null,
    });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  revalidatePath(page);
  redirect(engagementBack(page, 'komentar', 'komentar', failure ? { error: failure } : { notice: 'comment_hidden' }));
}
