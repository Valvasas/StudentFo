'use server';

import { redirect } from 'next/navigation';
import { getEventRepository } from '@/lib/data';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import { env } from '@/lib/env';
import { formTrimmed } from '@/lib/form-data';

export async function stopDeadlineEmailsAction(formData: FormData): Promise<void> {
  const userId = verifyUnsubscribeToken(formTrimmed(formData, 'token'), env.EMAIL_LINK_SECRET);
  if (!userId) redirect('/berhenti-email');
  let ok = true;
  try {
    await (await getEventRepository()).stopDeadlineEmailsByLink(userId);
  } catch (error) {
    console.error('[email] gagal berhenti lewat halaman:', error);
    ok = false;
  }
  redirect(ok ? '/berhenti-email?selesai=1' : `/berhenti-email?token=${encodeURIComponent(formTrimmed(formData, 'token'))}&gagal=1`);
}
