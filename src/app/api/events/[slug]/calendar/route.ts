import { NextResponse, type NextRequest } from 'next/server';
import { generateIcsContent, icsFilename } from '@/lib/calendar';
import { getEventRepository } from '@/lib/data';
import { notFound, toApiError } from '@/lib/errors';

/**
 * Berkas .ics semua tenggat sebuah kegiatan (Apple Calendar, Outlook,
 * Thunderbird). Data publik yang sama dengan halaman detail — tanpa sesi,
 * tanpa cookie — jadi aman di-cache sebentar oleh CDN.
 *
 * `Content-Disposition: attachment`: tanpa itu Safari iOS menampilkan isi
 * mentah alih-alih menawarkan "Tambahkan ke Kalender".
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await params;
    const event = await (await getEventRepository()).getEventBySlug(slug);
    if (!event) throw notFound('Kegiatan tidak ditemukan.');
    if (event.deadlines.length === 0) throw notFound('Jadwal kegiatan ini belum diumumkan.');

    return new NextResponse(generateIcsContent(event), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${icsFilename(event)}"`,
        // Jadwal bisa direvisi penyelenggara (ADR-042); 5 menit = TTL Data
        // Cache katalog, jadi berkas tidak lebih basi dari halamannya.
        'Cache-Control': 'public, max-age=300',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (error) {
    const { body, status } = toApiError(error);
    return NextResponse.json(body, { status });
  }
}
