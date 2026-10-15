import Link from 'next/link';
import { signUpAction } from '@/app/auth/actions';
import { AccountTypeField } from '@/components/auth/account-type-field';
import { AuthCaptcha } from '@/components/auth/auth-captcha';
import { AuthDivider, AuthField, AuthInput } from '@/components/auth/auth-field';
import { GoogleButton } from '@/components/auth/google-button';
import { IntentSubmitButton } from '@/components/auth/intent-submit';
import { NewPasswordInput } from '@/components/auth/new-password-input';
import { buttonVariants } from '@/components/ui/button';
import { PRIVACY_CONSENT_VALUE, type AccountType } from '@/lib/auth-schema';

/**
 * Form daftar (mode Supabase). Satu form untuk dua jalur: tombol Google
 * memakai `formAction`, jadi jenis akun & persetujuan ikut terkirim tanpa
 * JavaScript dan divalidasi ulang di server untuk keduanya.
 */
export function RegisterForm({ next, email, accountType }: { next: string; email: string; accountType: AccountType }) {
  return (
    <form action={signUpAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <AccountTypeField name="accountType" selected={accountType} />
      <AuthField id="fullName" label="Nama lengkap">
        <AuthInput id="fullName" name="fullName" type="text" autoComplete="name" required minLength={2} maxLength={120} />
      </AuthField>
      <AuthField id="email" label="Email">
        <AuthInput
          id="email"
          name="email"
          type="email"
          defaultValue={email}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          placeholder="nama@kampus.ac.id"
        />
      </AuthField>
      <AuthField id="password" label="Kata sandi">
        <NewPasswordInput id="password" name="password" autoComplete="new-password" required />
      </AuthField>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm leading-snug text-ink-soft">
        <input type="checkbox" name="privacyConsent" value={PRIVACY_CONSENT_VALUE} required className="check mt-px" />
        <span>
          Saya menyetujui{' '}
          <Link href="/privacy-policy" target="_blank" className="font-medium text-ink underline underline-offset-[3px]">
            Kebijakan privasi<span className="sr-only"> (tab baru)</span>
          </Link>{' '}
          StudentFo.
        </span>
      </label>

      <AuthCaptcha />

      <IntentSubmitButton intent="email" pendingLabel="Membuat akun…" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
        Buat akun
      </IntentSubmitButton>
      <AuthDivider label="atau" />
      <GoogleButton next={next} label="Daftar dengan Google" withinForm />
    </form>
  );
}
