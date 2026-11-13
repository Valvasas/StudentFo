import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { dataMode } from '@/lib/env';

export const dynamic = 'force-dynamic';

const UNCACHED = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Poster lampiran kiriman yang BELUM tayang (ADR-084): hanya moderator dan
 * pengirimnya sendiri. Tamu, orang lain, kiriman tanpa poster, dan id ngawur
 * sama-sama 404. Setelah disetujui berkas yang sama disajikan publik lewat
 * `/media/foto/[id]`; setelah ditolak berkasnya dihapus.
 *
 * Pembaca dikenali `submission_poster_file()` dari sesi di cookie (pola
 * `/media/profil`). `no-store`: alamatnya memakai id kiriman, dan isinya
 * harus hilang seketika begitu kiriman diputuskan.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let file;
  try {
    const user = dataMode === 'seed' ? await getSessionUser() : null;
    file = await (await getEventRepository()).getSubmissionPosterFile(user ? { id: user.id, isAdmin: user.role === 'ADMIN' } : null, id);
  } catch (error) {
    console.error('[media] poster kiriman gagal dimuat:', error);
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
      'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
