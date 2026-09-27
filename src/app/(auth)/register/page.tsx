import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signUpAction } from '@/app/auth/actions';
import { AuthDivider, AuthField, AuthHeading, AuthInput } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { AuthModeSwitch } from '@/components/auth/auth-mode-switch';
import { DemoLogin } from '@/components/auth/demo-login';
import { GoogleButton } from '@/components/auth/google-button';
import { PasswordInput } from '@/components/auth/password-input';
import { getSessionUser } from '@/lib/auth';
import { dataMode } from '@/lib/env';
import { safeNextPath } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Daftar',
  description: 'Buat akun StudentFo gratis untuk menyimpan peluang dan mengatur bidang minat.',
  robots: { index: false, follow: true },
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  if (await getSessionUser()) redirect(next);

  const heading = <AuthHeading title="Buat akun StudentFo" subtitle="Gratis untuk pelajar. Butuh kurang dari satu menit." />;

  // Mode demo: form email/Google tidak punya backend dan pasti gagal.
  // Yang ditampilkan adalah jalur yang benar-benar berfungsi.
  if (dataMode === 'seed') {
    return (
      <>
        {heading}
        <AuthModeSwitch mode="register" next={next} />
        <AuthFeedback params={params} />
        <DemoLogin next={next} />
      </>
    );
  }

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';

  return (
    <>
      {heading}
      <AuthModeSwitch mode="register" next={next} />
      <AuthFeedback params={params} />
      <GoogleButton next={next} label="Daftar dengan Google" />
      <AuthDivider />

      <form action={signUpAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <AuthField id="fullName" label="Nama lengkap">
          <AuthInput id="fullName" name="fullName" type="text" autoComplete="name" required minLength={2} maxLength={120} placeholder="Nama seperti di dokumen resmi" />
        </AuthField>
        <AuthField id="email" label="Email">
          <AuthInput id="email" name="email" type="email" defaultValue={email} autoComplete="email" required maxLength={254} placeholder="nama@kampus.ac.id" />
        </AuthField>
        <AuthField id="password" label="Kata sandi" hint="Minimal 8 karakter, memuat huruf dan angka. Maksimal 72 karakter.">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            placeholder="Minimal 8 karakter"
            aria-describedby="password-hint"
          />
        </AuthField>
        <button
          type="submit"
          className="mt-2 flex h-[46px] items-center justify-center rounded-sm bg-brand text-[15px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover"
        >
          Buat akun
        </button>
        <p className="text-[12.5px] leading-normal text-ink-muted">
          Dengan mendaftar, kamu menyetujui{' '}
          <Link href="/privacy-policy" className="text-ink underline underline-offset-[3px]">
            Kebijakan privasi
          </Link>{' '}
          StudentFo.
        </p>
      </form>
    </>
  );
}
