/**
 * Verifikasi Cloudflare Turnstile di server.
 *
 * Token dari widget TIDAK boleh dipercaya begitu saja — hanya jawaban
 * `siteverify` yang membuktikan tantangannya benar-benar diselesaikan, dan
 * setiap token hanya sah sekali. Kegagalan jaringan ke Cloudflare
 * diperlakukan sebagai GAGAL (fail closed): form ini terbuka untuk tamu, dan
 * membiarkan kiriman lolos saat verifikasi tidak bisa dilakukan sama saja
 * dengan tidak punya CAPTCHA setiap kali Cloudflare lambat.
 */
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_RESPONSE_FIELD = 'cf-turnstile-response';
const TIMEOUT_MS = 5_000;

export interface TurnstileVerifyInput {
  readonly token: string;
  readonly secret: string;
  readonly remoteIp?: string | undefined;
  readonly fetchImpl?: typeof fetch;
}

export async function verifyTurnstile({
  token,
  secret,
  remoteIp,
  fetchImpl = fetch,
}: TurnstileVerifyInput): Promise<boolean> {
  // Batas panjang dari dokumentasi Cloudflare; token lebih panjang pasti palsu.
  if (!token || token.length > 2048) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);

  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}
