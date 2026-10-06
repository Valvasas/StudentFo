import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, BarChart3, ClipboardList, Gauge, Users } from 'lucide-react';
import { EventTypeIcon } from '@/components/event/event-type-icon';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { daysUntil, formatDateTimeId } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, type EventSummary } from '@/types/domain';

export type StudioTab = 'analitik' | 'pendaftaran' | 'pendaftar' | 'formulir';

/**
 * Kepala studio satu acara (ADR-055): judul + tab yang sama di empat
 * halamannya, supaya analitik halaman, performa pendaftaran, pendaftar, dan
 * formulir terasa satu ruang kerja — bukan empat halaman lepas. Tab adalah
 * tautan biasa (rute sendiri), jadi tiap layar punya URL yang bisa dibagikan
 * ke rekan panitia dan tombol back bekerja.
 */
export function StudioEventHeader({
  event,
  active,
  pending,
}: {
  event: Pick<EventSummary, 'id' | 'slug' | 'title' | 'eventType' | 'status' | 'primaryDeadlineAt'>;
  active: StudioTab;
  /** Pendaftar yang menunggu keputusan — lencana di tab Pendaftar. */
  pending?: number;
}) {
  const base = `/penyelenggara/acara/${event.id}`;
  const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt) : null;
  const closed = event.status === 'EXPIRED' || (days !== null && days < 0);
  const tabs: { key: StudioTab; href: string; label: string; icon: typeof BarChart3; badge?: number }[] = [
    { key: 'analitik', href: base, label: 'Analitik halaman', icon: BarChart3 },
    { key: 'pendaftaran', href: `${base}/pendaftaran`, label: 'Performa pendaftaran', icon: Gauge },
    { key: 'pendaftar', href: `${base}/pendaftar`, label: 'Pendaftar', icon: Users, badge: pending },
    { key: 'formulir', href: `${base}/pendaftaran/formulir`, label: 'Formulir', icon: ClipboardList },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link href="/penyelenggara" className="inline-flex min-h-11 items-center gap-1 self-start text-sm text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Studio penyelenggara
      </Link>
      <header className="enter flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 max-w-3xl flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span className="flex items-center gap-1.5 font-semibold text-ink">
              <EventTypeIcon type={event.eventType} className="size-4" />
              {EVENT_TYPE_LABEL[event.eventType]}
            </span>
            <Badge variant={closed ? 'neutral' : 'success'}>{closed ? 'Pendaftaran ditutup' : 'Tayang'}</Badge>
            {event.primaryDeadlineAt && <span>Tutup {formatDateTimeId(event.primaryDeadlineAt)}</span>}
          </span>
          <h1 className="text-[clamp(26px,3.6vw,38px)] leading-tight [text-wrap:balance]">{event.title}</h1>
        </div>
        <Link href={`/events/${event.slug}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          Lihat halaman publik <ArrowUpRight aria-hidden />
        </Link>
      </header>
      <nav aria-label="Studio acara" className="relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {tabs.map((tab) => {
            const current = tab.key === active;
            return (
              <li key={tab.key}>
                <Link
                  href={tab.href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'flex h-12 items-center gap-2 whitespace-nowrap px-3.5 text-[14px] transition-colors duration-150 ease-snap first:pl-0',
                    current ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-text-primary)]' : 'font-medium text-ink-muted hover:text-ink',
                  )}
                >
                  <tab.icon aria-hidden className="size-4" />
                  {tab.label}
                  {tab.badge ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-highlight px-1.5 text-[11.5px] font-bold text-on-highlight">
                      {tab.badge}
                      <span className="sr-only"> menunggu keputusan</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
