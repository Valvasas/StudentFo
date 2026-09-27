import Link from 'next/link';
import { Hash, MessageCircle } from 'lucide-react';
import { DemoUnreadCount } from '@/components/demo/unread-count';
import { cn } from '@/lib/utils';

/** Tab Pesan / Ruang diskusi di kepala kedua halaman (kanvas Pesan & Ruang Diskusi). */
export function InboxTabs({ active, description }: { active: 'pesan' | 'diskusi'; description: string }) {
  const tabs = [
    { key: 'pesan', label: 'Pesan', href: '/messages', icon: MessageCircle },
    { key: 'diskusi', label: 'Ruang diskusi', href: '/discussions', icon: Hash },
  ] as const;
  return (
    <div className="enter flex flex-col gap-3 [animation-duration:800ms]">
      <nav aria-label="Kotak masuk" className="flex gap-1 border-b border-line">
        {tabs.map((tab) => {
          const on = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'flex h-12 items-center gap-2 px-3 text-[15px] transition-colors duration-150',
                on ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-text-primary)]' : 'font-medium text-ink-muted hover:text-ink',
              )}
            >
              <tab.icon aria-hidden className="size-4" />
              {tab.label}
              {tab.key === 'pesan' && (
                <DemoUnreadCount
                  srSuffix="belum dibaca"
                  className="flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-brand px-1.5 text-[11px] font-semibold text-on-brand"
                />
              )}
            </Link>
          );
        })}
      </nav>
      <p className="text-[15px] text-ink-muted">{description}</p>
    </div>
  );
}
