import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signInAction } from '@/app/auth/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { GoogleButton } from '@/components/auth/google-button';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { getSessionUser } from '@/lib/auth';
import { safeNextPath } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Masuk',
  description: 'Masuk ke akun StudentFo untuk menyimpan peluang dan mengatur preferensi.',
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  // Sudah masuk tapi membuka /login (mis. tombol back setelah login) —
  // dilempar ke tujuan, bukan disuruh masuk dua kali.
  if (await getSessionUser()) redirect(next);

  const email = typeof params.email === 'string' ? params.email.slice(0, 254) : '';

  return (
    <>
      <header>
        <h1 className="text-3xl">Masuk</h1>
        <p className="mt-2 text-ink-soft">
          Simpan peluang yang kamu incar dan atur bidang minatmu supaya urutan kegiatan lebih
          relevan.
        </p>
      </header>

      <AuthFeedback params={params} />

      <GoogleButton next={next} label="Masuk dengan Google" />

      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-muted">atau pakai email</span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>

      <form action={signInAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

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

        <Field id="password" label="Kata sandi">
          <TextInput
            id="password"
            name="password"
            type="password"
            // autoComplete yang benar menentukan apakah pengelola kata sandi
            // menawarkan isian yang tepat — dan pengelola kata sandi adalah
            // pertahanan paling efektif terhadap pemakaian ulang sandi.
            autoComplete="current-password"
            required
            maxLength={72}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full">
          Masuk
        </Button>
      </form>

      <div className="flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className="text-brand-text hover:underline">
          Lupa kata sandi?
        </Link>
        <p className="text-ink-muted">
          Belum punya akun?{' '}
          <Link
            href={next === '/' ? '/register' : `/register?next=${encodeURIComponent(next)}`}
            className="font-medium text-brand-text hover:underline"
          >
            Daftar gratis
          </Link>
        </p>
      </div>
    </>
  );
}
