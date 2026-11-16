'use server';

import { redirect } from 'next/navigation';
import { type ActionErrorCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { EVENT_SHARE_LIMITS } from '@/lib/event-comments';
import { formList, formTrimmed } from '@/lib/form-data';
import { loginHref } from '@/lib/safe-redirect';

/**
 * Bagikan kegiatan ke koneksi (ADR-092). Penerima dari form TIDAK dipercaya:
 * repository (produksi: RPC) hanya mengabari koneksi yang diterima, tanpa
 * blokir, tidak ditangguhkan — sisanya dilewati diam-diam.
 */
export async function shareEventAction(formData: FormData): Promise<void> {
  const slug = formTrimmed(formData, 'slug');
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) redirect('/events');
  const page = `/events/${slug}/bagikan`;
  const user = await getSessionUser();
  if (!user) redirect(loginHref(page));

  const recipients = [...new Set(formList(formData, 'recipient'))];
  if (recipients.length === 0 || recipients.length > EVENT_SHARE_LIMITS.recipientsMax) redirect(withQuery(page, { error: 'invalid_share' }));

  const repository = await getEventRepository();
  // Di luar try: redirect() melempar NEXT_REDIRECT, dan catch akan menelannya.
  const event = await repository.getEventBySlug(slug);
  if (!event) redirect('/events');

  let failure: ActionErrorCode | null = null;
  let sent = 0;
  try {
    sent = await repository.shareEventWithConnections(user, event.id, recipients);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(withQuery(page, { error: failure }));
  if (sent === 0) redirect(withQuery(page, { error: 'share_empty' }));
  redirect(withQuery(`/events/${slug}`, { notice: 'event_shared' }));
}
