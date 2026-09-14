import type { Metadata } from 'next';
import { KeyRound, LogOut, ShieldCheck, UserCog } from 'lucide-react';
import { changePasswordAction, signOutAction } from '@/app/auth/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, SelectInput, TextInput } from '@/components/ui/field';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import type { RawSearchParams } from '@/lib/search-params';
import { EDUCATION_LEVELS, EDUCATION_LEVEL_LABEL } from '@/types/domain';
import { updateProfileAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Akun saya',
  robots: { index: false, follow: false },
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-panel p-6 shadow-card">
      <h2 className="text-xl">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const user = await requireUser('/profile');
  const repository = await getEventRepository();
  const categories = await repository.listCategories();

  // Akun yang dibuat lewat Google tidak punya kata sandi untuk diganti.
  // Menampilkan formnya hanya akan berujung "kata sandi saat ini salah".
  const hasPassword = user.providers.includes('email');

  return (
    <div className="container-page flex max-w-3xl flex-col gap-6 py-8">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl">Akun saya</h1>
          {user.role === 'ADMIN' && (
            <Badge variant="brand">
              <ShieldCheck aria-hidden className="size-3.5" />
              Admin
            </Badge>
          )}
        </div>
        <p className="mt-2 text-ink-soft">
          Masuk sebagai <strong className="font-medium text-ink">{user.email}</strong>
          {user.providers.length > 0 && (
            <> · lewat {user.providers.includes('google') ? 'Google' : 'email'}</>
          )}
        </p>
      </header>

      <AuthFeedback params={params} />

      <Section
        title="Profil & minat"
        description="Jenjang dan bidang minat dipakai untuk menyusun urutan kegiatan yang ditampilkan untukmu."
      >
        <form action={updateProfileAction} className="flex flex-col gap-5">
          <Field id="fullName" label="Nama lengkap">
            <TextInput
              id="fullName"
              name="fullName"
              type="text"
              defaultValue={user.fullName}
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="educationLevel" label="Jenjang pendidikan">
              <SelectInput
                id="educationLevel"
                name="educationLevel"
                defaultValue={user.educationLevel ?? ''}
              >
                <option value="">Belum diisi</option>
                {EDUCATION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {EDUCATION_LEVEL_LABEL[level]}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field id="major" label="Jurusan" hint="Opsional.">
              <TextInput
                id="major"
                name="major"
                type="text"
                defaultValue={user.major ?? ''}
                maxLength={100}
                placeholder="Teknik Informatika"
                aria-describedby="major-hint"
              />
            </Field>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-ink-soft">Bidang yang kamu minati</legend>
            <p className="mt-1 text-xs text-ink-muted">Pilih maksimal 12 bidang.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((category) => (
                <label
                  key={category.slug}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border border-line bg-panel px-3 text-sm text-ink-soft transition-colors duration-150 ease-snap hover:border-line-strong hover:text-ink has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand-text"
                >
                  <input
                    type="checkbox"
                    name="interests"
                    value={category.slug}
                    defaultChecked={user.interests.includes(category.slug)}
                    className="size-4 accent-brand"
                  />
                  {category.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <Button type="submit" size="lg">
              <UserCog aria-hidden />
              Simpan profil
            </Button>
          </div>
        </form>
      </Section>

      <Section
        title="Keamanan"
        description={
          hasPassword
            ? 'Mengganti kata sandi otomatis mengeluarkan sesi di perangkat lain.'
            : undefined
        }
      >
        {hasPassword ? (
          <form action={changePasswordAction} className="flex flex-col gap-5">
            <Field id="currentPassword" label="Kata sandi saat ini">
              <TextInput
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={72}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="password"
                label="Kata sandi baru"
                hint="Minimal 8 karakter, huruf dan angka."
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
            </div>

            <div>
              <Button type="submit" variant="secondary" size="lg">
                <KeyRound aria-hidden />
                Ganti kata sandi
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-ink-soft">
            Akunmu masuk lewat Google, jadi tidak ada kata sandi StudentFo yang perlu dijaga.
            Keamanan akun mengikuti pengaturan akun Google-mu — termasuk verifikasi dua langkah.
          </p>
        )}
      </Section>

      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="lg">
          <LogOut aria-hidden />
          Keluar dari akun ini
        </Button>
      </form>
    </div>
  );
}
