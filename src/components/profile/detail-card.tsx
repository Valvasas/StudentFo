import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { controlClass } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/**
 * Kartu bagian Data diri (kanvas Data Diri): mode lihat berupa baris label
 * & nilai, mode ubah berupa form. Dipakai kartu server (form sungguhan) dan
 * kartu demo (klien), jadi sengaja tanpa state.
 */
export function DetailCard({
  id,
  icon,
  title,
  description,
  editing = false,
  actions,
  children,
  delay = 0,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  editing?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        'enter relative flex min-w-0 scroll-mt-24 flex-col rounded-[18px] border bg-panel transition-[border-color,box-shadow] duration-300 [animation-duration:800ms]',
        editing ? 'z-[2] border-brand shadow-[0_18px_40px_rgba(0,0,0,.08)]' : 'border-line',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-[18px] pt-[22px] sm:px-6">
        <div className="flex min-w-0 gap-3.5">
          <span aria-hidden className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-panel-nested">
            {icon}
          </span>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-[-0.015em]">
              {title}
            </h2>
            <p className="text-[13.5px] text-ink-muted">{description}</p>
          </div>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export interface DetailRow {
  readonly label: string;
  readonly value: ReactNode;
  readonly empty?: boolean;
  readonly locked?: boolean;
  readonly wide?: boolean;
}

export function DetailRows({ rows }: { rows: readonly DetailRow[] }) {
  return (
    <dl className="grid gap-x-6 px-5 pb-3 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))] sm:px-6">
      {rows.map((row) => (
        <div key={row.label} className={cn('flex flex-col gap-1 border-t border-line/70 py-3', row.wide && 'col-span-full')}>
          <dt className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
            {row.label}
            {row.locked && (
              <>
                <Lock aria-hidden className="size-3" />
                <span className="sr-only">(tidak bisa diubah di sini)</span>
              </>
            )}
          </dt>
          <dd className={cn('break-words text-[15px] leading-[1.55]', row.empty && 'text-ink-faint')}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const detailButton =
  'press flex h-11 items-center gap-1.5 rounded-sm border border-line-strong/70 bg-panel px-3 text-[13.5px] font-semibold transition-[background-color,box-shadow] duration-150 hover:bg-panel-nested active:pt-0.5 sm:h-[34px] disabled:cursor-not-allowed disabled:opacity-40';
export const detailGhostButton =
  'flex h-11 items-center rounded-sm px-3 text-[13.5px] font-semibold transition-colors duration-150 hover:bg-panel-nested active:bg-line/60 sm:h-[34px]';
export const detailPrimaryButton =
  'flex h-11 items-center rounded-sm bg-brand px-3.5 text-[13.5px] font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover active:pt-0.5 sm:h-[34px]';
export const detailInput = cn(controlClass, 'px-3.5');
export const detailFields = 'enter grid gap-x-5 gap-y-[18px] px-5 pb-6 pt-1 [animation-duration:450ms] [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))] sm:px-6';
