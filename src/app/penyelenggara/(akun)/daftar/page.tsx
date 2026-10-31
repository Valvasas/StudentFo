import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { demoSignInAction } from '@/app/auth/actions';
import { AuthAlternate, AuthHeading, AuthSwitch } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { RegisterForm } from '@/components/auth/register-form';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { getSessionUser } from '@/lib/auth';
import { isDemoAvailable } from '@/lib/demo/gate';
import { dataMode } from '@/lib/env';
import { ORGANIZER_HOME_PATH, ORGANIZER_LOGIN_PATH } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Daftar sebagai penyelenggara',
  description: 'Daftarkan lembaga, kampus, atau komunitasmu untuk memasang acara dan mengelola pendaftarnya di StudentFo.',
  robots: { index: false, follow: true },
};

/**
 * Pintu daftar penyelenggara (ADR-063). Setelah daftar selalu ke studio untuk
 * mengajukan verifikasi (`postSignUpPath`); `account_type` di metadata hanya
 * catatan, hak penyelenggara tetap dari profil VERIFIED.
 */
export default async function OrganizerRegisterPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;

  // Sudah punya akun peserta? Tidak perlu akun kedua — langsung ke studio.
  if (await getSessionUser()) redirect(ORGANIZER_HOME_PATH);

  const heading = <AuthHeading title="Daftarkan lembagamu" subtitle="Buat akun penanggung jawab, lalu ajukan verifikasi di studio." />;
  const toLogin = <AuthSwitch prompt="Sudah punya akun?" href={ORGANIZER_LOGIN_PATH} label="Masuk ke studio" />;
  const toParticipant = <AuthAlternate prompt="Mendaftar untuk ikut kegiatan?" href="/register" label="Daftar sebagai peserta" />;

  if (dataMode === 'seed' && (await isDemoAvailable())) {
    return (
      <>
        {heading}
        <AuthFeedback params={params} />
        <form action={demoSignInAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={ORGANIZER_HOME_PATH} />
          <input type="hidden" name="persona" value="penyelenggara" />
          <SubmitButton pendingLabel="Menyiapkan…" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
            Coba dengan akun demo penyelenggara
          </SubmitButton>
        </form>
        {toLogin}
        {toParticipant}
      </>
    );
  }

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';

  return (
    <>
      {heading}
      <AuthFeedback params={params} />
      <RegisterForm next={ORGANIZER_HOME_PATH} email={email} accountType="organizer" />
      {toLogin}
      {toParticipant}
    </>
  );
}
