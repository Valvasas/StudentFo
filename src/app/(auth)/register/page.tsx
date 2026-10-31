import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { demoSignInAction } from '@/app/auth/actions';
import { AuthAlternate, AuthHeading, AuthSwitch, withNext } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { RegisterForm } from '@/components/auth/register-form';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { getSessionUser } from '@/lib/auth';
import { isDemoAvailable } from '@/lib/demo/gate';
import { dataMode } from '@/lib/env';
import { ORGANIZER_REGISTER_PATH, safeNextPath } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Daftar',
  description: 'Buat akun StudentFo gratis untuk menyimpan lomba, beasiswa, dan magang serta diingatkan sebelum tenggatnya.',
  robots: { index: false, follow: true },
};

/** Daftar peserta. Penyelenggara punya pintunya sendiri (ADR-063). */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  if (await getSessionUser()) redirect(next);

  // Tautan lama `/register?type=organizer` (email, bookmark) tetap sampai.
  if (params.type === 'organizer') {
    const query = new URLSearchParams();
    for (const key of ['error', 'email'] as const) {
      const value = params[key];
      if (typeof value === 'string') query.set(key, value);
    }
    redirect(query.size > 0 ? `${ORGANIZER_REGISTER_PATH}?${query}` : ORGANIZER_REGISTER_PATH);
  }

  const heading = <AuthHeading title="Buat akun StudentFo" subtitle="Gratis. Simpan kegiatan incaranmu dan dapatkan pengingat sebelum tenggatnya." />;
  const toLogin = <AuthSwitch prompt="Sudah punya akun?" href={withNext('/login', next)} label="Masuk" />;
  const toOrganizer = <AuthAlternate prompt="Mewakili lembaga, kampus, atau komunitas?" href={ORGANIZER_REGISTER_PATH} label="Daftar sebagai penyelenggara" />;

  // Mode demo tidak bisa membuat akun sungguhan: dipetakan ke persona demo
  // yang setara, tanpa form palsu.
  if (dataMode === 'seed' && (await isDemoAvailable())) {
    return (
      <>
        {heading}
        <AuthFeedback params={params} />
        <form action={demoSignInAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="persona" value="mahasiswa" />
          <SubmitButton pendingLabel="Menyiapkan…" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
            Coba dengan akun demo
          </SubmitButton>
        </form>
        {toLogin}
        {toOrganizer}
      </>
    );
  }

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';

  return (
    <>
      {heading}
      <AuthFeedback params={params} />
      <RegisterForm next={next} email={email} accountType="participant" />
      {toLogin}
      {toOrganizer}
    </>
  );
}
