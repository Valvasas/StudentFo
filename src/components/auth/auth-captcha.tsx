import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { Turnstile } from '@/components/ui/turnstile';
import { env } from '@/lib/env';
import { NONCE_HEADER } from '@/lib/security-headers';

/**
 * Cloudflare Turnstile untuk form akun tamu (daftar, lupa sandi, kirim ulang
 * konfirmasi) — hanya bila `TURNSTILE_SITE_KEY` diisi; tokennya diverifikasi
 * `passesCaptcha()` di Server Action sebelum Supabase dipanggil. Pola sama
 * dengan widget `/submit` (`key` baru per render — lihat `Turnstile`), beda
 * teks <noscript>.
 */
export async function AuthCaptcha() {
  const siteKey = env.TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    <Turnstile
      key={randomUUID()}
      siteKey={siteKey}
      nonce={nonce}
      noscript="Verifikasi anti-bot butuh JavaScript. Aktifkan JavaScript lalu muat ulang halaman ini."
    />
  );
}
