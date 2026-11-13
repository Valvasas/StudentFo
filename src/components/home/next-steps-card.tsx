import Link from 'next/link';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { hideNextStepsAction } from '@/app/notifications/actions';
import { buttonVariants } from '@/components/ui/button';
import type { NextStepsSummary } from '@/lib/next-steps';
import { cn } from '@/lib/utils';

/**
 * "Langkah awalmu" di beranda peserta (ADR-086): daftar ajakan yang dihitung
 * dari keadaan akun. Tidak dirender bila semua langkah selesai — kartu
 * "6 dari 6" yang menetap hanya memakan tempat di atas hal yang mendesak.
 * "Sembunyikan" = form biasa (cookie preferensi), jalan tanpa JavaScript.
 */
export function NextStepsCard({ summary, returnTo }: { summary: NextStepsSummary; returnTo: string }) {
  if (!summary.next) return null;
  const total = summary.steps.length;
  return (
    <section aria-labelledby="langkah-awal" className="enter mt-8 rounded-panel border border-line bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="langkah-awal" className="flex items-center gap-2 text-xl">
            <Sparkles aria-hidden className="size-5 shrink-0" />
            Langkah awalmu
          </h2>
          <p className="text-sm text-ink-muted">
            {summary.done} dari {total} selesai. Tiap langkah membuat rekomendasi, pengingat, dan calon rekan timmu lebih pas.
          </p>
        </div>
        <form action={hideNextStepsAction}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className={buttonVariants({ variant: 'ghost' })}>
            Sembunyikan
          </button>
        </form>
      </div>

      <div
        role="progressbar"
        aria-label="Kemajuan langkah awal"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={summary.done}
        aria-valuetext={`${summary.done} dari ${total} langkah selesai`}
        className="mt-4 h-2 overflow-hidden rounded-pill bg-panel-nested"
      >
        <span className="grow-x block h-full rounded-pill bg-brand" style={{ width: `${Math.round((summary.done / total) * 100)}%` }} />
      </div>

      <ol className="mt-4 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
        {summary.steps.map((step) => {
          const isNext = step.key === summary.next?.key;
          return (
            <li key={step.key} className="min-w-0">
              {step.done ? (
                <div className="flex h-full min-h-11 items-start gap-3 rounded-card border border-line/70 px-3.5 py-3">
                  <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill border border-success-line bg-success-soft text-success">
                    <Check className="size-3.5" />
                  </span>
                  <span className="text-[14.5px] text-ink-muted">
                    {step.title}
                    <span className="sr-only"> — selesai</span>
                  </span>
                </div>
              ) : (
                <Link
                  href={step.href}
                  className={cn(
                    'group flex h-full min-h-11 items-start gap-3 rounded-card border px-3.5 py-3 transition-colors duration-150 ease-snap',
                    isNext ? 'border-line-strong bg-tint-sun hover:border-ink' : 'border-line hover:border-line-strong hover:bg-panel-nested',
                  )}
                >
                  <span aria-hidden className="mt-0.5 size-5 shrink-0 rounded-pill border-2 border-dashed border-ink-muted" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[14.5px] font-semibold">
                      {step.title}
                      {isNext && <span className="sr-only"> — langkah berikutnya</span>}
                    </span>
                    <span className="text-[13px] leading-snug text-ink-soft">{step.body}</span>
                  </span>
                  <ArrowRight aria-hidden className="mt-1 size-4 shrink-0 transition-transform duration-150 ease-snap group-hover:translate-x-0.5" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
