import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { controlClass } from '@/components/ui/field';
import { LogoMark } from '@/components/ui/illustrations';
import { cn } from '@/lib/utils';

/** Isian form akun: label 13.5px di atas, isian 44px. */
export function AuthField({ id, label, aside, hint, children }: { id: string; label: string; aside?: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13.5px] font-semibold">
          {label}
        </label>
        {aside}
      </span>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-[12.5px] leading-snug text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function AuthInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, className)} />;
}

export function AuthDivider({ label = 'atau dengan email' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-[12.5px] text-ink-muted">
      <span aria-hidden className="h-px flex-1 bg-line" />
      {label}
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <header className="flex flex-col items-center gap-4 text-center">
      <LogoMark className="size-10 -rotate-3 text-ink" />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] leading-[1.15] tracking-[-0.03em]">{title}</h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>
      </div>
    </header>
  );
}

/** "Belum punya akun? Daftar" — pengalih antarhalaman akun, tautan biasa supaya tiap mode punya URL sendiri. */
export function AuthSwitch({ prompt, href, label }: { prompt: string; href: string; label: string }) {
  return (
    <p className="text-center text-sm text-ink-muted">
      {prompt}{' '}
      <Link href={href} className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold text-ink underline-offset-[3px] hover:underline">
        {label}
      </Link>
    </p>
  );
}

/** Pertahankan `next` di tautan antarhalaman akun tanpa mengotori URL bawaan. */
export function withNext(path: string, next: string): string {
  return next === '/' ? path : `${path}?next=${encodeURIComponent(next)}`;
}

/**
 * Pintu ke halaman akun untuk peran lain (peserta ↔ penyelenggara, ADR-063).
 * Dipisah garis dari form supaya tidak terbaca sebagai langkah berikutnya.
 */
export function AuthAlternate({ prompt, href, label }: { prompt: string; href: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 border-t border-line pt-4 text-center text-[13.5px] text-ink-muted">
      <span>{prompt}</span>
      <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-ink underline-offset-[3px] hover:underline">
        {label}
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}
