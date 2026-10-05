import Link from 'next/link';
import { Hash, MessageCircle } from 'lucide-react';
import { DemoUnreadCount } from '@/components/demo/unread-count';
import { HandNote } from '@/components/ui/sketch';
import { cn } from '@/lib/utils';

/** Tab Pesan / Ruang diskusi di kepala kedua halaman (kanvas Pesan & Ruang Diskusi). */
export function InboxTabs({ active, description }: { active: 'pesan' | 'diskusi'; description: string }) {
  const tabs = [
    { key: 'pesan', label: 'Pesan', href: '/messages', icon: MessageCircle },
    { key: 'diskusi', label: 'Ruang diskusi', href: '/discussions', icon: Hash },
  ] as const;
  return (
    <div className="enter flex flex-col gap-4 [animation-duration:800ms] sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <HandNote className="text-[20px] text-ink-muted">kotak masuk</HandNote>
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink-muted">{description}</p>
      </div>
      <nav aria-label="Kotak masuk" className="relative">
        <ul className="flex w-fit gap-1 rounded-pill border border-line bg-panel p-1.5">
          {tabs.map((tab) => {
            const on = tab.key === active;
            return (
              <li key={tab.key}>
                <Link
                  href={tab.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex h-11 items-center gap-2 rounded-pill px-4 text-[14.5px] transition-colors duration-200 ease-snap',
                    on ? 'bg-brand font-semibold text-on-brand' : 'font-medium text-ink-muted hover:bg-panel-nested hover:text-ink',
                  )}
                >
                  <tab.icon aria-hidden className="size-4" />
                  {tab.label}
                  {tab.key === 'pesan' && (
                    <DemoUnreadCount
                      srSuffix="belum dibaca"
                      className={cn(
                        'flex h-5 min-w-5 items-center justify-center rounded-pill px-1.5 text-[11px] font-semibold',
                        on ? 'bg-on-brand text-brand' : 'bg-highlight text-on-highlight',
                      )}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
