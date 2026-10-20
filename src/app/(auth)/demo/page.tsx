import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AuthHeading, AuthSwitch, withNext } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { DemoLogin } from '@/components/auth/demo-login';
import { getSessionUser } from '@/lib/auth';
import { isDemoAdminPersonaAllowed, isDemoAvailable } from '@/lib/demo/gate';
import { safeNextPath } from '@/lib/safe-redirect';
import { firstParam, type RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Coba demo',
  robots: { index: false, follow: false },
};

/**
 * Pintu akun demo. Sengaja bukan bagian /login: situs yang sungguhan tidak
 * boleh menawarkan "masuk sebagai Admin" di halaman masuknya (ADR-057).
 * Di luar mode demo, atau di host yang tidak terdaftar, halaman ini 404 —
 * seolah tidak pernah ada.
 */
export default async function DemoPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  if (!(await isDemoAvailable())) notFound();

  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getSessionUser()) redirect(next);

  const presentedKey = firstParam(params.akses);
  const adminKey = isDemoAdminPersonaAllowed(presentedKey) ? (presentedKey ?? '') : undefined;

  return (
    <>
      <AuthHeading title="Coba StudentFo" subtitle="Pilih peran, langsung masuk. Tanpa email, tanpa kata sandi." />
      <AuthFeedback params={params} />
      <DemoLogin next={next} adminKey={adminKey} />
      <AuthSwitch prompt="Punya akun?" href={withNext('/login', next)} label="Masuk" />
    </>
  );
}
