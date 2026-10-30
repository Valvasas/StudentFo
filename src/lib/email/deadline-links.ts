import { siteUrl } from '@/lib/env';
import { createUnsubscribeToken } from './unsubscribe-token';

/** Semua tautan di email pengingat — absolut, karena dibuka dari aplikasi email. */
export function deadlineEmailLinks(userId: string, eventSlug: string, secret: string) {
  const token = createUnsubscribeToken(userId, secret);
  const url = (path: string) => new URL(path, siteUrl).toString();
  return {
    eventUrl: url(`/events/${encodeURIComponent(eventSlug)}`),
    unsubscribeUrl: url(`/berhenti-email?token=${encodeURIComponent(token)}`),
    oneClickUrl: url(`/api/email/berhenti?token=${encodeURIComponent(token)}`),
    settingsUrl: url('/profile/settings#pengingat-email'),
  };
}
