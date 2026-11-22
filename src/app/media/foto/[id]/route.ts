import { getSessionUser } from '@/lib/auth';
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
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let file;
  let staffFile;
  try {
    const repository = await getEventRepository();
    file = await repository.getEventPhotoFile(id);
    // Belum tayang: hanya admin & pengelola kegiatannya (pratinjau antrean moderasi, ADR-095).
    if (!file) {
      const user = await getSessionUser();
      staffFile = user ? await repository.getStaffEventPhotoFile({ id: user.id, isAdmin: user.role === 'ADMIN' }, id) : null;
    }
  } catch (error) {
    console.error('[media] foto gagal dimuat:', error);
    return new Response(null, { status: 503, headers: { ...UNCACHED, 'Retry-After': '30' } });
  }
  if (staffFile) {
    return new Response(Buffer.from(staffFile.bytes), {
      headers: {
        'Content-Type': IMAGE_TYPES.has(staffFile.contentType) ? staffFile.contentType : 'application/octet-stream',
        'Content-Length': String(staffFile.bytes.byteLength),
        // Alamat sama dengan versi publik nanti: salinan staf tidak boleh tersimpan di cache bersama.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
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
