import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ClipboardList, FileStack, Plus, Search } from 'lucide-react';
import { AdminNav } from '@/components/admin/admin-nav';
import { PermanentDeleteForm, RestoreEventForm, TakedownForm } from '@/components/admin/event-removal-forms';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { workspacePath } from '@/components/organizer/event-workspace';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { adminMetadata, requireAdmin } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateId } from '@/lib/deadline';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { normalizeUserSearch } from '@/lib/trust-safety';
import { cn } from '@/lib/utils';
import { EVENT_STATUSES, EVENT_TYPE_LABEL, type AdminEventRow, type EventStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const generateMetadata = (): Promise<Metadata> => adminMetadata('Kelola postingan');

const RESULT_LIMIT = 50;

const STATUS: Record<EventStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  APPROVED: { label: 'Tayang', variant: 'success' },
  PENDING: { label: 'Menunggu moderasi', variant: 'warning' },
  REJECTED: { label: 'Diturunkan / ditolak', variant: 'danger' },
  EXPIRED: { label: 'Sudah tutup', variant: 'neutral' },
};

const FILTERS: readonly { status: EventStatus | null; label: string }[] = [
  { status: null, label: 'Semua' },
  { status: 'APPROVED', label: 'Tayang' },
  { status: 'PENDING', label: 'Menunggu' },
  { status: 'REJECTED', label: 'Diturunkan' },
  { status: 'EXPIRED', label: 'Sudah tutup' },
];

function parseStatus(value: string | undefined): EventStatus | null {
  return value && (EVENT_STATUSES as readonly string[]).includes(value) ? (value as EventStatus) : null;
}

function filterHref(q: string, status: EventStatus | null): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const query = params.toString();
  return query ? `/admin/acara?${query}` : '/admin/acara';
}

function EventRow({ event, context }: { event: AdminEventRow; context: { q?: string; status?: string } }) {
  const status = STATUS[event.status];
  const live = event.status === 'APPROVED' || event.status === 'EXPIRED';
  return (
    <li className="flex flex-col gap-2.5 rounded-card border border-line bg-panel p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold leading-snug [overflow-wrap:anywhere]">
          {live ? (
            <Link href={`/events/${event.slug}`} className="underline-offset-[3px] hover:underline">
              {event.title}
            </Link>
          ) : (
            event.title
          )}
        </h3>
        <span className="flex flex-wrap gap-2">
          {event.registrationMode === 'studentfo' && <Badge variant="brand">Formulir StudentFo</Badge>}
          <Badge variant={status.variant}>{status.label}</Badge>
        </span>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-muted">
        <span className="min-w-0 [overflow-wrap:anywhere]">{event.organizer}</span>
        <span>{EVENT_TYPE_LABEL[event.eventType]}</span>
        <span>{event.primaryDeadlineAt ? `Tenggat ${formatDateId(event.primaryDeadlineAt)}` : 'Tanpa tenggat'}</span>
        <span>dibuat {formatDateId(event.createdAt)}</span>
      </p>
      {event.rejectionReason && (
        <p className="rounded-sm bg-danger-soft/50 px-3 py-2 text-[13px] text-ink-soft [overflow-wrap:anywhere]">{event.rejectionReason}</p>
      )}
      <div className="flex flex-wrap items-start gap-2 border-t border-line/70 pt-3">
        {live && (
          <Link href={workspacePath(event.id, 'formulir')} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <ClipboardList aria-hidden /> Formulir & pendaftar
          </Link>
        )}
        {event.status === 'REJECTED' ? (
          <>
            <RestoreEventForm eventId={event.id} title={event.title} context={context} />
            <PermanentDeleteForm eventId={event.id} title={event.title} context={context} />
          </>
        ) : (
          <TakedownForm eventId={event.id} title={event.title} context={context} />
        )}
      </div>
    </li>
  );
}

/**
 * Kelola postingan (ADR-092 #1): satu tempat mencari postingan berstatus apa
 * pun lalu menghapusnya kapan saja — juga sebelum tenggatnya — dengan jalan
 * pulang (Urungkan / Tayangkan lagi) dan hapus permanen dua langkah. Setiap
 * keputusan tercatat di Riwayat moderasi beserta namamu.
 */
export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  await requireAdmin();
  const q = normalizeUserSearch(firstParam(params.q) ?? '');
  const status = parseStatus(firstParam(params.status));
  const undoId = firstParam(params.urungkan);

  const repository = await getEventRepository();
  const [events, reportsOpen, undoEvent] = await Promise.all([
    repository.searchEventsForAdmin({ search: q, status, limit: RESULT_LIMIT }),
    repository.countOpenReports(),
    // "Urungkan" hanya untuk postingan yang memang baru saja diturunkan dan masih diturunkan.
    undoId ? repository.getEventForAdmin(undoId) : Promise.resolve(null),
  ]);
  const context = { q: q || undefined, status: status ?? undefined };

  return (
    <div className="container-page py-8">
      <AdminNav active="postingan" reportsOpen={reportsOpen} />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-3xl">
            <FileStack aria-hidden className="size-7 text-ink-muted" />
            Kelola postingan
          </h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Salah posting? Hapus kapan saja — juga sebelum tenggatnya lewat. Postingan yang dihapus langsung hilang dari katalog dan bisa diurungkan;
            hapus permanen hanya untuk yang sudah diturunkan.
          </p>
        </div>
        <Link href="/admin/acara/baru" className={buttonVariants({ className: 'w-full sm:w-auto' })}>
          <Plus aria-hidden />
          Buat acara StudentFo
        </Link>
      </header>

      <ActionFeedback params={params} className="mb-4" />
      {undoEvent?.status === 'REJECTED' && (
        <div className="fade-in mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-panel-nested px-4 py-3">
          <p className="min-w-0 text-sm text-ink-soft [overflow-wrap:anywhere]">
            “<strong className="font-semibold text-ink">{undoEvent.title}</strong>” sudah turun dari katalog.
          </p>
          <RestoreEventForm eventId={undoEvent.id} title={undoEvent.title} context={context} label="Urungkan" undo />
        </div>
      )}

      <form method="get" role="search" className="mb-4 flex max-w-xl gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="cari-postingan" className="sr-only">
          Cari postingan
        </label>
        <TextInput id="cari-postingan" name="q" type="search" defaultValue={q} placeholder="Judul, penyelenggara, atau slug" className="flex-1" />
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          <Search aria-hidden /> Cari
        </button>
      </form>

      <nav aria-label="Saring status" className="-mx-1 mb-6 flex flex-wrap gap-1">
        {FILTERS.map((filter) => {
          const active = filter.status === status;
          return (
            <Link
              key={filter.label}
              href={filterHref(q, filter.status)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-pill px-4 text-[13.5px] transition-colors duration-150 ease-snap',
                active ? 'bg-brand font-semibold text-on-brand' : 'font-medium text-ink-muted hover:bg-panel-nested hover:text-ink',
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      <h2 className="mb-3 text-sm font-medium text-ink-muted">
        {events.length}
        {events.length === RESULT_LIMIT ? '+' : ''} postingan{q ? ` untuk “${q}”` : ''}
        {status ? ` · ${STATUS[status].label}` : ''}
      </h2>

      {events.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-panel px-6 py-10 text-center text-sm text-ink-muted">
          Tidak ada postingan yang cocok.{' '}
          <Link href="/submit" className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-[3px]">
            Buat postingan baru <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {events.map((event) => (
            <EventRow key={event.id} event={event} context={context} />
          ))}
        </ul>
      )}
    </div>
  );
}
