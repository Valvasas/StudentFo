import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requestPasswordResetAction } from '@/app/auth/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Lupa kata sandi',
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';

  return (
    <>
      <header>
        <h1 className="text-3xl">Lupa kata sandi</h1>
        <p className="mt-2 text-ink-soft">
          Masukkan email yang kamu pakai saat mendaftar. Kami kirim tautan untuk menyetel kata
          sandi baru.
        </p>
      </header>

      <AuthFeedback params={params} />

      <form action={requestPasswordResetAction} className="flex flex-col gap-4">
        <Field id="email" label="Email">
          <TextInput
            id="email"
            name="email"
            type="email"
            defaultValue={email}
            autoComplete="email"
            required
            maxLength={254}
            placeholder="nama@kampus.ac.id"
          />
        </Field>

        <Button type="submit" size="lg" className="w-full">
          Kirim tautan penyetelan ulang
        </Button>
      </form>

      <p className="text-sm text-ink-muted">
        Masuk lewat Google dan tidak pernah membuat kata sandi? Kamu tidak perlu halaman ini —
        cukup pakai tombol <strong className="font-medium text-ink-soft">Masuk dengan Google</strong>.
      </p>

      <Link
        href="/login"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-brand-text hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Kembali ke halaman masuk
      </Link>
    </>
  );
}
