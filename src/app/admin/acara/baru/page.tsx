import type { Metadata } from 'next';
import { ArrowRight, ClipboardList, PenSquare, Sparkles, ToggleRight } from 'lucide-react';
import { AdminNav } from '@/components/admin/admin-nav';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { buttonVariants } from '@/components/ui/button';
import { CityDatalist } from '@/components/ui/city-datalist';
import { DateInput } from '@/components/ui/date-input';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { FieldMemory } from '@/components/ui/field-memory';
import { ChoiceGroup, FormStep } from '@/components/ui/form-step';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { UnsavedChangesGuard } from '@/components/ui/unsaved-changes-guard';
import { parseActionErrorCode } from '@/lib/action-feedback';
import { adminMetadata, requireAdmin } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { jakartaDateKey } from '@/lib/deadline';
import { FORM_TEMPLATES } from '@/lib/form-templates';
import { REGISTRATION_FORM_LIMITS } from '@/lib/registration-form';
import type { RawSearchParams } from '@/lib/search-params';
import { SUBMISSION_SLIDE_LIMIT } from '@/lib/data/repository';
import { SLIDE_CAPTION_FIELD, SLIDE_FILE_FIELD } from '@/lib/slides';
import { SUBMISSION_POSTER_FIELD } from '@/lib/submission-schema';
import { SlideIdeas } from '@/components/submit/slide-ideas';
import {
  DEADLINE_LABEL_TEXT,
  EDUCATION_LEVEL_LABEL,
  EDUCATION_LEVELS,
  EVENT_TYPE_LABEL,
  EVENT_TYPES,
  SUBMISSION_STAGE_LABELS,
} from '@/types/domain';
import { createInternalEventAction } from './actions';

export const dynamic = 'force-dynamic';

export const generateMetadata = (): Promise<Metadata> => adminMetadata('Buat acara StudentFo');

/** Nama field skema → label manusia; juga daftar putih untuk `?fields=`. */
const FIELD_LABEL: Record<string, string> = {
  title: 'Judul acara',
  organizer: 'Penyelenggara',
  description: 'Deskripsi',
  eventType: 'Jenis kegiatan',
  registrationLink: 'Tautan pendaftaran',
  educationLevels: 'Jenjang peserta',
  categorySlugs: 'Bidang',
  location: 'Lokasi',
  deadlineAt: 'Tenggat pendaftaran',
  stages: 'Tahapan jadwal',
  costType: 'Biaya',
  priceAmount: 'Nominal biaya',
  paymentInstructions: 'Cara pembayaran',
  guidebookUrl: 'Buku panduan',
  videoUrl: 'Video',
  poster: 'Poster',
  slides: 'Slide penjelas',
};

const REMEMBERED_FIELDS = [
  'title',
  'organizer',
  'eventType',
  'description',
  'deadlineDate',
  'location',
  ...SUBMISSION_STAGE_LABELS.map((label) => `stage_${label}`),
  'priceAmount',
  'paymentInstructions',
  'registrationLink',
  'guidebookUrl',
  'videoUrl',
] as const;
const REMEMBERED_CHOICES = ['isOnline', 'educationLevels', 'categorySlugs', 'costType', 'registrationMode', 'template'] as const;

const STEPS = [
  { icon: PenSquare, title: 'Isi detail acara', body: 'Halaman ini. Acara langsung tayang — tanpa antrean.' },
  { icon: ClipboardList, title: 'Periksa formulir', body: 'Formulir sudah disiapkan dari templat. Ubah pertanyaannya bila perlu.' },
  { icon: ToggleRight, title: 'Buka pendaftaran', body: 'Nyalakan “Terima pendaftaran lewat StudentFo”. Sebelum itu tombol Daftar belum aktif.' },
] as const;

/**
 * "Buat acara StudentFo" (ADR-093): lomba/acara internal dibuat admin dari
 * satu halaman, lalu diantar ke penyusun formulir. Pengganti alur lima
 * langkah lewat /submit → antrean → setujui sendiri → studio → formulir.
 */
export default async function CreateInternalEventPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params] = await Promise.all([searchParams, requireAdmin()]);
  const categories = await (await getEventRepository()).listCategories();
  const today = jakartaDateKey(new Date());
  const fieldsParam = Array.isArray(params.fields) ? params.fields[0] : params.fields;
  const invalidFields = (fieldsParam ?? '')
    .split(',')
    .map((name) => FIELD_LABEL[name])
    .filter((label): label is string => Boolean(label));
  const restore = parseActionErrorCode(params.error) !== null;

  return (
    <div className="container-page py-8">
      <AdminNav active="buat" />
      <header className="max-w-3xl">
        <h1 className="text-3xl">Buat acara StudentFo</h1>
        <p className="mt-2 text-ink-soft">
          Untuk lomba, kelas, atau acara yang diselenggarakan StudentFo sendiri. Pendaftarannya lewat formulir di StudentFo — pendaftar,
          pembayaran, dan ekspor CSV di satu tempat.
        </p>
      </header>

      <ol aria-label="Alur membuat acara" className="mt-6 grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className={`flex min-w-0 items-start gap-3 rounded-card border p-4 ${index === 0 ? 'border-ink bg-panel' : 'border-line bg-panel/60'}`}
            aria-current={index === 0 ? 'step' : undefined}
          >
            <span
              aria-hidden
              className={`flex size-8 shrink-0 items-center justify-center rounded-pill text-sm font-semibold ${index === 0 ? 'bg-brand text-on-brand' : 'bg-panel-nested text-ink-muted'}`}
            >
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-[14px] font-semibold">
                <step.icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
                {step.title}
              </span>
              <span className="text-[12.5px] leading-snug text-ink-muted">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <ActionFeedback params={params} className="mt-6" />
      {invalidFields.length > 0 && <p className="mt-2 text-sm text-danger">Periksa kolom: {invalidFields.join(', ')}.</p>}

      <form action={createInternalEventAction} className="mt-8 flex max-w-3xl flex-col gap-4">
        <UnsavedChangesGuard />
        <FieldMemory storageKey="buat-acara-studentfo" fields={REMEMBERED_FIELDS} choices={REMEMBERED_CHOICES} restore={restore} />

        <FormStep number={1} title="Tentang acara" hint="Yang pertama dibaca peserta di kartu dan halaman acara.">
          <Field id="title" label="Judul acara" hint="6–255 karakter. Mis. “Lomba Esai StudentFo 2027”.">
            <TextInput id="title" name="title" required minLength={6} maxLength={255} placeholder="Lomba … StudentFo 2027" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="eventType" label="Jenis kegiatan">
              <SelectInput id="eventType" name="eventType" required defaultValue="LOMBA">
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EVENT_TYPE_LABEL[type]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="organizer" label="Penyelenggara" hint="Tampil di kartu. Ubah bila bekerja sama dengan lembaga lain.">
              <TextInput id="organizer" name="organizer" required minLength={2} maxLength={255} defaultValue="StudentFo" />
            </Field>
          </div>
          <Field id="description" label="Deskripsi" hint="Tema, hadiah, syarat, dan cara penilaian. Maks. 5000 karakter.">
            <TextArea id="description" name="description" rows={7} maxLength={5000} />
          </Field>
        </FormStep>

        <FormStep number={2} title="Waktu & tempat" hint="Sisa waktu di kartu dihitung dari tenggat ini.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="deadlineDate" label="Tenggat pendaftaran" hint="Berakhir pukul 23.59 WIB.">
              <DateInput id="deadlineDate" name="deadlineDate" required min={today} />
            </Field>
            <Field id="location" label="Lokasi (opsional)" hint="Kosongkan bila sepenuhnya daring.">
              <TextInput id="location" name="location" maxLength={120} placeholder="Ketik kota, mis. Bandung" list="daftar-kota-admin" autoComplete="off" />
              <CityDatalist id="daftar-kota-admin" />
            </Field>
          </div>
          <label className="choice self-start">
            <input type="checkbox" name="isOnline" className="check" defaultChecked />
            Diadakan secara daring
          </label>
          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="mb-1 text-[13.5px] font-semibold">
              Tahapan sesudah pendaftaran <span className="font-normal text-ink-muted">(opsional)</span>
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              {SUBMISSION_STAGE_LABELS.map((label) => (
                <Field key={label} id={`stage_${label}`} label={DEADLINE_LABEL_TEXT[label]}>
                  <DateInput id={`stage_${label}`} name={`stage_${label}`} min={today} />
                </Field>
              ))}
            </div>
          </fieldset>
        </FormStep>

        <FormStep number={3} title="Peserta & biaya" hint="Dipakai mencocokkan acara dengan profil pelajar yang tepat.">
          <ChoiceGroup legend="Jenjang peserta" hint="wajib · pilih semua yang berlaku">
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
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {categories.map((category) => (
                <label key={category.slug} className="choice min-w-0">
                  <input type="checkbox" name="categorySlugs" value={category.slug} className="check" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{category.name}</span>
                </label>
              ))}
            </div>
          </ChoiceGroup>
          {/* Biaya & cara bayar tampil terus (tanpa JS tidak bisa bersyarat); server mewajibkan keduanya hanya bila berbayar. */}
          <ChoiceGroup legend="Biaya pendaftaran">
            <div className="grid grid-cols-2 gap-2 sm:max-w-[320px]">
              {[
                { value: 'free', label: 'Gratis' },
                { value: 'paid', label: 'Berbayar' },
              ].map((option) => (
                <label key={option.value} className="choice justify-center">
                  <input type="radio" name="costType" value={option.value} required defaultChecked={option.value === 'free'} className="check" />
                  {option.label}
                </label>
              ))}
            </div>
          </ChoiceGroup>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="priceAmount" label="Nominal (jika berbayar)" hint="Contoh: 50000 atau Rp 50.000.">
              <TextInput id="priceAmount" name="priceAmount" inputMode="numeric" maxLength={20} placeholder="Rp" />
            </Field>
            <Field
              id="paymentInstructions"
              label="Cara pembayaran (jika berbayar)"
              hint="Rekening/e-wallet/QRIS tujuan. Hanya terlihat oleh pendaftar."
            >
              <TextArea
                id="paymentInstructions"
                name="paymentInstructions"
                rows={3}
                maxLength={REGISTRATION_FORM_LIMITS.instructionsMax}
                placeholder="Mis. Transfer BCA 123456789 a.n. StudentFo"
              />
            </Field>
          </div>
        </FormStep>

        {/* `:has()` menyembunyikan isian yang tidak relevan dengan pilihan cara mendaftar — tanpa JavaScript. */}
        <div className="flex flex-col gap-4 [&:has(input[name=registrationMode][value=external]:checked)_[data-internal]]:hidden [&:has(input[name=registrationMode][value=studentfo]:checked)_[data-external]]:hidden">
          <FormStep number={4} title="Cara mendaftar" hint="Lomba internal: pakai formulir StudentFo.">
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="sr-only">Cara mendaftar</legend>
              <label className="choice w-full">
                <input type="radio" name="registrationMode" value="studentfo" defaultChecked className="check" />
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    Formulir StudentFo <span className="rounded-pill bg-highlight-soft px-2 py-0.5 text-[11.5px] font-semibold text-ink">Disarankan</span>
                  </span>
                  <span className="text-[12.5px] font-normal text-ink-muted">Pendaftar mengisi di sini; kamu memeriksa, menerima, dan mengekspor CSV.</span>
                </span>
              </label>
              <label className="choice w-full">
                <input type="radio" name="registrationMode" value="external" className="check" />
                <span className="flex min-w-0 flex-col">
                  <span>Tautan luar</span>
                  <span className="text-[12.5px] font-normal text-ink-muted">Google Form atau situs lain — tombol Daftar membuka tautan itu.</span>
                </span>
              </label>
            </fieldset>

            <div data-internal>
              <ChoiceGroup legend="Mulai formulir dari templat" hint="semua pertanyaan bisa diubah setelahnya">
                <div className="grid gap-2 sm:grid-cols-3">
                  {FORM_TEMPLATES.map((template, index) => (
                    <label key={template.key} className="choice h-full min-w-0 items-start">
                      <input type="radio" name="template" value={template.key} defaultChecked={index === 0} className="check mt-0.5" />
                      <span className="flex min-w-0 flex-col">
                        <span>{template.name}</span>
                        <span className="text-[12.5px] font-normal leading-snug text-ink-muted">{template.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </ChoiceGroup>
            </div>

            <div data-external>
              {/* Tanpa `required`: kontrol tersembunyi yang wajib menahan kirim tanpa bisa difokus. Server mewajibkannya untuk tautan luar. */}
              <Field id="registrationLink" label="Tautan pendaftaran" hint="Alamat lengkap, diawali https://.">
                <TextInput id="registrationLink" name="registrationLink" type="url" maxLength={2000} placeholder="https://" />
              </Field>
            </div>
          </FormStep>
        </div>

        <FormStep number={5} title="Poster, slide & lampiran" hint="Opsional, tapi acara bergambar jauh lebih cepat dipahami.">
          <ImageUploadField
            id="poster"
            name={SUBMISSION_POSTER_FIELD}
            label="Poster (opsional)"
            hint="Satu gambar tegak (±4:5). Maks. 5 MB. Tampil sebagai slide pertama, gambar kartu, dan saat tautan dibagikan."
          />
          <ImageUploadField
            id="slides"
            name={SLIDE_FILE_FIELD}
            label={`Slide penjelas (opsional, maks. ${SUBMISSION_SLIDE_LIMIT})`}
            hint="Tampil sesudah poster, persis dalam urutan ini. Beri keterangan tiap gambar; slide berikutnya bisa ditambah dari studio."
            multiple
            maxFiles={SUBMISSION_SLIDE_LIMIT}
            captionName={SLIDE_CAPTION_FIELD}
          />
          <SlideIdeas />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="videoUrl" label="Video (opsional)" hint="Tautan YouTube atau Vimeo.">
              <TextInput id="videoUrl" name="videoUrl" inputMode="url" maxLength={500} autoComplete="off" spellCheck={false} placeholder="https://youtu.be/…" />
            </Field>
            <Field id="guidebookUrl" label="Buku panduan (opsional)" hint="Tautan https ke PDF/halaman syarat.">
              <TextInput id="guidebookUrl" name="guidebookUrl" inputMode="url" maxLength={2000} placeholder="https://" />
            </Field>
          </div>
        </FormStep>

        <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-[13px] leading-snug text-ink-muted sm:max-w-[42ch]">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />
            Acara langsung tayang dan tercatat di Riwayat moderasi. Formulir StudentFo dibuat TERTUTUP sampai kamu membukanya.
          </p>
          <SubmitButton pendingLabel="Membuat acara…" className={buttonVariants({ size: 'lg', className: 'w-full sm:w-auto' })}>
            Buat acara
            <ArrowRight aria-hidden />
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
