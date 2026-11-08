import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, ShieldCheck, Users } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { buttonVariants } from '@/components/ui/button';
import { Field, SelectInput, TextInput } from '@/components/ui/field';
import { ChoiceGroup } from '@/components/ui/form-step';
import { SubmitButton } from '@/components/ui/submit-button';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { asksPlan, OUTBOUND_LIMITS, PROVINCES } from '@/lib/outbound-survey';
import { hasAnsweredOutboundSurvey } from '@/lib/outbound-survey-cookie';
import { sectionTitle } from '@/lib/page-title';
import { registrationDestination } from '@/lib/registration-destination';
import type { RawSearchParams } from '@/lib/search-params';
import { HONEYPOT_FIELD } from '@/lib/submission-schema';
import { safeHostname } from '@/lib/utils';
import {
  EDUCATION_LEVEL_LABEL,
  EDUCATION_LEVELS,
  OUTBOUND_PLAN_LABEL,
  OUTBOUND_PLANS,
  OUTBOUND_SOURCE_LABEL,
  OUTBOUND_SOURCES,
} from '@/types/domain';
import { submitOutboundSurveyAction } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const event = await (await getEventRepository()).getEventBySlug((await params).slug);
  return {
    title: event ? sectionTitle('Sebelum mendaftar', event.title) : 'Sebelum mendaftar',
    robots: { index: false, follow: false },
  };
}

/**
 * Pendataan kinerja postingan (ADR-070): satu layar singkat antara "Daftar"
 * dan tautan pendaftaran resmi. Hanya untuk tujuan LUAR — acara berformulir
 * StudentFo sudah punya datanya sendiri — dan hanya sekali per acara per
 * peramban. Isian wajib cuma tiga (dua untuk selain lomba), jenjang terisi
 * dari profil; tujuannya dijelaskan terang di atas form, bukan di catatan kaki.
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
  const destination = await registrationDestination(event, repository);
  if (!destination) redirect(eventPath);
  if (destination.kind === 'internal' || (await hasAnsweredOutboundSurvey(event.id))) redirect(`${eventPath}/daftar`);

  const user = await getSessionUser();
  const withPlan = asksPlan(event.eventType);
  const host = safeHostname(destination.url);

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
            Bantu StudentFo mengukur postingan ini — {withPlan ? 'tiga' : 'dua'} pertanyaan wajib, sekitar 15 detik. Jawabanmu{' '}
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

          <ChoiceGroup legend="Jenjang pendidikanmu sekarang" hint={user?.educationLevel ? 'terisi dari profilmu' : undefined}>
            <div className="flex flex-wrap gap-2">
              {EDUCATION_LEVELS.map((level) => (
                <label key={level} className="choice">
                  <input type="radio" name="educationLevel" value={level} required defaultChecked={user?.educationLevel === level} className="check" />
                  {EDUCATION_LEVEL_LABEL[level]}
                </label>
              ))}
            </div>
          </ChoiceGroup>

          <ChoiceGroup legend="Dari mana kamu tahu info ini?">
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              {OUTBOUND_SOURCES.map((source) => (
                <label key={source} className="choice">
                  <input type="radio" name="source" value={source} required className="check" />
                  {OUTBOUND_SOURCE_LABEL[source]}
                </label>
              ))}
            </div>
          </ChoiceGroup>

          {withPlan && (
            <ChoiceGroup legend="Rencanamu untuk lomba ini?">
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                {OUTBOUND_PLANS.map((plan) => (
                  <label key={plan} className="choice">
                    <input type="radio" name="plan" value={plan} required className="check" />
                    {OUTBOUND_PLAN_LABEL[plan]}
                  </label>
                ))}
              </div>
            </ChoiceGroup>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="province" label="Provinsi domisili (opsional)">
              <SelectInput id="province" name="province" defaultValue="">
                <option value="">Tidak ingin menyebut</option>
                {PROVINCES.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="institution" label="Asal sekolah / kampus (opsional)">
              <TextInput
                id="institution"
                name="institution"
                minLength={OUTBOUND_LIMITS.institutionMin}
                maxLength={OUTBOUND_LIMITS.institutionMax}
                autoComplete="organization"
                placeholder="Mis. SMAN 1 Bandung"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-5">
            <SubmitButton pendingLabel="Membuka pendaftaran…" className={buttonVariants({ size: 'lg', className: 'w-full sm:w-auto sm:self-start' })}>
              Lanjut ke pendaftaran resmi <ArrowUpRight aria-hidden />
            </SubmitButton>
            {host && <p className="text-[12.5px] text-ink-muted">Setelah ini kamu diarahkan ke {host}.</p>}
          </div>
        </form>

        {withPlan && (
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
