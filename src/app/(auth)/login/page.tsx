import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signInAction } from '@/app/auth/actions';
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
  title: 'Masuk',
  description: 'Masuk ke akun StudentFo untuk menyimpan peluang dan mengatur preferensi.',
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  // Sudah masuk tapi membuka /login (mis. tombol back setelah login) —
  // dilempar ke tujuan, bukan disuruh masuk dua kali.
  if (await getSessionUser()) redirect(next);

  const heading = (
    <AuthHeading
      title="Selamat datang kembali"
      subtitle="Masuk untuk melihat kegiatan tersimpan dan pengingat tenggatmu."
    />
  );

  // Mode demo: form email/Google tidak punya backend dan pasti gagal.
  // Yang ditampilkan adalah jalur yang benar-benar berfungsi.
  if (dataMode === 'seed') {
    return (
      <>
        {heading}
        <AuthModeSwitch mode="login" next={next} />
        <AuthFeedback params={params} />
        <DemoLogin next={next} />
      </>
    );
  }

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';

  return (
    <>
      {heading}
      <AuthModeSwitch mode="login" next={next} />
      <AuthFeedback params={params} />
      <GoogleButton next={next} label="Masuk dengan Google" />
      <AuthDivider />

      <form action={signInAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <AuthField id="email" label="Email">
          <AuthInput
            id="email"
            name="email"
            type="email"
            defaultValue={email}
            autoComplete="email"
            required
            maxLength={254}
            placeholder="nama@kampus.ac.id"
          />
        </AuthField>
        <AuthField
          id="password"
          label="Kata sandi"
          aside={
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 items-center text-[13.5px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink"
            >
              Lupa kata sandi?
            </Link>
          }
        >
          {/* autoComplete yang benar menentukan apakah pengelola kata sandi
              menawarkan isian yang tepat — pertahanan paling efektif
              terhadap pemakaian ulang sandi. */}
          <PasswordInput id="password" name="password" autoComplete="current-password" required maxLength={72} placeholder="Kata sandi kamu" />
        </AuthField>
        <button
          type="submit"
          className="mt-2 flex h-[46px] items-center justify-center rounded-sm bg-brand text-[15px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover"
        >
          Masuk
        </button>
      </form>
    </>
  );
}
