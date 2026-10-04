import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { getEventRepository } from '@/lib/data';
import { DISPATCH_LEASE_SECONDS, DISPATCH_MAX_BATCH } from '@/lib/data/repository';
import { env, siteUrl } from '@/lib/env';
import { toApiError, unauthorized } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const DEFAULT_BATCH = 100;

/**
 * Antrean pengingat tenggat H-3/H-1 untuk kanal luar (ADR-051).
 *
 *   POST /api/cron/dispatch-deadline-notifications?limit=100
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Mengklaim (menyewa 15 menit) pengingat yang belum terkirim dan
 * mengembalikan payload siap pakai. Setelah pesan BENAR-BENAR terkirim,
 * pemanggil wajib POST id-nya ke `…/ack`; yang tidak di-ack dibagikan lagi
 * setelah sewa habis (at-least-once — lebih baik dobel daripada hilang).
 *
 * POST, bukan GET: permintaan ini MENGUBAH state (klaim). GET boleh diulang
 * oleh proxy, prefetch, atau pemindai tautan tanpa niat — dan setiap
 * pengulangan akan "menghabiskan" pengingat tanpa pernah dikirim.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isAuthorizedCronRequest(request.headers.get('authorization'), env.CRON_SECRET)) {
      throw unauthorized('Token tidak valid.');
    }

    const requested = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), DISPATCH_MAX_BATCH) : DEFAULT_BATCH;
    const claimedAt = new Date();
    const dispatches = await (await getEventRepository()).claimDeadlineDispatches(limit);

    return NextResponse.json(
      {
        claimedAt: claimedAt.toISOString(),
        leaseSeconds: DISPATCH_LEASE_SECONDS,
        ackUrl: new URL('/api/cron/dispatch-deadline-notifications/ack', siteUrl).toString(),
        count: dispatches.length,
        dispatches: dispatches.map((item) => ({
          ...item,
          event: { ...item.event, url: new URL(`/events/${encodeURIComponent(item.event.slug)}`, siteUrl).toString() },
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const { body, status } = toApiError(error);
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export function GET(): NextResponse {
  return NextResponse.json(
    { error: 'Gunakan POST — mengambil antrean mengklaim pengingat.', code: 'VALIDATION_FAILED' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
