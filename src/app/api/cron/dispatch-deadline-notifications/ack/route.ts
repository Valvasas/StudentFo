import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { getEventRepository } from '@/lib/data';
import { DISPATCH_MAX_BATCH } from '@/lib/data/repository';
import { env } from '@/lib/env';
import { toApiError, unauthorized, validationFailed } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const ackSchema = z.object({
  notificationIds: z.array(z.string().min(1).max(200)).min(1).max(DISPATCH_MAX_BATCH),
});

/**
 * Tandai pengingat sudah terkirim (ADR-051).
 *
 *   POST /api/cron/dispatch-deadline-notifications/ack
 *   Authorization: Bearer <CRON_SECRET>
 *   { "notificationIds": ["…", "…"] }
 *
 * Idempoten: ack ulang, id asing, atau id yang belum pernah diklaim tidak
 * dihitung — `acknowledged` adalah jumlah yang BENAR-BENAR berubah.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isAuthorizedCronRequest(request.headers.get('authorization'), env.CRON_SECRET)) {
      throw unauthorized('Token tidak valid.');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw validationFailed('Body harus JSON: { "notificationIds": [ … ] }.');
    }
    const parsed = ackSchema.safeParse(body);
    if (!parsed.success) {
      throw validationFailed(`notificationIds wajib berisi 1–${DISPATCH_MAX_BATCH} id.`);
    }

    const acknowledged = await (await getEventRepository()).acknowledgeDeadlineDispatches(parsed.data.notificationIds);
    return NextResponse.json({ acknowledged }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const { body, status } = toApiError(error);
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
