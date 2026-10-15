import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { demoSignInAction } from '@/app/auth/actions';
import { AccountTypeField } from '@/components/auth/account-type-field';
import { AuthHeading, AuthSwitch, withNext } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { RegisterForm } from '@/components/auth/register-form';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { getSessionUser } from '@/lib/auth';
import { parseAccountType } from '@/lib/auth-schema';
import { dataMode } from '@/lib/env';
import { safeNextPath } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Daftar',
  description: 'Buat akun StudentFo gratis — sebagai peserta atau penyelenggara kegiatan.',
  robots: { index: false, follow: true },
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  if (await getSessionUser()) redirect(next);

  // `?type=organizer` bisa dipakai tautan "Jadi penyelenggara" dan dipakai
  // ulang saat form dikembalikan dengan error.
  const accountType = parseAccountType(params.type) ?? 'participant';
  const heading = <AuthHeading title="Buat akun StudentFo" subtitle="Gratis untuk peserta dan penyelenggara kegiatan." />;
  const toLogin = <AuthSwitch prompt="Sudah punya akun?" href={withNext('/login', next)} label="Masuk" />;

  // Mode demo tidak bisa membuat akun sungguhan: pilihan jenis akun
  // dipetakan ke persona demo yang setara, tanpa form palsu.
  if (dataMode === 'seed') {
    return (
      <>
        {heading}
        <AuthFeedback params={params} />
        <form action={demoSignInAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <AccountTypeField name="persona" selected={accountType} values={{ participant: 'mahasiswa', organizer: 'penyelenggara' }} />
          <SubmitButton pendingLabel="Menyiapkan…" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
            Coba dengan akun demo
          </SubmitButton>
          <p className="text-center text-[12.5px] text-ink-muted">Mode demo — akun contoh, datanya sementara.</p>
        </form>
        {toLogin}
      </>
    );
  }

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';

  return (
    <>
      {heading}
      <AuthFeedback params={params} />
      <RegisterForm next={next} email={email} accountType={accountType} />
      {toLogin}
    </>
  );
}
