import 'server-only';
import { headers } from 'next/headers';
import type { AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import type { RecommendationSignalInput } from '@/lib/data/repository';
import { clientIpFrom, RATE_LIMITS } from '@/lib/rate-limit';
import { isRateLimited } from '@/lib/rate-limit-server';
import { isLikelyHumanAgent } from '@/lib/signal-filter';

/**
 * Catat sinyal niat (ADR-032). TIDAK PERNAH melempar: kegagalan pencatatan
 * tidak boleh membatalkan simpan atau menahan pengguna di jalan menuju
 * tautan pendaftaran. Klik bot dan klik berlebih dari satu IP dibuang diam-diam.
 */
export async function recordSignal(
  kind: RecommendationSignalInput['kind'],
  eventId: string,
  user: AuthUser | null,
): Promise<void> {
  try {
    const requestHeaders = await headers();
    if (!isLikelyHumanAgent(requestHeaders.get('user-agent'))) return;
    if (await isRateLimited(clientIpFrom(requestHeaders), [[RATE_LIMITS.signalPerIp]])) return;

    const repository = await getEventRepository();
    await repository.recordRecommendationSignal({
      eventId,
      kind,
      userId: user?.id ?? null,
      interests: user?.interests ?? [],
      educationLevel: user?.educationLevel ?? null,
    });
  } catch (error) {
    console.error('[recommendation-signal] gagal dicatat:', error);
  }
}
