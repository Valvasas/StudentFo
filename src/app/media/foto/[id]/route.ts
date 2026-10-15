import { getEventRepository } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * Berkas foto galeri acara (publik). Isi sebuah id tidak pernah berubah,
 * tapi cache tetap SEHARI, bukan setahun-immutable: foto paling sering
 * dihapus karena alasan privasi (wajah anak tanpa izin, data pribadi
 * terlihat) dan salinan di cache peramban/CDN/optimizer harus ikut mati
 * dalam hitungan jam, bukan bulan. 404 & kegagalan TIDAK di-cache: foto
 * acara yang belum tayang bisa jadi tersedia nanti dengan id yang sama.
 *
 * CSP `sandbox` + `nosniff`: kalaupun suatu saat byte non-gambar lolos ke
 * penyimpanan, membukanya langsung di tab tidak menjalankan apa pun di
 * origin kita.
 */
const UNCACHED = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let file;
  try {
    file = await (await getEventRepository()).getEventPhotoFile(id);
  } catch (error) {
    console.error('[media] foto gagal dimuat:', error);
    return new Response(null, { status: 503, headers: { ...UNCACHED, 'Retry-After': '30' } });
  }
  if (!file) return new Response(null, { status: 404, headers: UNCACHED });

  return new Response(Buffer.from(file.bytes), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.bytes.byteLength),
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
