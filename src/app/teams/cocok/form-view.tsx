import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { SeekerForm } from '@/components/match/seeker-form';
import { ScrollToTop } from '@/components/registration/scroll-to-top';
import { IllustrationStage } from '@/components/ui/feature-hero';
import { DeckDealSketch } from '@/components/ui/feature-illustrations';
import { SparkleDoodle } from '@/components/ui/illustrations';
import { parseActionErrorCode, parseActionNoticeCode } from '@/lib/action-feedback';
import { parseSeekerFields } from '@/lib/matchmaking-schema';
import type { MatchViewProps } from './shared';

const STEPS = ['Isi kartu', 'Radar mengocok', 'Geser tumpukan'] as const;

/** Kartu belum ada, tertutup, atau sedang diubah (`?ubah=1`): pembuat kartu pemain. */
export function FormView({ user, params, profile }: MatchViewProps) {
  const person = { id: user.id, name: user.fullName, major: user.major, level: user.educationLevel };
  const errorCode = parseActionErrorCode(params.error);
  const hasFeedback = Boolean(parseActionNoticeCode(params.notice) || errorCode);

  return (
    <div className="container-page pb-24 pt-5 sm:pt-12">
      <Link href="/teams" className="mb-3 flex min-h-11 w-fit items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink sm:mb-4">
        <ArrowLeft aria-hidden className="size-4" /> Cari tim
      </Link>

      <header className="grid grid-cols-1 items-center gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="enter flex min-w-0 flex-col gap-4 [animation-duration:900ms] sm:gap-5">
          <p className="-mb-1 flex items-center gap-2 text-[13.5px] font-medium text-ink-muted">
            Pencocokan tim
            <SparkleDoodle className="size-6 lg:hidden" />
          </p>
          <h1 className="text-[clamp(32px,6vw,54px)] leading-[1.02] tracking-[-0.035em]">
            Cocokkan tim <span className="marker">otomatis</span>
          </h1>
          <p className="max-w-[50ch] text-[15px] leading-relaxed text-ink-muted sm:text-[16.5px]">
            Bikin kartu pemainmu sekali: tempel keahlianmu, tandai yang kamu cari, lalu radar mengocok tumpukan orang yang melengkapi timmu.
          </p>
          <ol className="step-strip mt-1 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[13px] font-medium text-ink sm:text-sm">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-brand font-mono text-[12px] font-medium text-on-brand">
                  {index + 1}
                </span>
                <span>
                  <span className="sr-only">Langkah {index + 1}: </span>
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="enter hidden min-w-0 [animation-delay:140ms] [animation-duration:1000ms] lg:block">
          <IllustrationStage tint="sun" className="pb-3 pt-7">
            <DeckDealSketch className="max-w-[300px]" />
          </IllustrationStage>
        </div>
      </header>

      <ActionFeedback params={params} className="mt-8 max-w-2xl" />
      {hasFeedback && <ScrollToTop key={randomUUID()} />}

      <div className="mt-6 sm:mt-10">
        {/* Kunci baru tiap kedatangan dengan kabar: SeekerForm dipasang ulang dari profil tersimpan,
            sehingga pemulihan draf (setelah simpan gagal) bekerja dari keadaan yang pasti, bukan dari state sisa. */}
        <SeekerForm
          key={hasFeedback ? randomUUID() : 'seeker'}
          person={person}
          initial={profile}
          invalidFields={parseSeekerFields(params.fields)}
          restoreDraft={errorCode !== null}
        />
      </div>
    </div>
  );
}
