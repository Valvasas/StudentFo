'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { withQuery } from '@/lib/action-feedback';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText, formTrimmed } from '@/lib/form-data';
import { institutionById } from '@/lib/institutions';
import { parseOutboundAnswers, SKIPPED_ANSWERS, type OutboundSurveyAnswers } from '@/lib/outbound-survey';
import { rememberOutboundSurvey } from '@/lib/outbound-survey-cookie';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { recordSignal } from '@/lib/recommendation-signals';
import { registrationDestination } from '@/lib/registration-destination';
import { isRateLimited, requestClientIp } from '@/lib/rate-limit-server';
import { isLikelyHumanAgent } from '@/lib/signal-filter';
import { HONEYPOT_FIELD } from '@/lib/submission-schema';

/**
 * Catat kunjungan pendataan kinerja (ADR-070/073). TIDAK PERNAH melempar:
 * bot, banjir dari satu IP, honeypot terisi, atau database yang gagal hanya
 * membuat kunjungan tidak dicatat — orangnya tetap diantar ke pendaftaran.
 * Menahan pendaftar demi angka statistik adalah urutan prioritas yang salah.
 */
async function recordVisit(eventId: string, answers: OutboundSurveyAnswers, skipped: boolean, honeypotFilled: boolean): Promise<void> {
  try {
    const requestHeaders = await headers();
    if (honeypotFilled || !isLikelyHumanAgent(requestHeaders.get('user-agent'))) return;
    if (await isRateLimited(requestClientIp(requestHeaders), [[RATE_LIMITS.outboundSurveyPerIp]])) return;
    const signedIn = Boolean(await getSessionUser());
    await (await getEventRepository()).recordOutboundSurvey({ ...answers, eventId, signedIn, skipped });
  } catch (error) {
    console.error('[pendataan-kinerja] gagal dicatat:', error);
  }
}

export async function submitOutboundSurveyAction(formData: FormData): Promise<void> {
  const slug = formTrimmed(formData, 'slug');
  const repository = await getEventRepository();
  const event = /^[a-z0-9-]{1,255}$/.test(slug) ? await repository.getEventBySlug(slug) : null;
  if (!event) redirect('/events');

  // "Lewati" tidak divalidasi sama sekali — apa pun isian setengah jadinya, ia dibuang.
  const skipped = formText(formData, 'intent') === 'skip';
  let answers = SKIPPED_ANSWERS;
  if (!skipped) {
    const parsed = parseOutboundAnswers(formData, await repository.getOutboundSurveyConfig(), (id) => institutionById(id)?.name ?? null);
    if (!parsed.ok) redirect(withQuery(`/events/${event.slug}/sebelum-daftar`, { error: 'invalid_outbound_survey', kolom: parsed.problem }));
    answers = parsed.value;
  }

  const destination = await registrationDestination(event, repository);
  await recordVisit(event.id, answers, skipped, formText(formData, HONEYPOT_FIELD) !== '');
  await rememberOutboundSurvey(event.id);
  if (!destination) redirect(`/events/${event.slug}`);
  await recordSignal('register_click', event.id, await getSessionUser());
  // LANGSUNG ke tujuan resmi, bukan lewat `/daftar`: redirect Server Action ke
  // path internal membuat Next merender tujuan itu di server — dan ikut
  // mengikuti 303 rute `/daftar` sampai ke situs penyelenggara. Tujuannya tetap
  // dari `registrationDestination()` yang sama dengan `/daftar`.
  redirect(destination.url);
}
