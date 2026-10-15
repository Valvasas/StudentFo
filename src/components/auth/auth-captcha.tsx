import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { NONCE_HEADER, TURNSTILE_ORIGIN } from '@/lib/security-headers';

/**
 * Cloudflare Turnstile untuk form akun tamu (daftar, lupa sandi, kirim ulang
 * konfirmasi) — hanya bila `TURNSTILE_SITE_KEY` diisi; tokennya diverifikasi
 * `passesCaptcha()` di Server Action sebelum Supabase dipanggil. Pola sama
 * dengan widget `/submit`, beda teks <noscript>.
 */
export async function AuthCaptcha() {
  const siteKey = env.TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    <div className="flex flex-col gap-2">
      <script src={`${TURNSTILE_ORIGIN}/turnstile/v0/api.js`} async defer nonce={nonce} />
      <div className="cf-turnstile min-h-[65px]" data-sitekey={siteKey} data-language="id" data-theme="auto" />
      <noscript>
        <p className="text-sm text-caution">Verifikasi anti-bot butuh JavaScript. Aktifkan JavaScript lalu muat ulang halaman ini.</p>
      </noscript>
    </div>
  );
}
