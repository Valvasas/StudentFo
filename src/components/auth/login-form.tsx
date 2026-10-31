import Link from 'next/link';
import { signInAction } from '@/app/auth/actions';
import { AuthDivider, AuthField, AuthInput } from '@/components/auth/auth-field';
import { GoogleButton } from '@/components/auth/google-button';
import { PasswordInput } from '@/components/auth/password-input';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import type { AuthAudience } from '@/lib/safe-redirect';

/**
 * Form masuk yang sama untuk pintu peserta (/login) dan penyelenggara
 * (/penyelenggara/masuk, ADR-063). Akunnya satu: yang berbeda hanya tujuan
 * bawaan dan ke mana galat dikembalikan (`audience`, isian tersembunyi).
 */
export function LoginForm({ next, email, isLive, audience }: { next: string; email: string; isLive: boolean; audience: AuthAudience }) {
  const resendHref = `/verify-email${email ? `?email=${encodeURIComponent(email)}` : ''}`;

  return (
    <>
      {isLive && (
        <>
          <GoogleButton next={next} label="Masuk dengan Google" audience={audience} />
          {/* Google bisa sekaligus MEMBUAT akun dari sini (OAuth tidak membedakan
              masuk & daftar), dan jalur ini tidak melewati centang persetujuan
              di halaman daftar — jadi pemberitahuannya ditulis di tempat tombolnya. */}
          <p className="-mt-1 text-center text-[13px] leading-relaxed text-ink-muted">
            Belum punya akun? Masuk dengan Google sekaligus membuatnya. Dengan begitu kamu menyatakan berusia 13 tahun ke atas (di bawah 18
            dengan izin orang tua/wali) dan menyetujui{' '}
            <Link href="/terms" className="font-medium text-ink underline underline-offset-[3px]">
              Syarat &amp; Ketentuan
            </Link>{' '}
            serta{' '}
            <Link href="/privacy-policy" className="font-medium text-ink underline underline-offset-[3px]">
              Kebijakan privasi
            </Link>
            .
          </p>
          <AuthDivider />
        </>
      )}

      <form action={signInAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="audience" value={audience} />
        <AuthField id="email" label="Email">
          <AuthInput
            id="email"
            name="email"
            type="email"
            defaultValue={email}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            placeholder={audience === 'organizer' ? 'panitia@organisasi.or.id' : 'nama@kampus.ac.id'}
          />
        </AuthField>
        <AuthField
          id="password"
          label="Kata sandi"
          aside={
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 items-center text-[13px] font-medium text-ink-muted underline-offset-[3px] hover:text-ink hover:underline"
            >
              Lupa kata sandi?
            </Link>
          }
        >
          {/* autoComplete yang benar menentukan apakah pengelola kata sandi
              menawarkan isian yang tepat — pertahanan paling efektif
              terhadap pemakaian ulang sandi. */}
          <PasswordInput id="password" name="password" autoComplete="current-password" required maxLength={72} />
        </AuthField>
        <SubmitButton pendingLabel="Memeriksa…" className={buttonVariants({ size: 'lg', className: 'mt-1 w-full' })}>
          {audience === 'organizer' ? 'Masuk ke studio' : 'Masuk'}
        </SubmitButton>
      </form>

      {isLive && (
        <Link href={resendHref} className="-mt-2 inline-flex min-h-11 items-center justify-center text-[13px] text-ink-muted underline-offset-[3px] hover:text-ink hover:underline">
          Kirim ulang email konfirmasi
        </Link>
      )}
    </>
  );
}
