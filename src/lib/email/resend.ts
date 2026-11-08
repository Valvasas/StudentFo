import type { OutgoingEmail } from './deadline-email';

/**
 * Pengirim lewat API batch Resend (≤ 100 email per permintaan). Batch gagal =
 * tidak satu pun di-ack, sehingga antrean ADR-051 membagikannya lagi setelah
 * sewa habis (at-least-once; dobel lebih murah daripada pengingat hilang).
 */
export const RESEND_BATCH_MAX = 100;

function redactEmails(value: string): string {
  return value.replace(/[^\s@"'<>]+@[^\s@"'<>]+/g, '[email]');
}

export type SendResult = { readonly ok: true } | { readonly ok: false; readonly status: number; readonly detail: string };

export async function sendResendBatch(
  emails: readonly OutgoingEmail[],
  { apiKey, from, fetchImpl = fetch }: { apiKey: string; from: string; fetchImpl?: typeof fetch },
): Promise<SendResult> {
  if (emails.length === 0) return { ok: true };
  if (emails.length > RESEND_BATCH_MAX) throw new Error(`Batch Resend maksimal ${RESEND_BATCH_MAX} email.`);
  try {
    const response = await fetchImpl('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(emails.map((email) => ({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html, headers: email.headers }))),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return { ok: true };
    // Pesan galat penyedia bisa memuat alamat penerima — cukup awalnya untuk log.
    return { ok: false, status: response.status, detail: redactEmails((await response.text()).slice(0, 200)) };
  } catch (error) {
    return { ok: false, status: 0, detail: error instanceof Error ? redactEmails(error.message.slice(0, 200)) : 'network' };
  }
}
