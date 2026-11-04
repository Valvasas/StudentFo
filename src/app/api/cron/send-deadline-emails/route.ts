import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { getEventRepository } from '@/lib/data';
import { renderDeadlineEmail } from '@/lib/email/deadline-email';
import { deadlineEmailLinks } from '@/lib/email/deadline-links';
import { RESEND_BATCH_MAX, sendResendBatch } from '@/lib/email/resend';
import { emailRemindersConfigured, env } from '@/lib/env';
import { toApiError, unauthorized } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/** 5 × 100 email per pemanggilan; sisanya diambil pemanggilan berikutnya. */
const MAX_BATCHES = 5;
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Pengirim pengingat tenggat lewat email (ADR-062 #6).
 *
 *   POST /api/cron/send-deadline-emails
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Klaim antrean ADR-051 (hanya pengingat milik yang menyetujui email) →
 * kirim per batch lewat Resend → ack yang terkirim. Batch gagal tidak di-ack
 * dan dibagikan lagi setelah sewa 15 menit habis; jawaban 502 membuat
 * pemanggil (workflow) gagal sehingga terlihat.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isAuthorizedCronRequest(request.headers.get('authorization'), env.CRON_SECRET)) {
      throw unauthorized('Token tidak valid.');
    }
    // Tidak mengklaim apa pun bila tidak bisa mengirim: klaim tanpa kirim hanya menunda pengingat 15 menit.
    if (!emailRemindersConfigured) {
      return NextResponse.json(
        { error: 'Pengiriman email belum dikonfigurasi (RESEND_API_KEY, EMAIL_FROM, EMAIL_LINK_SECRET).', code: 'EMAIL_NOT_CONFIGURED' },
        { status: 503, headers: NO_STORE },
      );
    }

    const repository = await getEventRepository();
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (let batch = 0; batch < MAX_BATCHES && failed === 0; batch += 1) {
      const claimed = await repository.claimDeadlineDispatches(RESEND_BATCH_MAX);
      if (claimed.length === 0) break;

      const deliverable = claimed.flatMap((item) => (item.recipient.email ? [{ ...item, recipient: { ...item.recipient, email: item.recipient.email } }] : []));
      const result = await sendResendBatch(
        deliverable.map((item) => renderDeadlineEmail(item, deadlineEmailLinks(item.recipient.userId, item.event.slug, env.EMAIL_LINK_SECRET!))),
        { apiKey: env.RESEND_API_KEY!, from: env.EMAIL_FROM! },
      );
      if (!result.ok) {
        failed += deliverable.length;
        console.error(JSON.stringify({ event: 'deadline_email_failed', status: result.status, detail: result.detail, count: deliverable.length }));
        break;
      }
      // Tanpa alamat (tidak terjadi di Supabase — users.email NOT NULL) tidak bisa dikirim
      // kapan pun: di-ack supaya tidak berputar di antrean selamanya.
      skipped += claimed.length - deliverable.length;
      sent += deliverable.length;
      await repository.acknowledgeDeadlineDispatches(claimed.map((item) => item.notificationId));
    }

    return NextResponse.json({ sent, skipped, failed }, { status: failed > 0 ? 502 : 200, headers: NO_STORE });
  } catch (error) {
    const { body, status } = toApiError(error);
    return NextResponse.json(body, { status, headers: NO_STORE });
  }
}

export function GET(): NextResponse {
  return NextResponse.json(
    { error: 'Gunakan POST — pengiriman mengklaim antrean.', code: 'VALIDATION_FAILED' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
