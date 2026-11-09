import { NextResponse, type NextRequest } from 'next/server';
import { parseInstitutionScope, searchInstitutions } from '@/lib/institutions';

/**
 * Cari tempat studi (ADR-076) untuk pemilih di profil & pendataan. Data
 * publik yang sama untuk semua orang (Data Referensi Kemendikdasmen), tanpa
 * sesi — boleh di-cache CDN per kombinasi kueri. Maks. 12 hasil: cukup untuk
 * memilih, terlalu sedikit untuk dipakai menyedot seluruh daftar.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const results = searchInstitutions(params.get('q') ?? '', parseInstitutionScope(params.get('jenis')));
  return NextResponse.json(
    { results },
    { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400', 'X-Robots-Tag': 'noindex' } },
  );
}
