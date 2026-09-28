import 'server-only';
import { getEventRepository } from '@/lib/data';
import { jakartaDateKey } from '@/lib/deadline';
import { eventVisitorHash, RATE_LIMITS } from '@/lib/rate-limit';
import { bucketSecret, isRateLimited, requestClientIp } from '@/lib/rate-limit-server';
import { isLikelyHumanAgent, isPrefetchRequest } from '@/lib/signal-filter';

/**
 * Catat satu kunjungan halaman acara untuk analitik penyelenggara (ADR-043).
 * Dipanggil lewat `after()` — tidak menunda halaman, dan TIDAK PERNAH
 * melempar. Header dibaca pemanggil SEBELUM `after()`: di Server Component,
 * API request tidak bisa dipakai di dalam callback-nya.
 */
export async function recordEventView(eventId: string, requestHeaders: Pick<Headers, 'get'>): Promise<void> {
  try {
    const userAgent = requestHeaders.get('user-agent');
    if (isPrefetchRequest(requestHeaders) || !isLikelyHumanAgent(userAgent)) return;
    const ip = requestClientIp(requestHeaders);
    // Tanpa IP, semua pengunjung melebur jadi satu "pengunjung unik".
    if (ip === 'unknown') return;
    if (await isRateLimited(ip, [[RATE_LIMITS.eventViewPerIp]])) return;

    const visitor = await eventVisitorHash(bucketSecret(), jakartaDateKey(new Date()), ip, userAgent ?? '');
    await (await getEventRepository()).recordEventView(eventId, visitor);
  } catch (error) {
    console.error('[event-view] gagal dicatat:', error);
  }
}
