import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { BadgeCheck, ChevronDown, Lock, Plus, Send, ShieldCheck } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { MySubmissions } from '@/components/submit/my-submissions';
import { TurnstileWidget } from '@/components/submit/turnstile-widget';
import { buttonVariants } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { FormDraft } from '@/components/ui/form-draft';
import { ChoiceGroup, FormStep } from '@/components/ui/form-step';
import { StepFlow } from '@/components/ui/step-flow';
import { SubmitButton } from '@/components/ui/submit-button';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { jakartaDateKey } from '@/lib/deadline';
import { env } from '@/lib/env';
import type { RawSearchParams } from '@/lib/search-params';
import { NONCE_HEADER } from '@/lib/security-headers';
import { HONEYPOT_FIELD } from '@/lib/submission-schema';
import { TURNSTILE_RESPONSE_FIELD } from '@/lib/turnstile';
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

const OPTIONAL_DETAIL_FIELDS = new Set(['guidebookUrl', 'description', 'organizerContact', 'proofLink']);

/** Langkah (0-based) tempat tiap kolom berada — kiriman yang ditolak dibuka di kartu kolom bermasalah pertama. */
const FIELD_STEP: Record<string, number> = {
  title: 0,
  organizer: 0,
  eventType: 0,
  registrationLink: 0,
  sourceUrl: 0,
  deadlineAt: 1,
  location: 1,
  educationLevels: 2,
  categorySlugs: 2,
  costType: 2,
  priceAmount: 2,
};

function invalidFieldNames(raw: RawSearchParams['fields']): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? '').split(',').filter((name) => name in FIELD_LABEL);
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
  const invalidNames = invalidFieldNames(params.fields);
  const invalidFields = invalidNames.map((name) => FIELD_LABEL[name]);
  const optionalInvalid = invalidNames.some((name) => OPTIONAL_DETAIL_FIELDS.has(name));
  const invalidStep = invalidNames.length > 0 ? Math.min(...invalidNames.map((name) => FIELD_STEP[name] ?? 3)) : 0;
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
        {/* Di atas, bukan di kartu terakhir: keputusan masuk-dulu harus diambil SEBELUM mengisi, bukan setelahnya. */}
        {!user && (
          <p className="mt-3 text-sm text-ink-muted">
            <Link href="/login?next=%2Fsubmit" className="font-medium text-ink underline underline-offset-[3px]">
              Masuk dulu
            </Link>{' '}
            kalau ingin dikabari lewat notifikasi saat kirimanmu disetujui atau ditolak.
          </p>
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

      <form action={submitEventAction} className="mt-8">
        {/* Honeypot — tersembunyi dari manusia dan pembaca layar, lihat submission-schema.ts. */}
        <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
          <label htmlFor={HONEYPOT_FIELD}>Jangan diisi</label>
          <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
        </div>
        {/* `key` baru per render server: redirect ke /submit (sukses ATAU galat) me-mount ulang, jadi draf dipulihkan/dibuang sekali. */}
        <FormDraft
          key={randomUUID()}
          name="kirim-kegiatan"
          restore={Boolean(params.error)}
          exclude={`${HONEYPOT_FIELD},${TURNSTILE_RESPONSE_FIELD}`}
          className="[&:not(:empty)]:mb-5"
        />

        {/* Di-mount ulang per render server: setelah kiriman ditolak, kartu yang terbuka adalah kartu kolom bermasalah. */}
        <StepFlow
          key={randomUUID()}
          initialStep={invalidStep}
          steps={[
            {
              title: 'Tentang kegiatan',
              content: (
                <FormStep number={1} title="Tentang kegiatan" hint="Yang pertama dibaca peserta di kartu dan halaman detail.">
                  <Field id="title" label="Judul kegiatan" hint="Tulis persis seperti di pengumuman resmi. 6–255 karakter.">
                    <TextInput id="title" name="title" required minLength={6} maxLength={255} placeholder="Mis. Lomba UI/UX Nasional 2026" />
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="organizer" label="Penyelenggara">
                      <TextInput id="organizer" name="organizer" required minLength={2} maxLength={255} defaultValue={verifiedOrg ?? ''} placeholder="Lembaga, kampus, atau komunitas" />
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
                </FormStep>
              ),
            },
            {
              title: 'Waktu & tempat',
              content: (
                <FormStep number={2} title="Waktu & tempat" hint="Sisa waktu di kartu dihitung dari tanggal ini.">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="deadlineDate" label="Tenggat pendaftaran" hint="Dianggap berakhir pukul 23.59 WIB.">
                      <DateInput id="deadlineDate" name="deadlineDate" required min={today} />
                    </Field>
                    <Field id="location" label="Lokasi (opsional)" hint="Kota atau kampus. Kosongkan kalau sepenuhnya daring.">
                      <TextInput id="location" name="location" maxLength={120} placeholder="Mis. Bandung" />
                    </Field>
                  </div>

                  <label className="choice self-start">
                    <input type="checkbox" name="isOnline" className="check" />
                    Kegiatan ini diadakan secara daring
                  </label>
                </FormStep>
              ),
            },
            {
              title: 'Siapa yang bisa ikut',
              content: (
                <FormStep number={3} title="Siapa yang bisa ikut" hint="Dipakai mencocokkan kegiatan ini dengan profil pelajar yang tepat.">
                  <ChoiceGroup legend="Jenjang peserta" hint="minimal satu — pilih semua yang berlaku" requireOne="Pilih minimal satu jenjang peserta.">
                    <div className="flex flex-wrap gap-2">
                      {EDUCATION_LEVELS.map((level) => (
                        <label key={level} className="choice">
                          <input type="checkbox" name="educationLevels" value={level} className="check" />
                          {EDUCATION_LEVEL_LABEL[level]}
                        </label>
                      ))}
                    </div>
                  </ChoiceGroup>

                  <ChoiceGroup legend="Bidang" hint="opsional">
                    {/* Dua kolom di ponsel: nama bidang yang panjang membuat chip selebar
                        layar satu per baris — 13 baris sebelum sampai ke biaya. */}
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      {categories.map((category) => (
                        <label key={category.slug} className="choice">
                          <input type="checkbox" name="categorySlugs" value={category.slug} className="check" />
                          {category.name}
                        </label>
                      ))}
                    </div>
                  </ChoiceGroup>

                  {/* Satu pilihan wajib, bawaannya "belum tahu": data yang jujur lebih
                      berguna daripada tebakan "gratis" (ADR-049). Nominal tetap tampil
                      untuk semua pilihan — tanpa JavaScript tidak bisa disembunyikan
                      bersyarat — dan diabaikan server kecuali "berbayar". */}
                  <div className="flex flex-col gap-4">
                    <ChoiceGroup legend="Biaya pendaftaran">
                      <div className="grid grid-cols-3 gap-2 sm:max-w-[420px]">
                        {[
                          { value: 'free', label: 'Gratis' },
                          { value: 'paid', label: 'Berbayar' },
                          { value: 'unknown', label: 'Belum tahu' },
                        ].map((option) => (
                          <label key={option.value} className="choice flex-col justify-center gap-1.5 px-2 py-2.5 text-center sm:flex-row sm:gap-2.5">
                            <input
                              type="radio"
                              name="costType"
                              value={option.value}
                              required
                              defaultChecked={option.value === 'unknown'}
                              className="check"
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </ChoiceGroup>
                    <div className="sm:max-w-[calc(50%-0.625rem)]">
                      <Field id="priceAmount" label="Nominal biaya (jika berbayar)" hint="Contoh: 150000 atau Rp 150.000. Kosongkan kalau belum diumumkan.">
                        <TextInput id="priceAmount" name="priceAmount" inputMode="numeric" maxLength={20} placeholder="Rp" />
                      </Field>
                    </div>
                  </div>
                </FormStep>
              ),
            },
            {
              title: 'Kirim',
              content: (
                <>
                  <FormStep number={4} title="Kirim untuk dicek" hint="Moderator mengecek ke sumber aslinya sebelum kegiatan tayang.">
                    <Field
                      id="email"
                      label="Email kamu"
                      hint={
                        user
                          ? 'Untuk konfirmasi bila ada yang perlu dicek. Hasil tinjauan dikabarkan lewat lonceng notifikasi akunmu.'
                          : 'Untuk konfirmasi bila ada yang perlu dicek.'
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
                        placeholder="nama@kampus.ac.id"
                      />
                    </Field>

                    {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} nonce={nonce} />}

                  </FormStep>
                  {/* Kolom opsional yang jarang diisi dilipat supaya form inti muat
                      ±1,5 layar ponsel. Terbuka otomatis bila server menolak salah satu
                      isinya — kolom bermasalah tidak boleh tersembunyi. Kolom tautan di
                      dalamnya sengaja bukan `type="url"`: validasi bawaan browser pada
                      kontrol di <details> tertutup memblokir kirim TANPA pesan apa pun
                      ("not focusable"). Formatnya divalidasi server (Zod). */}
                  <details open={optionalInvalid} className="group/opsional rounded-[24px] border border-dashed border-line-strong bg-panel/60 open:border-solid open:border-line open:bg-panel">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[24px] px-5 py-4 transition-colors duration-150 ease-snap hover:bg-panel-nested sm:px-7 [&::-webkit-details-marker]:hidden">
                      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-pill border-2 border-dashed border-line-strong text-ink-muted">
                        <Plus className="size-4 transition-transform duration-200 ease-snap group-open/opsional:rotate-45" />
                      </span>
                      <span className="flex flex-1 flex-col">
                        <span className="text-[15px] font-semibold">Detail tambahan (opsional)</span>
                        <span className="text-[12.5px] text-ink-muted">Buku panduan, deskripsi, kontak panitia</span>
                      </span>
                      <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-snap group-open/opsional:rotate-180" />
                    </summary>
                    <div className="flex flex-col gap-5 border-t border-line px-5 pb-6 pt-5 sm:px-7">
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
                      <fieldset className="flex flex-col gap-4 rounded-[18px] bg-panel-nested p-4 sm:p-5">
                        <legend className="sr-only">Untuk panitia (hanya dilihat moderator)</legend>
                        <p aria-hidden className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
                          <Lock className="size-3.5" /> Untuk panitia — hanya dilihat moderator
                        </p>
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
                </>
              ),
            },
          ]}
          submit={
            <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ size: 'lg', className: 'w-full sm:w-auto' })}>
              <Send aria-hidden />
              Kirim untuk diverifikasi
            </SubmitButton>
          }
        />
      </form>
    </div>
  );
}
