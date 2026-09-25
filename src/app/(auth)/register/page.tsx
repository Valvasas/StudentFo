import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signUpAction } from '@/app/auth/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { DemoLogin } from '@/components/auth/demo-login';
import { GoogleButton } from '@/components/auth/google-button';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { getSessionUser } from '@/lib/auth';
import { dataMode } from '@/lib/env';
import { safeNextPath } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Daftar',
  description: 'Buat akun StudentFo gratis untuk menyimpan peluang dan mengatur bidang minat.',
  robots: { index: false, follow: true },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  if (await getSessionUser()) redirect(next);

  // Mode demo: form email/Google tidak punya backend dan pasti gagal.
  // Yang ditampilkan adalah jalur yang benar-benar berfungsi.
  if (dataMode === 'seed') {
    return (
      <>
        <header>
          <h1 className="text-3xl">Daftar</h1>
        </header>
        <AuthFeedback params={params} />
        <DemoLogin next={next} />
      </>
    );
  }

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';

  return (
    <>
      <header>
        <h1 className="text-3xl">Buat akun</h1>
        <p className="mt-2 text-ink-soft">
          Gratis, dan cukup satu menit. Akun dipakai untuk menyimpan peluang dan menyesuaikan
          urutan kegiatan dengan jenjang serta bidang minatmu.
        </p>
      </header>

      <AuthFeedback params={params} />

      <GoogleButton next={next} label="Daftar dengan Google" />

      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-muted">atau pakai email</span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>

      <form action={signUpAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

        <Field id="fullName" label="Nama lengkap">
          <TextInput
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
            placeholder="Nama seperti di dokumen resmi"
          />
        </Field>

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

        <Field
          id="password"
          label="Kata sandi"
          hint="Minimal 8 karakter, memuat huruf dan angka. Maksimal 72 karakter."
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

        <Button type="submit" size="lg" className="w-full">
          Daftar
        </Button>
      </form>

      <p className="text-sm text-ink-muted">
        Sudah punya akun?{' '}
        <Link
          href={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-brand-text hover:underline"
        >
          Masuk
        </Link>
      </p>
    </>
  );
}
