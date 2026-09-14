import { NextResponse, type NextRequest } from 'next/server';
import { dataMode } from '@/lib/env';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Mode data contoh tidak punya sesi untuk disegarkan. Keluar lebih awal
  // supaya `npm run dev` tanpa kredensial tetap nol-konfigurasi.
  if (dataMode === 'seed') return NextResponse.next();

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Semua rute KECUALI aset statis. Penyegaran token harus ikut di
     * navigasi halaman biasa; menjalankannya untuk setiap berkas gambar
     * hanya menambah latensi tanpa manfaat.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
