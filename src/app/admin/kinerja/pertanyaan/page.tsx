import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ListChecks, Save, ShieldCheck } from 'lucide-react';
import { AdminNav } from '@/components/admin/admin-nav';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { FormBuilder } from '@/components/organizer/form-builder';
import { FORM_BUILDER_CHANGE_EVENT } from '@/components/organizer/registration-settings';
import { buttonVariants } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { UnsavedChangesGuard } from '@/components/ui/unsaved-changes-guard';
import { adminMetadata, requireAdmin } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { OUTBOUND_LIMITS, OUTBOUND_QUESTION_TYPES } from '@/lib/outbound-survey';
import type { RawSearchParams } from '@/lib/search-params';
import { SURVEY_ASK_MODE_LABEL, SURVEY_ASK_MODES, type SurveyAskMode } from '@/types/domain';
import { saveOutboundConfigAction } from '../actions';

export const dynamic = 'force-dynamic';

export const generateMetadata = (): Promise<Metadata> => adminMetadata('Pertanyaan pendataan');

const BUILT_IN: readonly { name: 'askEducation' | 'askRegion' | 'askInstitution'; label: string; hint: string }[] = [
  { name: 'askEducation', label: 'Jenjang pendidikan', hint: 'Terisi otomatis dari profil bila pengunjung masuk.' },
  { name: 'askRegion', label: 'Domisili kabupaten/kota', hint: '514 kab/kota se-Indonesia; disimpan sampai tingkat kab/kota saja.' },
  { name: 'askInstitution', label: 'Asal sekolah / kampus', hint: 'Pilih dari direktori resmi atau ketik bebas.' },
];

/**
 * Penyusun pertanyaan pendataan kinerja (ADR-073) — admin/moderator. Tiga
 * pertanyaan bawaan punya pemilih sendiri karena jawabannya terstruktur
 * (kode wilayah, id direktori); sisanya `FormBuilder` yang sama dengan
 * formulir pendaftaran, dibatasi ke jenis yang bisa dihitung & tidak
 * mengundang data pribadi.
 */
export default async function OutboundQuestionsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requireAdmin();
  const [query, config] = await Promise.all([searchParams, (await getEventRepository()).getOutboundSurveyConfig()]);
  const modes: Record<(typeof BUILT_IN)[number]['name'], SurveyAskMode> = {
    askEducation: config.askEducation,
    askRegion: config.askRegion,
    askInstitution: config.askInstitution,
  };

  return (
    <div className="container-page py-8">
      <AdminNav active="kinerja" />
      <Link href="/admin/kinerja" className="mb-3 flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Kinerja postingan
      </Link>
      <header className="mb-6 max-w-2xl">
        <h1 className="flex items-center gap-2 text-3xl">
          <ListChecks aria-hidden className="size-7 text-ink-muted" />
          Pertanyaan pendataan
        </h1>
        <p className="mt-2 text-ink-soft">
          Pertanyaan yang muncul tepat sebelum pengunjung keluar ke tautan pendaftaran resmi. Pengunjung selalu bisa menekan
          “Lewati”, jadi setiap pertanyaan tambahan menurunkan jumlah yang menjawab — tanyakan yang benar-benar kamu pakai.
        </p>
        {config.updatedAt && (
          <p className="mt-2 text-[13px] text-ink-muted">
            Terakhir diubah{' '}
            {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(config.updatedAt))} WIB
          </p>
        )}
      </header>

      <ActionFeedback params={query} className="mb-6 max-w-2xl" />

      <form action={saveOutboundConfigAction} className="flex max-w-3xl flex-col gap-6">
        <UnsavedChangesGuard changeEvent={FORM_BUILDER_CHANGE_EVENT} />

        <section aria-labelledby="bawaan" className="flex flex-col gap-4 rounded-card border border-line bg-panel p-5 shadow-card">
          <h2 id="bawaan" className="text-lg font-semibold">
            Pertanyaan bawaan
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {BUILT_IN.map((item) => (
              <li key={item.name} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex min-w-0 flex-col">
                  <label htmlFor={item.name} className="font-medium">
                    {item.label}
                  </label>
                  <span className="text-[13px] text-ink-muted">{item.hint}</span>
                </span>
                <SelectInput id={item.name} name={item.name} defaultValue={modes[item.name]} className="w-full sm:w-48">
                  {SURVEY_ASK_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {SURVEY_ASK_MODE_LABEL[mode]}
                    </option>
                  ))}
                </SelectInput>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="tambahan" className="flex flex-col gap-4 rounded-card border border-line bg-panel p-5 shadow-card">
          <div className="flex flex-col gap-1">
            <h2 id="tambahan" className="text-lg font-semibold">
              Pertanyaan tambahan
            </h2>
            <p className="text-[13.5px] text-ink-muted">
              Maks. {OUTBOUND_LIMITS.maxQuestions} pertanyaan: pilihan ganda, kotak centang, jawaban singkat, atau angka. Jawaban
              singkat tampil di dasbor hanya bila sama persis dari minimal {OUTBOUND_LIMITS.minBucket} orang. Jangan minta nama,
              nomor HP, atau email — layar ini menjanjikan jawaban tanpa identitas.
            </p>
          </div>
          <FormBuilder
            initialFields={config.questions}
            types={OUTBOUND_QUESTION_TYPES}
            maxFields={OUTBOUND_LIMITS.maxQuestions}
            emptyText="Belum ada pertanyaan tambahan — pengunjung hanya melihat pertanyaan bawaan yang aktif."
          />
        </section>

        <p role="note" className="flex items-start gap-2 rounded-card bg-panel-nested p-4 text-sm text-ink-soft">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          Mengganti atau menghapus pertanyaan tidak menghapus jawaban lama (tetap sampai retensi 365 hari), tetapi dasbor
          hanya menampilkan pertanyaan yang berlaku. Mematikan semua pertanyaan = layar pendataan tidak muncul sama sekali.
        </p>

        <div className="flex">
          <SubmitButton pendingLabel="Menyimpan…" className={buttonVariants({ size: 'lg' })}>
            <Save aria-hidden /> Simpan pertanyaan
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
