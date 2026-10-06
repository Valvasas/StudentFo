import type { ReactNode } from 'react';
import { IllustrationStage } from '@/components/ui/feature-hero';
import type { Tint } from '@/lib/tint';

/**
 * Layar "berhenti" alur pendaftaran (ADR-055): tutup, penuh, ditolak,
 * belum masuk. Satu ilustrasi + satu kalimat yang menjelaskan KENAPA +
 * langkah berikutnya yang masuk akal — bukan halaman error generik.
 */
export function RegistrationState({
  tint,
  illustration,
  title,
  children,
  actions,
}: {
  tint: Tint;
  illustration: ReactNode;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="grid items-center gap-8 rounded-[28px] border border-line bg-panel p-6 sm:p-9 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)] md:gap-12">
      <div className="enter flex flex-col gap-4">
        <h2 className="text-[clamp(24px,3vw,32px)] font-bold leading-[1.1] tracking-[-0.03em]">{title}</h2>
        <div className="flex max-w-[56ch] flex-col gap-3 text-[15px] leading-relaxed text-ink-muted">{children}</div>
        {actions && <div className="mt-2 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      <IllustrationStage tint={tint} className="enter order-first min-h-[200px] [animation-delay:120ms] md:order-none">
        {illustration}
      </IllustrationStage>
    </section>
  );
}
