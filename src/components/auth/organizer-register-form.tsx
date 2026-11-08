import type { ReactNode } from 'react';
import { organizerSignUpAction } from '@/app/auth/actions';
import { AuthCaptcha } from '@/components/auth/auth-captcha';
import { AuthDivider, AuthField, AuthInput } from '@/components/auth/auth-field';
import { ConfirmPasswordInput } from '@/components/auth/confirm-password-input';
import { FieldMemory } from '@/components/auth/field-memory';
import { GoogleButton } from '@/components/auth/google-button';
import { IntentSubmitButton } from '@/components/auth/intent-submit';
import { NewPasswordInput } from '@/components/auth/new-password-input';
import { ConsentChecks } from '@/components/auth/register-form';
import { buttonVariants } from '@/components/ui/button';
import { SelectInput, TextArea } from '@/components/ui/field';
import { AUTHORITY_CONFIRM_VALUE } from '@/lib/auth-schema';
import { ORGANIZER_LIMITS } from '@/lib/organizer';
import { ORGANIZER_HOME_PATH } from '@/lib/safe-redirect';
import { ORGANIZER_TYPES, ORGANIZER_TYPE_LABEL } from '@/types/domain';

const REMEMBERED_FIELDS = ['orgName', 'orgType', 'website', 'evidence', 'fullName', 'contactRole'] as const;

function Section({ number, title, hint, children }: { number: number; title: string; hint: string; children: ReactNode }) {
  return (
    // Garis pemisah di pembungkus, bukan di <fieldset>: legend yang dirender
    // peramban duduk DI ATAS garis border fieldset-nya.
    <div className="border-t border-line pt-5 first-of-type:border-t-0 first-of-type:pt-0">
    <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
      <legend className="mb-4 p-0">
        <span className="flex items-start gap-3">
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-brand text-[13px] font-bold text-on-brand">
            {number}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[15.5px] font-bold tracking-[-0.01em]">{title}</span>
            <span className="text-[12.5px] font-normal leading-snug text-ink-muted">{hint}</span>
          </span>
        </span>
      </legend>
      {children}
    </fieldset>
    </div>
  );
}

/**
 * Form daftar PENYELENGGARA (`/penyelenggara/daftar`, ADR-069). Berbeda dari
 * form peserta karena yang mendaftar adalah LEMBAGA lewat penanggung
 * jawabnya: data lembaga di sini = pengajuan verifikasi di studio (skema
 * yang sama), dibawa sampai email dikonfirmasi lalu tinggal dikirim satu
 * klik. Tetap satu akun StudentFo (ADR-063) — hak penyelenggara hanya dari
 * verifikasi moderator, bukan dari form ini.
 */
export function OrganizerRegisterForm({ email, restore }: { email: string; restore: boolean }) {
  return (
    <form action={organizerSignUpAction} className="flex flex-col gap-5">
      <FieldMemory storageKey="daftar-penyelenggara" fields={REMEMBERED_FIELDS} restore={restore} />
      <input type="hidden" name="next" value={ORGANIZER_HOME_PATH} />
      <input type="hidden" name="accountType" value="organizer" />

      <Section number={1} title="Data lembaga" hint="Dicocokkan moderator dengan sumber resmi sebelum acaramu bisa dikelola.">
        <AuthField id="orgName" label="Nama lembaga / organisasi" hint="Sesuai nama resmi, mis. “BEM Fakultas Teknik Universitas X”.">
          <AuthInput
            id="orgName"
            name="orgName"
            required
            minLength={2}
            maxLength={ORGANIZER_LIMITS.orgNameMax}
            autoComplete="organization"
            aria-describedby="orgName-hint"
          />
        </AuthField>
        <AuthField id="orgType" label="Jenis lembaga">
          <SelectInput id="orgType" name="orgType" required defaultValue="">
            <option value="" disabled>
              Pilih jenis lembaga
            </option>
            {ORGANIZER_TYPES.map((type) => (
              <option key={type} value={type}>
                {ORGANIZER_TYPE_LABEL[type]}
              </option>
            ))}
          </SelectInput>
        </AuthField>
        <AuthField id="website" label="Situs atau akun resmi (opsional)" hint="Diawali https://, mis. situs kampus atau akun Instagram resmi.">
          <AuthInput
            id="website"
            name="website"
            type="url"
            inputMode="url"
            maxLength={500}
            pattern="https://\S+"
            title="Alamat lengkap yang diawali https://"
            placeholder="https://"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="website-hint"
          />
        </AuthField>
        <AuthField
          id="evidence"
          label="Bukti peranmu"
          hint={`Jabatanmu dan tautan yang membuktikannya (halaman pengurus, unggahan resmi yang menyebut namamu). ${ORGANIZER_LIMITS.evidenceMin}–${ORGANIZER_LIMITS.evidenceMax} karakter; hanya dibaca moderator.`}
        >
          <TextArea
            id="evidence"
            name="evidence"
            required
            minLength={ORGANIZER_LIMITS.evidenceMin}
            maxLength={ORGANIZER_LIMITS.evidenceMax}
            aria-describedby="evidence-hint"
          />
        </AuthField>
      </Section>

      <Section number={2} title="Penanggung jawab" hint="Orang yang masuk ke studio dan dihubungi moderator.">
        <AuthField id="fullName" label="Nama lengkap">
          <AuthInput id="fullName" name="fullName" type="text" autoComplete="name" required minLength={2} maxLength={120} />
        </AuthField>
        <AuthField id="contactRole" label="Jabatan di lembaga" hint="Mis. Ketua Panitia, Humas, Staf Kemahasiswaan.">
          <AuthInput
            id="contactRole"
            name="contactRole"
            required
            minLength={ORGANIZER_LIMITS.contactRoleMin}
            maxLength={ORGANIZER_LIMITS.contactRoleMax}
            autoComplete="organization-title"
            aria-describedby="contactRole-hint"
          />
        </AuthField>
        <AuthField id="email" label="Email kerja" hint="Email resmi lembaga (mis. @univ.ac.id) mempercepat verifikasi. Dipakai untuk masuk.">
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
            placeholder="panitia@organisasi.or.id"
            aria-describedby="email-hint"
          />
        </AuthField>
        <AuthField id="password" label="Kata sandi">
          <NewPasswordInput id="password" name="password" autoComplete="new-password" required />
        </AuthField>
        <AuthField id="confirmPassword" label="Ulangi kata sandi">
          <ConfirmPasswordInput id="confirmPassword" name="confirmPassword" matchId="password" autoComplete="new-password" required />
        </AuthField>
      </Section>

      <Section number={3} title="Pernyataan" hint="Data palsu = pengajuan ditolak dan akun bisa ditangguhkan.">
        <ConsentChecks
          before={
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm leading-snug text-ink-soft">
              <input type="checkbox" name="authority" value={AUTHORITY_CONFIRM_VALUE} required className="check mt-px" />
              <span>Saya berwenang mewakili lembaga ini, dan data yang saya isi benar.</span>
            </label>
          }
        />
      </Section>

      <AuthCaptcha />

      <IntentSubmitButton intent="email" pendingLabel="Mendaftarkan lembaga…" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
        Daftarkan lembaga
      </IntentSubmitButton>
      <AuthDivider label="atau" />
      <GoogleButton next={ORGANIZER_HOME_PATH} label="Daftar dengan Google" withinForm />
      <p className="-mt-2 text-center text-[12.5px] leading-snug text-ink-muted">
        Lewat Google, data lembaga di atas tetap wajib diisi dan ikut tersimpan.
      </p>
    </form>
  );
}
