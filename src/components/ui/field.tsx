import {
  cloneElement,
  isValidElement,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
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

/**
 * Kelas isian bersama — dipakai juga `AuthInput`, `PasswordInput`, dan kartu
 * Data diri, supaya semua isian di aplikasi punya tepi, tinggi, dan cincin
 * fokus yang sama (`field-control`, globals.css §9).
 */
export const controlClass = cn(
  'field-control h-11 w-full rounded-card border border-line-strong/70 bg-panel px-3 text-base text-ink',
  'placeholder:text-ink-faint',
  'transition-[border-color,box-shadow,background-color] duration-150 ease-snap hover:border-line-strong',
  'aria-[invalid=true]:border-danger',
  'disabled:cursor-not-allowed disabled:bg-panel-nested disabled:text-ink-muted',
);

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

/**
 * Satu-satunya <select> di aplikasi — jangan menulis ulang kelasnya per halaman.
 * `pr-10` eksplisit: `px-3` dari `controlClass` menimpa padding kanan milik
 * `select-chevron`, dan pada select selebar isinya (`w-auto`) panah jadi
 * menimpa teks pilihan ("07:00 WIB").
 */
export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, 'select-chevron cursor-pointer pr-10', className)} {...props} />;
}

export function TextArea({ className, rows = 4, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(controlClass, 'h-auto py-2.5', className)} {...props} />;
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
  // Tanpa aria-describedby petunjuk hanya terlihat, tidak dibacakan pembaca
  // layar — syarat seperti "berakhir 23.59 WIB" hilang bagi mereka.
  const control =
    hintId && isValidElement<{ 'aria-describedby'?: string }>(children) && !children.props['aria-describedby']
      ? cloneElement(children, { 'aria-describedby': hintId })
      : children;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-semibold text-ink">
        {label}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-[12.5px] leading-snug text-ink-muted">
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
        'fade-in flex items-start gap-2.5 rounded-card border px-3.5 py-3 text-sm leading-relaxed',
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
