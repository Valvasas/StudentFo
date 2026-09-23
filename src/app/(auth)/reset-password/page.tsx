import type { Metadata } from 'next';
import Link from 'next/link';
import { KeyRound, LinkIcon } from 'lucide-react';
import { updatePasswordAction } from '@/app/auth/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
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
        <header>
          <h1 className="text-3xl">Tautan tidak berlaku</h1>
          <p className="mt-2 text-ink-soft">
            Tautan penyetelan ulang hanya berlaku sekali dan punya masa berlaku. Minta yang baru,
            lalu buka tautannya lewat perangkat dan peramban yang sama.
          </p>
        </header>

        <AuthFeedback params={params} />

        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">
            <LinkIcon aria-hidden />
            Minta tautan baru
          </Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <header>
        <h1 className="text-3xl">Setel kata sandi baru</h1>
        <p className="mt-2 text-ink-soft">
          Kamu sedang menyetel ulang kata sandi untuk{' '}
          <strong className="font-medium text-ink">{user.email}</strong>.
        </p>
      </header>

      <AuthFeedback params={params} />

      <form action={updatePasswordAction} className="flex flex-col gap-4">
        <Field
          id="password"
          label="Kata sandi baru"
          hint="Minimal 8 karakter, memuat huruf dan angka."
        >
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            aria-describedby="password-hint"
          />
        </Field>

        <Field id="confirmPassword" label="Ulangi kata sandi baru">
          <TextInput
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full">
          <KeyRound aria-hidden />
          Simpan kata sandi baru
        </Button>
      </form>

      <p className="text-sm text-ink-muted">
        Setelah disimpan, sesi di perangkat lain otomatis dikeluarkan.
      </p>
    </>
  );
}
