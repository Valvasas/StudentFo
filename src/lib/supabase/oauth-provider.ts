export type OAuthProvider = 'google';

export interface OAuthProviderCheckInput {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * Hanya `false` eksplisit yang berarti "mati". Bentuk balasan yang tak dikenali
 * dianggap hidup: pengecekan ini pelengkap, bukan gerbang keamanan, jadi
 * salah-baca tidak boleh mengunci pengguna dari tombol yang sebenarnya jalan.
 */
export function providerEnabledIn(settings: unknown, provider: OAuthProvider): boolean {
  if (typeof settings !== 'object' || settings === null) return true;
  const external = (settings as { external?: unknown }).external;
  if (typeof external !== 'object' || external === null) return true;
  return (external as Record<string, unknown>)[provider] !== false;
}

/**
 * `signInWithOAuth` di Server Action hanya MERAKIT URL consent tanpa panggilan
 * jaringan (ADR-010), jadi provider yang belum diaktifkan di dashboard tidak
 * pernah menghasilkan error di sisi kita — browser dilempar ke endpoint
 * `/authorize` Supabase dan mendarat di JSON galat mentah. Endpoint `/settings`
 * GoTrue publik (cukup anon key) dan memuat status tiap provider.
 *
 * Gagal terbuka: jaringan putus, timeout, atau balasan non-2xx → anggap hidup
 * dan biarkan alur normal berjalan.
 */
export async function isOAuthProviderEnabled(
  provider: OAuthProvider,
  { supabaseUrl, anonKey, fetchImpl = fetch, timeoutMs = 3000 }: OAuthProviderCheckInput,
): Promise<boolean> {
  try {
    const response = await fetchImpl(new URL('/auth/v1/settings', supabaseUrl), {
      headers: { apikey: anonKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return true;
    return providerEnabledIn(await response.json(), provider);
  } catch {
    return true;
  }
}
