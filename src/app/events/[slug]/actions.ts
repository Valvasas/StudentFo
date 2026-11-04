'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionErrorCode, type ActionNoticeCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { getSessionUser, toEventActor } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { loginHref } from '@/lib/safe-redirect';
import { ANSWER_MAX, normalizeQuestionText, QUESTION_BODY_MAX, QUESTION_BODY_MIN } from '@/lib/trust-safety';

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
