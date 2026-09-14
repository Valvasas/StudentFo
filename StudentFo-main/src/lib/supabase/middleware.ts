import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';

/**
 * Penyegaran sesi.
 *
 * Kenapa ini harus ada di middleware dan tidak bisa ditaruh di halaman:
 * access token Supabase berumur pendek dan disegarkan dengan refresh token
 * yang BERPUTAR — sekali dipakai, token lama tidak berlaku lagi. Token baru
 * harus ditulis balik ke cookie browser. Server Component tidak boleh
 * menulis cookie (lihat try/catch di `supabase/server.ts`), jadi tanpa
 * middleware ini pengguna akan "keluar sendiri" begitu token pertamanya
 * kedaluwarsa, biasanya satu jam setelah masuk.
 *
 * Berkas ini sengaja TIDAK mengimpor `supabase/server.ts`: modul itu
 * ditandai `server-only`, sementara middleware berjalan di runtime terpisah
 * yang tidak memakai kondisi resolusi `react-server`.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // Response dibangun ULANG dari request yang cookie-nya sudah
          // diperbarui, supaya Server Component di request yang sama ikut
          // membaca token baru — bukan token lama yang sudah dicabut.
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Panggilan ini yang memicu penyegaran. Hasilnya sengaja tidak dipakai:
  // keputusan otorisasi diambil di halaman & Server Action lewat
  // `requireUser()`/`checkAdminAccess()`, bukan di sini. Middleware yang
  // merangkap penjaga akses membuat satu-satunya lapisan keamanan berada di
  // tempat yang paling gampang terlewat saat menambah rute baru.
  await supabase.auth.getUser();

  return response;
}
