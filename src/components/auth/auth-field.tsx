import type { InputHTMLAttributes, ReactNode } from 'react';

/** Isian form akun sesuai kanvas: label 13.5px di atas, isian 44px. */
export function AuthField({ id, label, aside, hint, children }: { id: string; label: string; aside?: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13.5px] font-medium">
          {label}
        </label>
        {aside}
      </span>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-[12.5px] text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function AuthInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-11 w-full rounded-sm border border-line-strong/70 bg-panel px-3 text-base text-ink transition-colors duration-150 ease-snap placeholder:text-ink-faint hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    />
  );
}

export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-[12.5px] text-ink-muted">
      <span aria-hidden className="h-px flex-1 bg-line" />
      atau dengan email
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-[32px] leading-[1.1] tracking-[-0.035em]">{title}</h1>
      <p className="text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>
    </header>
  );
}
