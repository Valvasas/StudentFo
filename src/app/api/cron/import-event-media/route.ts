import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { env } from '@/lib/env';
import { toApiError, unauthorized } from '@/lib/errors';
import { runMediaImports } from '@/lib/media-import/run';

export const dynamic = 'force-dynamic';
// Unduhan & penggambaran poster bisa beberapa detik per gambar.
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };
const BATCH = 8;
/** Berhenti mengklaim sebelum batas fungsi; sisanya diambil pemanggilan berikutnya. */
const BUDGET_MS = 40_000;

/**
 * Pengerja impor media antrean moderasi (ADR-095).
 *
 *   POST /api/cron/import-event-media
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Mengunduh gambar resmi & menggambar poster/slide untuk kegiatan yang
 * menunggu, lalu menyimpannya ke galeri kegiatan itu. `remaining: true` =
 * batch terakhir penuh, panggil lagi.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isAuthorizedCronRequest(request.headers.get('authorization'), env.CRON_SECRET)) {
      throw unauthorized('Token tidak valid.');
    }
    const started = Date.now();
    const total = { done: 0, failed: 0, retrying: 0 };
    let remaining = false;
    while (Date.now() - started < BUDGET_MS) {
      const run = await runMediaImports(BATCH);
      total.done += run.done;
      total.failed += run.failed;
      total.retrying += run.retrying;
      remaining = run.claimed >= BATCH;
      if (!remaining) break;
    }
    return NextResponse.json({ ...total, remaining }, { headers: NO_STORE });
  } catch (error) {
    const { body, status } = toApiError(error);
    return NextResponse.json(body, { status, headers: NO_STORE });
  }
}

export function GET(): NextResponse {
  return NextResponse.json(
    { error: 'Gunakan POST — pemrosesan mengklaim antrean.', code: 'VALIDATION_FAILED' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
