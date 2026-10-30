import Link from 'next/link';
import type { ReactNode } from 'react';
import { signUpAction } from '@/app/auth/actions';
import { AccountTypeField } from '@/components/auth/account-type-field';
import { AuthCaptcha } from '@/components/auth/auth-captcha';
import { AuthDivider, AuthField, AuthInput } from '@/components/auth/auth-field';
import { GoogleButton } from '@/components/auth/google-button';
import { IntentSubmitButton } from '@/components/auth/intent-submit';
import { NewPasswordInput } from '@/components/auth/new-password-input';
import { buttonVariants } from '@/components/ui/button';
import { AGE_CONFIRM_VALUE, PRIVACY_CONSENT_VALUE, type AccountType } from '@/lib/auth-schema';

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

      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm leading-snug text-ink-soft">
          <input type="checkbox" name="ageConfirm" value={AGE_CONFIRM_VALUE} required className="check mt-px" />
          <span>Saya berusia 18 tahun ke atas, atau 13–17 tahun dan sudah mendapat izin orang tua atau wali.</span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm leading-snug text-ink-soft">
          <input type="checkbox" name="privacyConsent" value={PRIVACY_CONSENT_VALUE} required className="check mt-px" />
          <span>
            Saya menyetujui <LegalLink href="/terms">Syarat &amp; Ketentuan</LegalLink> dan{' '}
            <LegalLink href="/privacy-policy">Kebijakan privasi</LegalLink> StudentFo.
          </span>
        </label>
      </div>

      <AuthCaptcha />

      <IntentSubmitButton intent="email" pendingLabel="Membuat akun…" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
        Buat akun
      </IntentSubmitButton>
      <AuthDivider label="atau" />
      <GoogleButton next={next} label="Daftar dengan Google" withinForm />
    </form>
  );
}

/** Tab baru: isian form daftar tidak hilang saat membaca dokumennya. */
function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} target="_blank" className="font-medium text-ink underline underline-offset-[3px]">
      {children}
      <span className="sr-only"> (tab baru)</span>
    </Link>
  );
}
