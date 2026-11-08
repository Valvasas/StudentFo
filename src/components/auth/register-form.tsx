import Link from 'next/link';
import type { ReactNode } from 'react';
import { signUpAction } from '@/app/auth/actions';
import { AuthCaptcha } from '@/components/auth/auth-captcha';
import { AuthDivider, AuthField, AuthInput } from '@/components/auth/auth-field';
import { ConfirmPasswordInput } from '@/components/auth/confirm-password-input';
import { FieldMemory } from '@/components/auth/field-memory';
import { GoogleButton } from '@/components/auth/google-button';
import { IntentSubmitButton } from '@/components/auth/intent-submit';
import { NewPasswordInput } from '@/components/auth/new-password-input';
import { buttonVariants } from '@/components/ui/button';
import { AGE_CONFIRM_VALUE, PRIVACY_CONSENT_VALUE } from '@/lib/auth-schema';

const REMEMBERED_FIELDS = ['fullName'] as const;

/**
 * Form daftar PESERTA (mode Supabase). Satu form untuk dua jalur: tombol
 * Google memakai `formAction`, jadi persetujuan ikut terkirim tanpa
 * JavaScript dan divalidasi ulang di server untuk keduanya. Penyelenggara
 * punya form sendiri dengan data lembaga (`OrganizerRegisterForm`, ADR-069).
 */
export function RegisterForm({ next, email, restore }: { next: string; email: string; restore: boolean }) {
  return (
    <form action={signUpAction} className="flex flex-col gap-4">
      <FieldMemory storageKey="daftar-peserta" fields={REMEMBERED_FIELDS} restore={restore} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="accountType" value="participant" />
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
      <AuthField id="confirmPassword" label="Ulangi kata sandi">
        <ConfirmPasswordInput id="confirmPassword" name="confirmPassword" matchId="password" autoComplete="new-password" required />
      </AuthField>

      <ConsentChecks />

      <AuthCaptcha />

      <IntentSubmitButton intent="email" pendingLabel="Membuat akun…" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
        Buat akun
      </IntentSubmitButton>
      <AuthDivider label="atau" />
      <GoogleButton next={next} label="Daftar dengan Google" withinForm />
    </form>
  );
}

/**
 * Pernyataan usia & persetujuan — terpisah satu sama lain (UU PDP Pasal 22),
 * sama untuk kedua pintu daftar. `before` = pernyataan tambahan di atasnya
 * (wewenang mewakili lembaga di form penyelenggara).
 */
export function ConsentChecks({ before }: { before?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {before}
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
