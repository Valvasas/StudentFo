import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resendConfirmationAction } from '@/app/auth/actions';
import { AuthCaptcha } from '@/components/auth/auth-captcha';
import { AuthField, AuthHeading, AuthInput, AuthSwitch, withNext } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { getSessionUser } from '@/lib/auth';
import { emailSchema } from '@/lib/auth-schema';
import { dataMode } from '@/lib/env';
import { safeNextPath } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cek email kamu',
  robots: { index: false, follow: false },
};

/**
 * Layar "cek email" setelah daftar + kirim ulang email konfirmasi. Halaman
 * yang SAMA muncul untuk alamat yang ternyata sudah terdaftar (ADR-011), jadi
 * kalimat keduanya menunjuk jalan keluar untuk kasus itu tanpa mengonfirmasinya.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  if (await getSessionUser()) redirect(next);

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';
  // Hanya alamat berbentuk email yang dicetak sebagai kalimat: `?email=` bisa
  // diisi siapa saja, dan teks bebas di sini menjadi pesan karangan
  // ("Akun kamu ditangguhkan, hubungi wa.me/…") berlabel domain kita.
  const shownEmail = emailSchema.safeParse(email).data;
  const toLogin = <AuthSwitch prompt="Sudah mengonfirmasi?" href={withNext('/login', next)} label="Masuk" />;

  return (
    <>
      <AuthHeading
        title="Cek email kamu"
        subtitle={
          shownEmail ? (
            <>
              Tautan konfirmasi dikirim ke <strong className="break-all font-semibold text-ink">{shownEmail}</strong>. Sudah
              pernah daftar dengan email ini? Langsung masuk saja.
            </>
          ) : (
            'Buka tautan konfirmasi yang kami kirim untuk mengaktifkan akunmu.'
          )
        }
      />
      <AuthFeedback params={params} />

      {dataMode === 'seed' ? (
        <p className="rounded-card border border-line bg-panel-nested px-3.5 py-3 text-center text-sm text-ink-soft">
          Mode demo — tidak ada email yang dikirim.
        </p>
      ) : (
        <form action={resendConfirmationAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <AuthField id="email" label="Belum menerima email?">
            <AuthInput
              id="email"
              name="email"
              type="email"
              defaultValue={email}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              placeholder="nama@kampus.ac.id"
            />
          </AuthField>
          <AuthCaptcha />
          <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ variant: 'secondary', size: 'lg', className: 'w-full' })}>
            Kirim ulang email konfirmasi
          </SubmitButton>
          <p className="text-center text-[12.5px] text-ink-muted">Periksa juga folder spam atau promosi.</p>
        </form>
      )}

      {toLogin}
    </>
  );
}
