import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signInAction } from '@/app/auth/actions';
import { AuthDivider, AuthField, AuthHeading, AuthInput, AuthSwitch, withNext } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { DemoLogin } from '@/components/auth/demo-login';
import { GoogleButton } from '@/components/auth/google-button';
import { PasswordInput } from '@/components/auth/password-input';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
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

  const heading = <AuthHeading title="Masuk ke StudentFo" subtitle="Lanjutkan ke kegiatan dan pendaftaranmu." />;
  const toRegister = <AuthSwitch prompt="Belum punya akun?" href={withNext('/register', next)} label="Daftar" />;

  // Mode demo: form email/Google tidak punya backend dan pasti gagal.
  // Yang ditampilkan adalah jalur yang benar-benar berfungsi.
  if (dataMode === 'seed') {
    return (
      <>
        {heading}
        <AuthFeedback params={params} />
        <DemoLogin next={next} />
        {toRegister}
      </>
    );
  }

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';
  const resendHref = `/verify-email${email ? `?email=${encodeURIComponent(email)}` : ''}`;

  return (
    <>
      {heading}
      <AuthFeedback params={params} />
      <GoogleButton next={next} label="Masuk dengan Google" />
      {/* Google bisa sekaligus MEMBUAT akun dari sini (OAuth tidak membedakan
          masuk & daftar), dan jalur ini tidak melewati centang persetujuan
          di /register — jadi pemberitahuannya ditulis di tempat tombolnya. */}
      <p className="-mt-1 text-center text-[13px] text-ink-muted">
        Belum punya akun? Masuk dengan Google sekaligus membuatnya, dan berarti kamu menyetujui{' '}
        <Link href="/privacy-policy" className="font-medium text-ink underline underline-offset-[3px]">
          Kebijakan privasi
        </Link>
        .
      </p>
      <AuthDivider />

      <form action={signInAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
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
        <AuthField
          id="password"
          label="Kata sandi"
          aside={
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 items-center text-[13px] font-medium text-ink-muted underline-offset-[3px] hover:text-ink hover:underline"
            >
              Lupa kata sandi?
            </Link>
          }
        >
          {/* autoComplete yang benar menentukan apakah pengelola kata sandi
              menawarkan isian yang tepat — pertahanan paling efektif
              terhadap pemakaian ulang sandi. */}
          <PasswordInput id="password" name="password" autoComplete="current-password" required maxLength={72} />
        </AuthField>
        <SubmitButton pendingLabel="Memeriksa…" className={buttonVariants({ size: 'lg', className: 'mt-1 w-full' })}>
          Masuk
        </SubmitButton>
      </form>

      <div className="flex flex-col items-center">
        {toRegister}
        <Link href={resendHref} className="inline-flex min-h-11 items-center text-[13px] text-ink-muted underline-offset-[3px] hover:text-ink hover:underline">
          Kirim ulang email konfirmasi
        </Link>
      </div>
    </>
  );
}
