import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthAlternate, AuthHeading, AuthSwitch, withNext } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { LoginForm } from '@/components/auth/login-form';
import { buttonVariants } from '@/components/ui/button';
import { getSessionUser } from '@/lib/auth';
import { isDemoAvailable } from '@/lib/demo/gate';
import { dataMode } from '@/lib/env';
import { ORGANIZER_HOME_PATH, ORGANIZER_REGISTER_PATH, safeNextPath } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Masuk ke Studio Penyelenggara',
  description: 'Masuk untuk mengelola acara, formulir pendaftaran, dan pendaftar lembagamu di StudentFo.',
  robots: { index: false, follow: true },
};

/** Pintu masuk penyelenggara (ADR-063): akun yang sama, tujuan bawaan studio. */
export default async function OrganizerLoginPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next, ORGANIZER_HOME_PATH);

  if (await getSessionUser()) redirect(next);

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';
  const demoOffered = await isDemoAvailable();

  return (
    <>
      <AuthHeading title="Masuk ke Studio" subtitle="Kelola acara, formulir, dan pendaftar lembagamu." />
      <AuthFeedback params={params} />
      <LoginForm next={next} email={email} isLive={dataMode === 'supabase'} audience="organizer" />
      <AuthSwitch prompt="Belum punya akun penyelenggara?" href={ORGANIZER_REGISTER_PATH} label="Daftarkan lembagamu" />
      {demoOffered && (
        <Link href={withNext('/demo', next)} className={buttonVariants({ variant: 'secondary', size: 'lg', className: 'w-full' })}>
          Lihat pratinjau dengan akun demo
        </Link>
      )}
      <AuthAlternate prompt="Mau ikut lomba atau cari beasiswa?" href="/login" label="Masuk sebagai peserta" />
    </>
  );
}
