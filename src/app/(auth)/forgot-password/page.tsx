import type { Metadata } from 'next';
import { requestPasswordResetAction } from '@/app/auth/actions';
import { AuthCaptcha } from '@/components/auth/auth-captcha';
import { AuthField, AuthHeading, AuthInput, AuthSwitch } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { dataMode } from '@/lib/env';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Lupa kata sandi',
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';
  const toLogin = <AuthSwitch prompt="Ingat kata sandimu?" href="/login" label="Masuk" />;

  return (
    <>
      <AuthHeading title="Lupa kata sandi" subtitle="Kami kirim tautan untuk menyetel kata sandi baru." />
      <AuthFeedback params={params} />

      {dataMode === 'seed' ? (
        <p className="rounded-card border border-line bg-panel-nested px-3.5 py-3 text-center text-sm text-ink-soft">
          Mode demo — akun contoh tidak memakai kata sandi.
        </p>
      ) : (
        <form action={requestPasswordResetAction} className="flex flex-col gap-4">
          <AuthField id="email" label="Email">
            <AuthInput
              id="email"
              name="email"
              type="email"
              defaultValue={email}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              placeholder="nama@kampus.ac.id"
            />
          </AuthField>
          <AuthCaptcha />
          <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
            Kirim tautan
          </SubmitButton>
          <p className="text-center text-[12.5px] text-ink-muted">Akun Google tidak perlu kata sandi — pakai “Masuk dengan Google”.</p>
        </form>
      )}

      {toLogin}
    </>
  );
}
