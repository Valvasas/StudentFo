import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ShieldCheck } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { TurnstileWidget } from '@/components/submit/turnstile-widget';
import { Button } from '@/components/ui/button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { jakartaDateKey } from '@/lib/deadline';
import { env } from '@/lib/env';
import type { RawSearchParams } from '@/lib/search-params';
import { NONCE_HEADER } from '@/lib/security-headers';
import { HONEYPOT_FIELD } from '@/lib/submission-schema';
import {
  EDUCATION_LEVEL_LABEL,
  EDUCATION_LEVELS,
  EVENT_TYPE_LABEL,
  EVENT_TYPES,
} from '@/types/domain';
import { submitEventAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kirim kegiatan',
  description:
    'Punya info lomba, beasiswa, magang, atau workshop? Kirim ke StudentFo — setiap kiriman diverifikasi manual sebelum tayang.',
};

/** Nama field skema → label yang dibaca manusia. Juga daftar putih untuk `?fields=`. */
const FIELD_LABEL: Record<string, string> = {
  submittedByEmail: 'Email kamu',
  title: 'Judul kegiatan',
  organizer: 'Penyelenggara',
  description: 'Deskripsi',
  eventType: 'Jenis kegiatan',
  registrationLink: 'Tautan pendaftaran',
  sourceUrl: 'Tautan sumber',
  educationLevels: 'Jenjang peserta',
  categorySlugs: 'Bidang',
  location: 'Lokasi',
  deadlineAt: 'Tenggat pendaftaran',
};

function invalidFieldLabels(raw: RawSearchParams['fields']): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? '')
    .split(',')
    .map((name) => FIELD_LABEL[name])
    .filter((label): label is string => Boolean(label));
}

export default async function SubmitPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, user, repository, requestHeaders] = await Promise.all([
    searchParams,
    getSessionUser(),
    getEventRepository(),
    headers(),
  ]);
  const nonce = requestHeaders.get(NONCE_HEADER) ?? undefined;
  const turnstileSiteKey = env.TURNSTILE_SITE_KEY;
  const categories = await repository.listCategories();
  const invalidFields = invalidFieldLabels(params.fields);
  const today = jakartaDateKey(new Date());

  return (
    <div className="container-page max-w-3xl py-10">
      <header>
        <h1 className="text-3xl">Kirim kegiatan</h1>
        <p className="mt-3 text-ink-soft">
          Tahu lomba, beasiswa, magang, atau workshop yang belum ada di StudentFo? Kirim di sini.
          Penyelenggara juga boleh mendaftarkan acaranya sendiri.
        </p>
        <p className="mt-3 flex items-start gap-2 rounded-card border border-line bg-panel p-4 text-sm text-ink-soft">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
          Setiap kiriman dicek manual ke sumber aslinya sebelum tayang. Email kamu hanya dipakai untuk
          menghubungi kalau ada yang perlu dikonfirmasi — tidak ditampilkan ke publik.
        </p>
      </header>

      <ActionFeedback params={params} className="mt-6" />
      {invalidFields.length > 0 && (
        <p className="mt-2 text-sm text-danger">Periksa kolom: {invalidFields.join(', ')}.</p>
      )}

      <form action={submitEventAction} className="mt-8 flex flex-col gap-5">
        {/* Honeypot — tersembunyi dari manusia dan pembaca layar, lihat submission-schema.ts. */}
        <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
          <label htmlFor={HONEYPOT_FIELD}>Jangan diisi</label>
          <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <Field id="title" label="Judul kegiatan" hint="Tulis persis seperti di pengumuman resmi. 6–255 karakter.">
          <TextInput id="title" name="title" required minLength={6} maxLength={255} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="organizer" label="Penyelenggara">
            <TextInput id="organizer" name="organizer" required minLength={2} maxLength={255} />
          </Field>
          <Field id="eventType" label="Jenis kegiatan">
            <SelectInput id="eventType" name="eventType" required defaultValue="">
              <option value="" disabled>
                Pilih jenis
              </option>
              {EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {EVENT_TYPE_LABEL[type]}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        <Field
          id="registrationLink"
          label="Tautan pendaftaran"
          hint="Alamat lengkap, diawali https://. Tautan ini yang dibuka peserta saat menekan “Daftar”."
        >
          <TextInput id="registrationLink" name="registrationLink" type="url" required maxLength={2000} placeholder="https://" />
        </Field>

        <Field
          id="sourceUrl"
          label="Tautan sumber pengumuman (opsional)"
          hint="Poster, unggahan media sosial, atau halaman resmi. Mempercepat verifikasi."
        >
          <TextInput id="sourceUrl" name="sourceUrl" type="url" maxLength={2000} placeholder="https://" />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="deadlineDate" label="Tenggat pendaftaran" hint="Dianggap berakhir pukul 23.59 WIB.">
            <TextInput id="deadlineDate" name="deadlineDate" type="date" required min={today} />
          </Field>
          <Field id="location" label="Lokasi (opsional)" hint="Kosongkan kalau sepenuhnya daring.">
            <TextInput id="location" name="location" maxLength={120} />
          </Field>
        </div>

        <label className="flex min-h-11 items-center gap-3 text-sm text-ink-soft">
          <input type="checkbox" name="isOnline" className="size-4 accent-brand" />
          Kegiatan ini diadakan secara daring
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink-soft">Jenjang peserta</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {EDUCATION_LEVELS.map((level) => (
              <label key={level} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="educationLevels" value={level} className="size-4 accent-brand" />
                {EDUCATION_LEVEL_LABEL[level]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink-soft">Bidang (opsional)</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {categories.map((category) => (
              <label key={category.slug} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="categorySlugs" value={category.slug} className="size-4 accent-brand" />
                {category.name}
              </label>
            ))}
          </div>
        </fieldset>

        <Field id="description" label="Deskripsi (opsional)" hint="Syarat, hadiah, biaya, dan hal penting lain. Maksimal 5000 karakter.">
          <TextArea id="description" name="description" rows={6} maxLength={5000} />
        </Field>

        <Field
          id="email"
          label="Email kamu"
          hint={
            user
              ? 'Untuk konfirmasi bila ada yang perlu dicek. Hasil tinjauan dikabarkan lewat lonceng notifikasi akunmu.'
              : 'Untuk konfirmasi bila ada yang perlu dicek. Masuk dulu kalau ingin dikabari lewat notifikasi saat kirimanmu disetujui atau ditolak.'
          }
        >
          <TextInput
            id="email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            defaultValue={user?.email ?? ''}
          />
        </Field>

        {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} nonce={nonce} />}

        <Button type="submit" size="lg" className="self-start">
          Kirim untuk diverifikasi
        </Button>
      </form>
    </div>
  );
}
