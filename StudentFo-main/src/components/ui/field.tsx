import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Primitif isian form.
 *
 * `text-base` (16px) di input bukan pilihan tipografi: Safari iOS
 * memperbesar seluruh halaman secara paksa ketika fokus masuk ke input
 * berukuran huruf di bawah 16px, dan zoom itu tidak pernah dikembalikan.
 * Hasilnya form yang tiba-tiba terpotong di tengah pengisian.
 *
 * Tinggi 44px (`h-11`) mengikuti target sentuh minimum WCAG 2.5.5, sama
 * seperti Button.
 */

const controlClass = [
  'h-11 w-full rounded-card border border-line bg-panel px-3 text-base',
  'text-ink placeholder:text-ink-faint',
  'transition-colors duration-150 ease-snap hover:border-line-strong',
  'focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  'disabled:cursor-not-allowed disabled:bg-panel-nested disabled:text-ink-muted',
];

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, 'pr-8', className)} {...props} />;
}

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  /** Syarat pengisian ditulis DI DEPAN, bukan baru muncul setelah gagal. */
  hint?: ReactNode;
  children: ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormAlert({ tone, children }: { tone: 'error' | 'notice'; children: ReactNode }) {
  const isError = tone === 'error';
  const Icon = isError ? AlertTriangle : CheckCircle2;

  return (
    <div
      // role="alert" memaksa screen reader membacakan segera; untuk kabar
      // baik itu berlebihan dan memotong pembacaan yang sedang berjalan.
      role={isError ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-card border p-3 text-sm',
        isError
          ? 'border-danger-line bg-danger-soft text-danger'
          : 'border-success-line bg-success-soft text-success',
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
