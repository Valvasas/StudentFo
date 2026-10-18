import { randomUUID } from 'node:crypto';
import { Turnstile } from '@/components/ui/turnstile';

/**
 * Turnstile di /submit. Widget menyisipkan input tersembunyi
 * `cf-turnstile-response` ke dalam <form> induknya; server memverifikasinya
 * di `passesCaptcha()`. `key` baru per render server — lihat `Turnstile`.
 */
export function TurnstileWidget({ siteKey, nonce }: { siteKey: string; nonce: string | undefined }) {
  return (
    <Turnstile
      key={randomUUID()}
      siteKey={siteKey}
      nonce={nonce}
      noscript="Verifikasi anti-bot butuh JavaScript. Aktifkan JavaScript di browser untuk mengirim kegiatan."
    />
  );
}
