import { NextResponse, type NextRequest } from 'next/server';
import { regencyName } from '@/lib/wilayah';
import { districtsOf } from '@/lib/wilayah-districts';

/**
 * Kecamatan satu kab/kota (ADR-074) untuk pemilih domisili. Data statis yang
 * dibekukan di repo — sama untuk semua orang, tanpa sesi — jadi boleh di-cache
 * lama oleh CDN; pembaruan datang lewat deploy, yang membuang cache-nya.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ regency: string }> }): Promise<NextResponse> {
  const { regency } = await params;
  if (!regencyName(regency)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(
    { regency, districts: districtsOf(regency) },
    { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800', 'X-Robots-Tag': 'noindex' } },
  );
}
