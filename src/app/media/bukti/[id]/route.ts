import { getSessionUser, toEventActor } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';

export const dynamic = 'force-dynamic';

const UNCACHED = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Bukti pembayaran (privat, ADR-056): hanya pemilik pendaftaran, pengelola
 * acaranya, atau admin — diputuskan repository. Selain itu 404, sama dengan
 * id yang tidak ada, supaya keberadaan pendaftaran tidak bocor.
 *
 * `private, no-store`: bukti memuat nama & nomor rekening; tidak boleh
 * tersimpan di cache bersama maupun cache peramban di perangkat pinjaman.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 404, headers: UNCACHED });

  let file;
  try {
    file = await (await getEventRepository()).getPaymentProof(toEventActor(user), id);
  } catch (error) {
    console.error('[media] bukti bayar gagal dimuat:', error);
    return new Response(null, { status: 503, headers: { ...UNCACHED, 'Retry-After': '30' } });
  }
  if (!file) return new Response(null, { status: 404, headers: UNCACHED });

  return new Response(Buffer.from(file.bytes), {
    headers: {
      // Jenis sudah diperiksa dari byte saat unggah; ini lapisan kedua bila isi penyimpanan pernah tercemar.
      'Content-Type': IMAGE_TYPES.has(file.contentType) ? file.contentType : 'application/octet-stream',
      'Content-Length': String(file.bytes.byteLength),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
