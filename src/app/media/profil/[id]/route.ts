import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { dataMode } from '@/lib/env';

export const dynamic = 'force-dynamic';

const UNCACHED = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Foto profil & banner (ADR-083). Hanya untuk anggota yang MASUK dan boleh
 * melihat pemiliknya (aturan detail profil, ADR-077) — tamu, akun yang
 * diblokir, dan id yang tidak ada sama-sama 404. Admin boleh membuka berkas
 * siapa pun: foto yang dilaporkan harus bisa dilihat sebelum dicabut.
 *
 * Di produksi pembaca TIDAK dikenali lewat `getSessionUser()`: itu dua
 * panggilan ke server auth untuk setiap avatar di layar. RPC
 * `profile_media_file()` memutuskan dari token di cookie, yang diverifikasi
 * PostgREST sendiri. Mode seed tidak punya RLS, jadi pembacanya dikenali di sini.
 *
 * `private, max-age=86400`: id berkas berganti di setiap unggahan, jadi isi
 * sebuah alamat tidak pernah berubah — tetapi tetap SEHARI, bukan
 * selamanya: foto yang dicabut (laporan, blokir, hapus akun) harus ikut
 * hilang dari cache peramban dalam hitungan jam. `private` menjaganya tidak
 * tersimpan di cache bersama (CDN, proxy kampus).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let file;
  try {
    const user = dataMode === 'seed' ? await getSessionUser() : null;
    file = await (await getEventRepository()).getProfileMediaFile(user ? { id: user.id, isAdmin: user.role === 'ADMIN' } : null, id);
  } catch (error) {
    console.error('[media] gambar profil gagal dimuat:', error);
    return new Response(null, { status: 503, headers: { ...UNCACHED, 'Retry-After': '30' } });
  }
  if (!file) return new Response(null, { status: 404, headers: UNCACHED });

  return new Response(Buffer.from(file.bytes), {
    headers: {
      // Jenis sudah diperiksa dari byte saat unggah; ini lapisan kedua bila isi penyimpanan pernah tercemar.
      'Content-Type': IMAGE_TYPES.has(file.contentType) ? file.contentType : 'application/octet-stream',
      'Content-Length': String(file.bytes.byteLength),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
