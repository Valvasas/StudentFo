import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { dataMode } from '@/lib/env';

export const dynamic = 'force-dynamic';

const UNCACHED = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Gambar pendukung kiriman yang BELUM tayang (ADR-094) — aturan sama persis
 * dengan poster kiriman (`../route.ts`): hanya moderator ber-MFA dan
 * pengirimnya; selain itu 404. `no-store` karena isinya harus hilang begitu
 * kiriman diputuskan.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; photo: string }> }): Promise<Response> {
  const { id, photo } = await params;
  let file;
  try {
    const user = dataMode === 'seed' ? await getSessionUser() : null;
    file = await (await getEventRepository()).getSubmissionPhotoFile(user ? { id: user.id, isAdmin: user.role === 'ADMIN' } : null, id, photo);
  } catch (error) {
    console.error('[media] gambar kiriman gagal dimuat:', error);
    return new Response(null, { status: 503, headers: { ...UNCACHED, 'Retry-After': '30' } });
  }
  if (!file) return new Response(null, { status: 404, headers: UNCACHED });

  return new Response(Buffer.from(file.bytes), {
    headers: {
      'Content-Type': IMAGE_TYPES.has(file.contentType) ? file.contentType : 'application/octet-stream',
      'Content-Length': String(file.bytes.byteLength),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
