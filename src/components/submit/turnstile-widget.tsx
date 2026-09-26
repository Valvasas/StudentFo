import { TURNSTILE_ORIGIN } from '@/lib/security-headers';

/**
 * Widget Cloudflare Turnstile (mode "managed": kebanyakan pengunjung tidak
 * perlu mengklik apa pun). Widget menyisipkan input tersembunyi
 * `cf-turnstile-response` ke dalam <form> induknya; server memverifikasinya
 * di `passesCaptcha()`.
 *
 * Skrip membawa nonce CSP request ini — di bawah `strict-dynamic`, skrip
 * pihak ketiga tanpa nonce diblokir walau origin-nya diizinkan.
 */
export function TurnstileWidget({ siteKey, nonce }: { siteKey: string; nonce: string | undefined }) {
  return (
    <div className="flex flex-col gap-2">
      <script src={`${TURNSTILE_ORIGIN}/turnstile/v0/api.js`} async defer nonce={nonce} />
      <div className="cf-turnstile min-h-[65px]" data-sitekey={siteKey} data-language="id" data-theme="auto" />
      <noscript>
        <p className="text-sm text-caution">
          Verifikasi anti-bot butuh JavaScript. Aktifkan JavaScript di browser untuk mengirim kegiatan.
        </p>
      </noscript>
    </div>
  );
}
