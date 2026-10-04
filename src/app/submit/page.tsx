import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { BadgeCheck, ChevronDown, ShieldCheck } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { MySubmissions } from '@/components/submit/my-submissions';
import { TurnstileWidget } from '@/components/submit/turnstile-widget';
import { buttonVariants } from '@/components/ui/button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { HandNote } from '@/components/ui/sketch';
import { SubmitButton } from '@/components/ui/submit-button';
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
  costType: 'Biaya pendaftaran',
  priceAmount: 'Nominal biaya',
  guidebookUrl: 'Buku panduan',
  organizerContact: 'Kontak panitia',
  proofLink: 'Bukti kepanitiaan',
};

const OPTIONAL_DETAIL_LABELS = new Set(
  ['guidebookUrl', 'description', 'organizerContact', 'proofLink'].map((name) => FIELD_LABEL[name]),
);

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
  const [categories, organizerProfile, mySubmissions] = await Promise.all([
    repository.listCategories(),
    user ? repository.getOrganizerProfile(user.id) : Promise.resolve(null),
    user ? repository.listMySubmissions(user.id, 5) : Promise.resolve([]),
  ]);
  const verifiedOrg = organizerProfile?.status === 'VERIFIED' ? organizerProfile.orgName : null;
  const invalidFields = invalidFieldLabels(params.fields);
  const optionalInvalid = invalidFields.some((label) => OPTIONAL_DETAIL_LABELS.has(label));
  const today = jakartaDateKey(new Date());

  return (
    <div className="container-page max-w-3xl py-10">
      <header>
        <h1 className="text-3xl">Kirim kegiatan</h1>
        <p className="mt-3 text-ink-soft">
          Tahu lomba, beasiswa, magang, atau workshop yang belum ada di StudentFo? Kirim di sini.
          Penyelenggara juga boleh mendaftarkan acaranya sendiri.
        </p>
        {/* Satu baris teks biasa, bukan kotak ketiga: tiga kotak bertumpuk di
            atas form membuat orang menggulir melewati semuanya tanpa membaca. */}
        <p className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          Dicek manual ke sumber aslinya sebelum tayang. Emailmu tidak pernah ditampilkan ke publik.
        </p>
        {verifiedOrg ? (
          <p className="mt-3 flex items-start gap-2 rounded-card border border-success-line bg-success-soft p-4 text-sm text-success">
            <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Kamu mengirim sebagai <strong className="font-semibold">{verifiedOrg}</strong> (terverifikasi). Kirimanmu ditandai
              untuk moderator, dan setelah disetujui acaranya otomatis masuk{' '}
              <Link href="/penyelenggara" className="font-semibold underline underline-offset-[3px]">
                studio penyelenggara
              </Link>{' '}
              lengkap dengan analitiknya.
            </span>
          </p>
        ) : (
          user && (
            <p className="mt-3 text-sm text-ink-muted">
              Penyelenggara acara ini?{' '}
              <Link href="/penyelenggara" className="font-medium text-ink underline underline-offset-[3px]">
                Verifikasi lembagamu
              </Link>{' '}
              supaya kirimanmu mendapat lencana terverifikasi dan analitik peserta.
            </p>
          )
        )}
      </header>

      <ActionFeedback params={params} className="mt-6" />
      {invalidFields.length > 0 && (
        <p className="mt-2 text-sm text-danger">Periksa kolom: {invalidFields.join(', ')}.</p>
      )}

      {mySubmissions.length > 0 && (
        <div className="mt-8">
          <MySubmissions submissions={mySubmissions} />
        </div>
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
            <TextInput id="organizer" name="organizer" required minLength={2} maxLength={255} defaultValue={verifiedOrg ?? ''} />
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
          <div className="grid grid-cols-2 gap-x-4 sm:flex sm:flex-wrap sm:gap-x-5 sm:gap-y-1">
            {categories.map((category) => (
              <label key={category.slug} className="flex min-h-11 items-center gap-2 text-sm leading-snug">
                <input type="checkbox" name="categorySlugs" value={category.slug} className="size-4 shrink-0 accent-brand" />
                {category.name}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Satu pilihan wajib, bawaannya "belum tahu": data yang jujur lebih
            berguna daripada tebakan "gratis" (ADR-049). Nominal tetap tampil
            untuk semua pilihan — tanpa JavaScript tidak bisa disembunyikan
            bersyarat — dan diabaikan server kecuali "berbayar". */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink-soft">Biaya pendaftaran</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {[
              { value: 'free', label: 'Gratis' },
              { value: 'paid', label: 'Berbayar' },
              { value: 'unknown', label: 'Belum tahu' },
            ].map((option) => (
              <label key={option.value} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="costType"
                  value={option.value}
                  required
                  defaultChecked={option.value === 'unknown'}
                  className="size-4 accent-brand"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="sm:max-w-[calc(50%-0.625rem)]">
          <Field id="priceAmount" label="Nominal biaya (jika berbayar)" hint="Contoh: 150000 atau Rp 150.000. Kosongkan kalau belum diumumkan.">
            <TextInput id="priceAmount" name="priceAmount" inputMode="numeric" maxLength={20} placeholder="Rp" />
          </Field>
        </div>

        {/* Kolom opsional yang jarang diisi dilipat supaya form inti muat
            ±1,5 layar ponsel. Terbuka otomatis bila server menolak salah satu
            isinya — kolom bermasalah tidak boleh tersembunyi. Kolom tautan di
            dalamnya sengaja bukan `type="url"`: validasi bawaan browser pada
            kontrol di <details> tertutup memblokir kirim TANPA pesan apa pun
            ("not focusable"). Formatnya divalidasi server (Zod). */}
        <details open={optionalInvalid} className="group/opsional rounded-card border border-line bg-panel">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-semibold">Detail tambahan (opsional)</span>
              <span className="text-xs text-ink-muted">Buku panduan, deskripsi, kontak panitia</span>
            </span>
            <HandNote className="hidden text-[17px] sm:inline-block">makin lengkap, makin cepat dicek</HandNote>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-snap group-open/opsional:rotate-180" />
          </summary>
          <div className="flex flex-col gap-5 border-t border-line p-4">
            <Field
              id="guidebookUrl"
              label="Buku panduan (opsional)"
              hint="Tautan https ke PDF/halaman syarat & ketentuan. PDF bisa dipratinjau langsung oleh peserta."
            >
              <TextInput id="guidebookUrl" name="guidebookUrl" inputMode="url" maxLength={2000} placeholder="https://" />
            </Field>

            <Field id="description" label="Deskripsi (opsional)" hint="Syarat, hadiah, dan hal penting lain. Maksimal 5000 karakter.">
              <TextArea id="description" name="description" rows={6} maxLength={5000} />
            </Field>

            {/* Bahan verifikasi — tidak pernah disalin ke halaman publik
                (approve_submission tidak menyalinnya). */}
            <fieldset className="flex flex-col gap-4 rounded-card border border-line p-4">
              <legend className="px-1 text-sm font-medium text-ink-soft">Untuk panitia (hanya dilihat moderator)</legend>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="organizerContact" label="Kontak panitia (opsional)" hint="Email, WhatsApp, atau akun resmi — dipakai moderator untuk konfirmasi.">
                  <TextInput id="organizerContact" name="organizerContact" maxLength={120} autoComplete="off" />
                </Field>
                <Field id="proofLink" label="Bukti kepanitiaan (opsional)" hint="Mis. surat tugas atau unggahan resmi yang menyebut namamu. Mempercepat verifikasi.">
                  <TextInput id="proofLink" name="proofLink" inputMode="url" maxLength={2000} placeholder="https://" />
                </Field>
              </div>
            </fieldset>
          </div>
        </details>

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

        <SubmitButton className={buttonVariants({ size: 'lg', className: 'self-start' })}>
          Kirim untuk diverifikasi
        </SubmitButton>
      </form>
    </div>
  );
}
