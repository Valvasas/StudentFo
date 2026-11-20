import Link from 'next/link';
import { ArrowRight, DoorOpen, Handshake, Send, UserPlus, Users, type LucideIcon } from 'lucide-react';
import type { Nudge, NudgeIcon } from '@/lib/nudges';
import { cn } from '@/lib/utils';

const ICON: Record<NudgeIcon, LucideIcon> = {
  handshake: Handshake,
  users: Users,
  'user-plus': UserPlus,
  door: DoorOpen,
  share: Send,
};

/**
 * Langkah berikutnya yang dihitung `lib/nudges.ts` (ADR-094). Butir pertama
 * diberi bobot — satu ajakan utama, sisanya pilihan — supaya tidak terasa
 * seperti dinding iklan.
 */
export function NudgeCards({ nudges, heading, className }: { nudges: readonly Nudge[]; heading: string; className?: string }) {
  if (nudges.length === 0) return null;
  const headingId = `langkah-${nudges[0]!.key}`;
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-3', className)}>
      <h2 id={headingId} className="text-[18px] font-bold tracking-[-0.02em]">
        {heading}
      </h2>
      <ul className="flex flex-col gap-2.5">
        {nudges.map((nudge, index) => {
          const Icon = ICON[nudge.icon];
          const primary = index === 0;
          return (
            <li
              key={nudge.key}
              className={cn(
                'flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center',
                primary ? 'border-brand/40 bg-info-soft' : 'border-line bg-panel',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-pill',
                  primary ? 'bg-brand text-on-brand' : 'bg-panel-nested text-ink-muted',
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold leading-snug">{nudge.title}</span>
                <span className="text-[13.5px] leading-snug text-ink-soft">{nudge.body}</span>
              </span>
              <Link
                href={nudge.href}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-card px-4 text-sm font-semibold transition-colors duration-150 ease-snap',
                  primary ? 'bg-brand text-on-brand hover:bg-brand-hover' : 'border border-line-strong/70 bg-panel hover:border-brand',
                )}
              >
                {nudge.cta}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
