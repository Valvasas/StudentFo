import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegistrationStep } from './registration-view';

const STATE_TEXT = { done: 'selesai', current: 'sekarang', todo: 'belum' } as const;

/**
 * Langkah pendaftaran — status dibawa ikon + teks (sr), bukan warna saja.
 * Empat langkah jadi 2×2 di bawah `sm`: di 320px satu kolom hanya ~53px dan
 * "Terkonfirmasi" menembus tepi kartu. Garis penghubung di ujung baris
 * disembunyikan supaya tidak menunjuk ke ruang kosong.
 */
export function RegistrationSteps({ steps, className }: { steps: readonly RegistrationStep[]; className?: string }) {
  const wrapsBelowSm = steps.length > 2;
  return (
    <ol aria-label="Tahap pendaftaran" className={cn('grid grid-cols-2 gap-x-2 gap-y-4', wrapsBelowSm && 'sm:grid-cols-4', className)}>
      {steps.map((step, index) => (
        <li key={step.label} aria-current={step.state === 'current' ? 'step' : undefined} className="flex min-w-0 flex-col gap-2">
          <span aria-hidden className="flex items-center gap-1.5">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-pill border-[1.5px] text-[11.5px] font-semibold',
                step.state === 'done' && 'border-brand bg-brand text-on-brand',
                step.state === 'current' && 'border-brand bg-panel text-ink',
                step.state === 'todo' && 'border-line-strong/70 bg-panel text-ink-muted',
              )}
            >
              {step.state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
            {index < steps.length - 1 && (
              <span
                className={cn(
                  'h-[1.5px] min-w-2 flex-1 rounded-pill',
                  step.state === 'done' ? 'bg-brand' : 'bg-line',
                  wrapsBelowSm && index % 2 === 1 && 'max-sm:hidden',
                )}
              />
            )}
          </span>
          <span
            className={cn(
              'text-[12.5px] leading-tight sm:text-[13.5px]',
              step.state === 'todo' ? 'text-ink-muted' : 'font-semibold text-ink',
            )}
          >
            {step.label}
            <span className="sr-only"> ({STATE_TEXT[step.state]})</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
