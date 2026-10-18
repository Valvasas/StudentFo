import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Lock } from 'lucide-react';
import { registrationEventClosed } from '@/components/registration/registration-view';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ScrollRail } from '@/components/ui/scroll-rail';
import { toEventActor, type AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import type { EventDetail, ManagedEvent } from '@/types/domain';

export const WORKSPACE_TABS = [
  { key: 'ringkasan', label: 'Ringkasan', suffix: '' },
  { key: 'formulir', label: 'Formulir', suffix: '/formulir' },
  { key: 'pendaftar', label: 'Pendaftar', suffix: '/pendaftar' },
  { key: 'galeri', label: 'Galeri', suffix: '/galeri' },
] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]['key'];

export function workspacePath(eventId: string, tab: WorkspaceTab = 'ringkasan'): string {
  const suffix = WORKSPACE_TABS.find((item) => item.key === tab)?.suffix ?? '';
  return `/penyelenggara/acara/${encodeURIComponent(eventId)}${suffix}`;
}

export interface ManagedEventContext {
  readonly managed: ManagedEvent;
  readonly event: EventDetail;
}

/**
 * Acara kelolaan pengguna ini, atau null. Halaman studio TIDAK memakai id
 * dari URL untuk membaca acara sebelum hak kelolanya terbukti — id asing
 * berakhir di `NotManaging`, sama dengan acara yang tidak ada.
 */
export async function loadManagedEvent(user: AuthUser, eventId: string): Promise<ManagedEventContext | null> {
  const repository = await getEventRepository();
  const managed = (await repository.listManagedEvents(user.id)).find((entry) => entry.event.id === eventId);
  if (!managed) return null;
  const event = await repository.getEventBySlug(managed.event.slug);
  return event ? { managed, event } : null;
}

/** Angka di tab: bukti bayar yang menunggu diperiksa. Gagal dimuat = tanpa angka, bukan halaman error. */
export async function workspaceBadges(user: AuthUser, eventId: string): Promise<Partial<Record<WorkspaceTab, number>>> {
  try {
    const [stats] = await (await getEventRepository()).listRegistrationStats(toEventActor(user), [eventId]);
    return stats?.paymentReview ? { pendaftar: stats.paymentReview } : {};
  } catch (error) {
    console.error('[studio] ringkasan pendaftar gagal dimuat:', error);
    return {};
  }
}

/**
 * Kepala ruang kerja satu acara: judul, status, dan tab tugas (ADR-056).
 * Tab = tautan biasa (URL per tugas, tombol Kembali bekerja, tanpa JS).
 */
export function EventWorkspaceHeader({
  event,
  active,
  badges = {},
}: {
  event: EventDetail;
  active: WorkspaceTab;
  /** Angka kecil di tab, mis. bukti bayar yang menunggu diperiksa. */
  badges?: Partial<Record<WorkspaceTab, number>>;
}) {
  const closed = registrationEventClosed(event);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/penyelenggara" className="inline-flex min-h-11 items-center gap-1 self-start text-sm text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Studio
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 max-w-3xl flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Badge variant={closed ? 'neutral' : 'success'}>{closed ? 'Pendaftaran ditutup' : 'Tayang'}</Badge>
            {event.primaryDeadlineAt && <span>Tutup {formatDateTimeId(event.primaryDeadlineAt)}</span>}
          </span>
          <h1 className="text-[clamp(24px,3.4vw,34px)] leading-tight">{event.title}</h1>
        </div>
        <Link href={`/events/${event.slug}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          Halaman publik <ArrowUpRight aria-hidden />
        </Link>
      </header>
      <ScrollRail
        aria-label="Bagian acara"
        className="relative -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
      >
        {WORKSPACE_TABS.map((tab) => {
          const current = tab.key === active;
          const badge = badges[tab.key];
          return (
            <Link
              key={tab.key}
              href={workspacePath(event.id, tab.key)}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex h-12 shrink-0 items-center gap-2 whitespace-nowrap px-3.5 text-[14.5px] transition-colors duration-150 ease-snap first:pl-0',
                current ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-text-primary)]' : 'font-medium text-ink-muted hover:text-ink',
              )}
            >
              {tab.label}
              {badge ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-highlight px-1.5 text-[11.5px] font-semibold text-on-highlight">
                  {badge}
                  <span className="sr-only"> perlu ditindaklanjuti</span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </ScrollRail>
    </div>
  );
}

export function NotManaging() {
  return (
    <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
      <Lock aria-hidden className="size-10 text-ink-faint" />
      <h1 className="text-2xl">Acara ini tidak ada di dasbormu</h1>
      <p className="max-w-md text-ink-muted">
        Halaman ini hanya untuk penyelenggara terverifikasi yang mengelola acaranya. Klaim acara dari tab Penyelenggara di
        halaman acara.
      </p>
      <Link href="/penyelenggara" className={buttonVariants()}>
        Ke studio penyelenggara
      </Link>
    </div>
  );
}
