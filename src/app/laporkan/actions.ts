'use server';

import { redirect } from 'next/navigation';
import { type ActionErrorCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formText } from '@/lib/form-data';
import { loginHref, safeNextPath } from '@/lib/safe-redirect';
import { parseReportForm } from '@/lib/trust-safety';

/**
 * Kirim laporan (ADR-061). Pelapor = pengguna dari sesi server, tidak pernah
 * dari form. `self` & `back` hanya path internal (`safeNextPath`) — keduanya
 * berasal dari form, jadi tidak dipercaya sebagai tujuan bebas.
 */
export async function reportContentAction(formData: FormData): Promise<void> {
  const self = safeNextPath(formText(formData, 'self'));
  const back = safeNextPath(formText(formData, 'back'));
  const user = await getSessionUser();
  if (!user) redirect(loginHref(self));

  const report = parseReportForm({
    subjectType: formText(formData, 'subjectType'),
    subjectId: formText(formData, 'subjectId'),
    reason: formText(formData, 'reason'),
    details: formText(formData, 'details'),
  });
  if (!report) redirect(withQuery(self, { error: 'invalid_report' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).reportContent(user.id, report);
  } catch (error) {
    failure = toActionErrorCode(error);
  }

  if (failure) redirect(withQuery(self, { error: failure }));
  redirect(withQuery(back, { notice: 'report_sent' }));
}
