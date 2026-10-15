import type { Metadata } from 'next';
import Link from 'next/link';
import { updatePasswordAction } from '@/app/auth/actions';
import { AuthField, AuthHeading } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { NewPasswordInput } from '@/components/auth/new-password-input';
import { PasswordInput } from '@/components/auth/password-input';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { getSessionUser } from '@/lib/auth';
import { dataMode } from '@/lib/env';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Setel kata sandi baru',
  robots: { index: false, follow: false },
};

/**
 * Halaman ini hanya bisa dipakai kalau tautan pemulihan sudah ditukar
 * menjadi sesi di /auth/callback. Tanpa sesi, form-nya tidak ditampilkan
 * sama sekali — bukan ditampilkan lalu gagal saat dikirim.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const user = dataMode === 'seed' ? null : await getSessionUser();

  if (!user) {
    return (
      <>
        <AuthHeading title="Tautan tidak berlaku" subtitle="Tautan penyetelan ulang hanya berlaku sekali dan punya masa berlaku." />
        <AuthFeedback params={params} />
        <Link href="/forgot-password" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
          Minta tautan baru
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        title="Setel kata sandi baru"
        subtitle={
          <>
            Untuk <strong className="break-all font-semibold text-ink">{user.email}</strong>. Perangkat lain akan dikeluarkan.
          </>
        }
      />
      <AuthFeedback params={params} />

      <form action={updatePasswordAction} className="flex flex-col gap-4">
        {/* Isian nama pengguna tersembunyi: pengelola kata sandi butuh ini
            untuk tahu akun mana yang sandinya diperbarui. */}
        <input type="email" name="username" autoComplete="username" defaultValue={user.email} hidden readOnly />
        <AuthField id="password" label="Kata sandi baru">
          <NewPasswordInput id="password" name="password" autoComplete="new-password" required />
        </AuthField>
        <AuthField id="confirmPassword" label="Ulangi kata sandi baru">
          <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required minLength={8} maxLength={72} />
        </AuthField>
        <SubmitButton pendingLabel="Menyimpan…" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
          Simpan kata sandi baru
        </SubmitButton>
      </form>
    </>
  );
}
