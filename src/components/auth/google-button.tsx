import { headers } from 'next/headers';
import { ExternalLink } from 'lucide-react';
import { signInWithGoogleAction } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';
import { detectInAppBrowser } from '@/lib/in-app-browser';

/**
 * Lambang Google digambar inline, bukan diambil dari lucide-react.
 * Alasannya bukan performa: pedoman merek Google mewajibkan logo "G" resmi
 * dengan empat warnanya, dan ikon generik bukan pengganti yang sah.
 */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-4">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * Di browser dalam aplikasi (Instagram, TikTok, …) Google menolak OAuth
 * dengan halaman error 403. Tombol yang pasti gagal diganti petunjuk membuka
 * halaman di browser sungguhan; masuk dengan email & sandi tetap tersedia.
 */
export async function GoogleButton({ next, label }: { next: string; label: string }) {
  const inApp = detectInAppBrowser((await headers()).get('user-agent'));

  if (inApp) {
    return (
      <div role="note" className="flex items-start gap-2 rounded-card border border-line bg-panel-nested p-4 text-sm text-ink-soft">
        <ExternalLink aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        <p>
          <strong className="font-semibold text-ink">Masuk dengan Google tidak tersedia di dalam {inApp}.</strong>{' '}
          Google memblokir login dari browser bawaan aplikasi. Ketuk menu <span aria-hidden>⋯</span>
          <span className="sr-only">(titik tiga)</span> lalu pilih &quot;Buka di browser&quot;, atau masuk dengan
          email di bawah.
        </p>
      </div>
    );
  }

  return (
    <form action={signInWithGoogleAction}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="secondary" size="lg" className="w-full">
        <GoogleMark />
        {label}
      </Button>
    </form>
  );
}
