import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthAlternate, AuthHeading, AuthSwitch, withNext } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { LoginForm } from '@/components/auth/login-form';
import { buttonVariants } from '@/components/ui/button';
import { getSessionUser } from '@/lib/auth';
import { isDemoAvailable } from '@/lib/demo/gate';
import { destinationLabel } from '@/lib/destination-label';
import { dataMode } from '@/lib/env';
import { ORGANIZER_LOGIN_PATH, safeNextPath } from '@/lib/safe-redirect';
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

  const destination = destinationLabel(next);
  const heading = (
    <AuthHeading
      title="Masuk ke StudentFo"
      subtitle={destination ? `Masuk dulu untuk membuka ${destination}.` : 'Lanjutkan ke kegiatan dan pendaftaranmu.'}
    />
  );
  const toRegister = <AuthSwitch prompt="Belum punya akun?" href={withNext('/register', next)} label="Daftar" />;

  // Situs pratinjau memakai form yang SAMA dengan produksi supaya halaman ini
  // mewakili produk sebenarnya; akun demo ada di /demo, bukan di sini (ADR-057).
  // Google tidak ditawarkan karena tidak punya backend di mode ini.
  const isLive = dataMode === 'supabase';
  const demoOffered = await isDemoAvailable();

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';

  return (
    <>
      {heading}
      <AuthFeedback params={params} />
      <LoginForm next={next} email={email} isLive={isLive} audience="participant" />
      {toRegister}
      {demoOffered && (
        <Link href={withNext('/demo', next)} className={buttonVariants({ variant: 'secondary', size: 'lg', className: 'w-full' })}>
          Lihat pratinjau dengan akun demo
        </Link>
      )}
      <AuthAlternate prompt="Mengelola acara untuk lembaga?" href={ORGANIZER_LOGIN_PATH} label="Masuk ke Studio Penyelenggara" />
    </>
  );
}
