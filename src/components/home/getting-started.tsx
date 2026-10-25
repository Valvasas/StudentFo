import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { hideGettingStartedAction } from '@/app/actions';
import { cn } from '@/lib/utils';

export interface GettingStartedStep {
  readonly label: string;
  readonly hint: string;
  readonly href: string;
  readonly done: boolean;
}

/**
 * "Mulai di sini" (ADR-061): beberapa langkah pertama yang membuat StudentFo
 * bekerja untuk pengguna baru, dicentang dari keadaan akun yang sebenarnya —
 * bukan klik di panduan ini. Hilang sendiri saat semuanya selesai, atau
 * disembunyikan (per akun) lewat tombolnya.
 */
export function GettingStarted({ steps, className }: { steps: readonly GettingStartedStep[]; className?: string }) {
  const done = steps.filter((step) => step.done).length;
  return (
    <section aria-labelledby="mulai-di-sini" className={cn('rounded-panel border border-line bg-panel p-5 sm:p-6', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="mulai-di-sini" className="text-xl">
            Mulai di sini
          </h2>
          <p className="text-sm text-ink-muted">
            <span className="font-semibold tabular-nums text-ink">
              {done} dari {steps.length}
            </span>{' '}
            selesai — supaya rekomendasi dan pengingat benar-benar untukmu.
          </p>
        </div>
        <form action={hideGettingStartedAction} className="shrink-0">
          <button
            type="submit"
            aria-label="Sembunyikan panduan Mulai di sini"
            className="flex min-h-11 items-center rounded-sm px-3 text-sm font-medium text-ink-muted transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
          >
            Sembunyikan
          </button>
        </form>
      </div>
      <div aria-hidden className="mt-4 h-1.5 overflow-hidden rounded-pill bg-line">
        <div className="h-full rounded-pill bg-brand" style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.href} className="min-w-0">
            <Link
              href={step.href}
              className={cn(
                'group flex h-full min-h-11 items-start gap-3 rounded-card border p-3.5 transition-colors duration-150 ease-snap',
                step.done ? 'border-transparent bg-panel-nested' : 'border-line hover:border-line-strong hover:bg-panel-nested',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-pill font-mono text-xs font-bold',
                  step.done ? 'bg-success-soft text-success' : 'bg-brand text-on-brand',
                )}
              >
                {step.done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn('font-semibold', step.done && 'text-ink-soft line-through decoration-line-strong')}>
                  {step.label}
                  {step.done && <span className="sr-only"> (selesai)</span>}
                </span>
                <span className="text-[13px] leading-snug text-ink-muted">{step.hint}</span>
              </span>
              {!step.done && (
                <ArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-snap group-hover:translate-x-0.5" />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
