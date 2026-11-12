import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, ShieldCheck, Users } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { RegistrationFieldInput } from '@/components/registration/registration-field-input';
import { buttonVariants } from '@/components/ui/button';
import { ChoiceGroup } from '@/components/ui/form-step';
import { InstitutionPicker } from '@/components/ui/institution-picker';
import { RegionPicker } from '@/components/ui/region-picker';
import { SubmitButton } from '@/components/ui/submit-button';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import { isSurveyEmpty, OUTBOUND_LIMITS, surveyQuestionCount } from '@/lib/outbound-survey';
import { hasAnsweredOutboundSurvey } from '@/lib/outbound-survey-cookie';
import { sectionTitle } from '@/lib/page-title';
import { registrationDestination } from '@/lib/registration-destination';
import { loginHref } from '@/lib/safe-redirect';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { HONEYPOT_FIELD } from '@/lib/submission-schema';
import { safeHostname } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, EDUCATION_LEVELS, type SurveyAskMode } from '@/types/domain';
import { submitOutboundSurveyAction } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const event = await (await getEventRepository()).getEventBySlug((await params).slug);
  return {
    title: event ? sectionTitle('Sebelum mendaftar', event.title) : 'Sebelum mendaftar',
    robots: { index: false, follow: false },
  };
}

function Optional({ mode }: { mode: SurveyAskMode }) {
  return mode === 'OPTIONAL' ? <span className="font-normal text-ink-muted"> (opsional)</span> : null;
}

function ProblemText({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="text-[13px] font-medium text-danger">
      {children}
    </p>
  );
}

/**
 * Pendataan kinerja postingan (ADR-070, ADR-073): satu layar singkat antara
 * "Daftar" dan tautan pendaftaran resmi. Pertanyaannya disusun admin
 * (/admin/kinerja/pertanyaan); pengunjung selalu bisa menekan "Lewati".
 * Hanya untuk tujuan LUAR, dan hanya sekali per acara per peramban — dijawab
 * ATAU dilewati. Tujuannya dijelaskan terang di atas form, bukan di catatan kaki.
 */
export default async function BeforeRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const repository = await getEventRepository();
  const event = await repository.getEventBySlug(slug);
  if (!event) notFound();

  const eventPath = `/events/${event.slug}`;
  // Jalan ke tautan pendaftaran = khusus anggota, sama dengan /daftar (ADR-085).
  const user = await getSessionUser();
  if (!user) redirect(loginHref(eventPath));
  const destination = await registrationDestination(event, repository);
  if (!destination) redirect(eventPath);
  if (destination.kind === 'internal' || (await hasAnsweredOutboundSurvey(event.id))) redirect(`${eventPath}/daftar`);
  // Pertanyaan gagal dimuat = langsung ke tautan resmi, bukan halaman galat —
  // dan bukan kembali ke `/daftar`, yang bisa memantul ke sini lagi (ADR-070).
  const config = await withFallback('pertanyaan pendataan', () => repository.getOutboundSurveyConfig(), null);
  if (!config) redirect(destination.url);
  if (isSurveyEmpty(config)) redirect(`${eventPath}/daftar`);

  const host = safeHostname(destination.url);
  const count = surveyQuestionCount(config);
  const problem = firstParam(query.error) === 'invalid_outbound_survey' ? firstParam(query.kolom) : undefined;

  return (
    <div className="container-page pb-24 pt-6 sm:pt-8">
      <div className="mx-auto flex max-w-[640px] flex-col gap-6">
        <Link href={eventPath} className="flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> Kembali ke acara
        </Link>

        <header className="flex flex-col gap-3">
          <p className="text-[13.5px] font-semibold text-ink-muted">Satu langkah sebelum pendaftaran resmi</p>
          <h1 className="text-[clamp(26px,4.2vw,34px)] leading-[1.1] tracking-[-0.03em] [text-wrap:balance]">{event.title}</h1>
          <p className="text-[15px] text-ink-soft">{event.organizer}</p>
        </header>

        <p role="note" className="flex items-start gap-3 rounded-card border border-line bg-panel-nested p-4 text-[14px] leading-relaxed text-ink-soft">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <span>
            Bantu StudentFo mengukur postingan ini — {count} pertanyaan singkat, boleh dilewati. Jawabanmu{' '}
            <strong className="font-semibold text-ink">tidak memuat nama atau email</strong>, tidak dikirim ke penyelenggara, dan
            dihapus setelah satu tahun.{' '}
            <Link href="/privacy-policy#kp-2" className="font-medium text-ink underline underline-offset-[3px]">
              Kebijakan privasi
            </Link>
          </span>
        </p>

        <ActionFeedback params={query} />

        <form action={submitOutboundSurveyAction} className="flex flex-col gap-6 rounded-[20px] border border-line bg-panel p-5 sm:p-7">
          <input type="hidden" name="slug" value={event.slug} />
          {/* Honeypot — tersembunyi dari manusia dan pembaca layar, pola /submit. */}
          <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
            <label htmlFor={HONEYPOT_FIELD}>Jangan diisi</label>
            <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {config.askEducation !== 'OFF' && (
            <ChoiceGroup
              legend={config.askEducation === 'OPTIONAL' ? 'Jenjang pendidikanmu sekarang (opsional)' : 'Jenjang pendidikanmu sekarang'}
              hint={user?.educationLevel ? 'terisi dari profilmu' : undefined}
            >
              <div className="flex flex-wrap gap-2">
                {EDUCATION_LEVELS.map((level) => (
                  <label key={level} className="choice">
                    <input
                      type="radio"
                      name="educationLevel"
                      value={level}
                      required={config.askEducation === 'REQUIRED'}
                      defaultChecked={user?.educationLevel === level}
                      className="check"
                    />
                    {EDUCATION_LEVEL_LABEL[level]}
                  </label>
                ))}
              </div>
              {problem === 'educationLevel' && <ProblemText id="educationLevel-error">Pilih jenjangmu.</ProblemText>}
            </ChoiceGroup>
          )}

          {config.askRegion !== 'OFF' && (
            <div className="flex flex-col gap-2">
              <span id="region-label" className="text-[15px] font-semibold">
                Domisili kabupaten / kota
                <Optional mode={config.askRegion} />
              </span>
              <RegionPicker name="region" defaultValue={null} labelledBy="region-label" optional={config.askRegion === 'OPTIONAL'} />
              {problem === 'region' && <ProblemText id="region-error">Pilih kabupaten/kota domisilimu.</ProblemText>}
            </div>
          )}

          {config.askInstitution !== 'OFF' && (
            <div className="flex flex-col gap-2">
              <label htmlFor="institution" className="text-[15px] font-semibold">
                Asal sekolah / kampus
                <Optional mode={config.askInstitution} />
              </label>
              <InstitutionPicker
                id="institution"
                defaultId={null}
                defaultName={null}
                minLength={OUTBOUND_LIMITS.institutionMin}
                maxLength={OUTBOUND_LIMITS.institutionMax}
                required={config.askInstitution === 'REQUIRED'}
                describedBy={problem === 'institution' ? 'institution-error' : undefined}
              />
              {problem === 'institution' && <ProblemText id="institution-error">Pilih dari daftar, atau tulis nama sekolah/kampusmu (2–120 karakter).</ProblemText>}
            </div>
          )}

          {config.questions.map((field) => (
            <RegistrationFieldInput key={field.id} field={field} invalid={problem === `field:${field.id}`} radioMax={8} />
          ))}

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SubmitButton pendingLabel="Membuka pendaftaran…" className={buttonVariants({ size: 'lg', className: 'w-full sm:w-auto' })}>
                Lanjut ke pendaftaran resmi <ArrowUpRight aria-hidden />
              </SubmitButton>
              {/* formNoValidate: melewati tidak boleh ditahan isian wajib peramban. */}
              <button
                type="submit"
                name="intent"
                value="skip"
                formNoValidate
                className={buttonVariants({ variant: 'ghost', size: 'lg', className: 'w-full sm:w-auto' })}
              >
                Lewati
              </button>
            </div>
            {host && <p className="text-[12.5px] text-ink-muted">Keduanya langsung mengarahkanmu ke {host}.</p>}
          </div>
        </form>

        {event.eventType === 'LOMBA' && (
          <p className="flex items-start gap-2 text-[13.5px] text-ink-muted">
            <Users aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Belum punya tim? Setelah mendaftar, catat sebagai “Sudah daftar” lalu buka{' '}
              <Link href={`/lobi/${event.slug}`} className="font-medium text-ink underline underline-offset-[3px]">
                Lobi lomba ini
              </Link>{' '}
              untuk mencari tim atau partner.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
