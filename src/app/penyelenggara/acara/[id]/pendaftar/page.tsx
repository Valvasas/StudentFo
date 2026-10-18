import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, Download, Search, X } from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import {
  EventWorkspaceHeader,
  loadManagedEvent,
  NotManaging,
  workspaceBadges,
  workspacePath,
} from '@/components/organizer/event-workspace';
import { RegistrationListHeader, RegistrationRow } from '@/components/organizer/registration-row';
import { registrationEventClosed } from '@/components/registration/registration-view';
import { buttonVariants } from '@/components/ui/button';
import { requireUser, toEventActor } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { isActiveRegistration } from '@/lib/registration-form';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import type { EventRegistration, RegistrationStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pendaftar',
  robots: { index: false, follow: false },
};

const FILTERS = {
  aktif: { label: 'Pendaftar aktif', match: (status: RegistrationStatus) => isActiveRegistration(status) },
  terkonfirmasi: { label: 'Terkonfirmasi', match: (status: RegistrationStatus) => status === 'CONFIRMED' },
  menunggu: { label: 'Menunggu bayar', match: (status: RegistrationStatus) => status === 'AWAITING_PAYMENT' },
  diperiksa: { label: 'Bukti perlu dicek', match: (status: RegistrationStatus) => status === 'PAYMENT_REVIEW' },
  nonaktif: { label: 'Ditolak & batal', match: (status: RegistrationStatus) => !isActiveRegistration(status) },
} as const;
type FilterKey = keyof typeof FILTERS;
const DEFAULT_FILTER: FilterKey = 'aktif';

function parseFilter(value: string | undefined): FilterKey {
  return value && Object.hasOwn(FILTERS, value) ? (value as FilterKey) : DEFAULT_FILTER;
}

function matchesSearch(registration: EventRegistration, needle: string): boolean {
  if (!needle) return true;
  return [registration.fullName, registration.code, registration.email].some((value) => value.toLowerCase().includes(needle));
}

const number = (value: number) => value.toLocaleString('id-ID');

/**
 * Daftar pendaftar satu acara (ADR-056). Saring status = tautan, cari = form
 * GET — tanpa state klien, setiap tampilan punya URL sendiri (AGENTS §9).
 * Hak baca diperiksa repository; acara yang tidak dikelola = `NotManaging`.
 */
export default async function RegistrantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const basePath = workspacePath(id, 'pendaftar');
  const user = await requireUser(basePath);
  const context = await loadManagedEvent(user, id);
  if (!context) return <NotManaging />;
  const { event } = context;

  const repository = await getEventRepository();
  const [form, registrations, badges] = await Promise.all([
    repository.getRegistrationForm(event.id),
    repository.listEventRegistrations(toEventActor(user), event.id),
    workspaceBadges(user, event.id),
  ]);

  const filter = parseFilter(firstParam(query.status));
  const search = (firstParam(query.q) ?? '').trim().slice(0, 120);
  const needle = search.toLowerCase();
  const hrefFor = (key: FilterKey, q = search) => {
    const params = new URLSearchParams();
    if (key !== DEFAULT_FILTER) params.set('status', key);
    if (q) params.set('q', q);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const selfHref = hrefFor(filter);

  const count = (key: FilterKey) => registrations.filter((registration) => FILTERS[key].match(registration.status)).length;
  const isPaid = (form?.feeAmount ?? 0) > 0 || registrations.some((registration) => registration.feeAmount !== null);
  const visible = registrations.filter((registration) => FILTERS[filter].match(registration.status) && matchesSearch(registration, needle));
  const fields = form?.fields ?? [];

  const openId = firstParam(query.open);
  const openRow = openId ? visible.find((registration) => registration.id === openId) : undefined;
  const stats: FilterKey[] = isPaid ? ['aktif', 'terkonfirmasi', 'menunggu', 'diperiksa'] : ['aktif', 'terkonfirmasi'];
  const inactive = count('nonaktif');

  return (
    <div className="container-page flex flex-col gap-8 py-8">
      <EventWorkspaceHeader event={event} active="pendaftar" badges={badges} />

      {!openRow && <ActionFeedback params={query} className="max-w-2xl" />}

      {registrations.length === 0 ? (
        <EmptyState formState={form ? (form.isOpen && !registrationEventClosed(event) ? 'open' : 'closed') : 'missing'} formHref={workspacePath(event.id, 'formulir')} />
      ) : (
        <>
          <nav aria-label="Saring menurut status" className="flex flex-col gap-3">
            <ul className={cn('grid gap-3', isPaid ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2')}>
              {stats.map((key) => {
                const value = count(key);
                const current = key === filter;
                const attention = key === 'diperiksa' && value > 0;
                return (
                  <li key={key}>
                    <Link
                      href={hrefFor(key)}
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'flex h-full flex-col gap-1 rounded-panel border bg-panel px-4 py-3.5 transition-[border-color,box-shadow] duration-150 ease-snap hover:border-line-strong sm:px-5 sm:py-4',
                        current ? 'border-ink shadow-[inset_0_0_0_1px_var(--color-text-primary)]' : 'border-line',
                      )}
                    >
                      <span className={cn('text-[13px] font-medium', attention ? 'text-caution' : 'text-ink-muted')}>{FILTERS[key].label}</span>
                      <span className="text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums">{number(value)}</span>
                      {key === 'aktif' && form?.capacity != null && (
                        <span className="text-[12.5px] text-ink-muted">dari kuota {number(form.capacity)}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {(inactive > 0 || filter === 'nonaktif') && (
              <Link
                href={filter === 'nonaktif' ? hrefFor(DEFAULT_FILTER) : hrefFor('nonaktif')}
                aria-current={filter === 'nonaktif' ? 'page' : undefined}
                className="flex min-h-11 w-fit items-center text-sm font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink aria-[current=page]:text-ink"
              >
                {filter === 'nonaktif' ? 'Kembali ke pendaftar aktif' : `Ditolak & batal (${number(inactive)})`}
              </Link>
            )}
          </nav>

          {form && (!form.isOpen || registrationEventClosed(event)) && (
            <p className="-mt-4 text-sm text-ink-muted">
              Formulir sedang tidak menerima pendaftar baru.{' '}
              <Link href={workspacePath(event.id, 'formulir')} className="font-medium text-ink underline underline-offset-[3px]">
                Atur formulir
              </Link>
            </p>
          )}

          <section aria-labelledby="daftar-pendaftar" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="daftar-pendaftar" className="text-xl">
                {FILTERS[filter].label}
                <span className="ml-2 text-base font-normal text-ink-muted tabular-nums">{number(visible.length)}</span>
              </h2>
              <a href={`${basePath}/ekspor`} download className={buttonVariants({ variant: 'secondary' })}>
                <Download aria-hidden /> Unduh CSV
              </a>
            </div>

            <form action={basePath} method="get" role="search" className="flex w-full max-w-xl gap-2">
              {filter !== DEFAULT_FILTER && <input type="hidden" name="status" value={filter} />}
              <div className="relative min-w-0 flex-1">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                <input
                  type="search"
                  name="q"
                  defaultValue={search}
                  maxLength={120}
                  placeholder="Nama, kode, atau email"
                  aria-label="Cari pendaftar"
                  className="field-control h-11 w-full rounded-card border border-line-strong/70 bg-panel pl-9 pr-3 text-base text-ink placeholder:text-ink-faint hover:border-line-strong"
                />
              </div>
              <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
                Cari
              </button>
            </form>
            {search && (
              <Link href={hrefFor(filter, '')} className="-mt-2 flex min-h-11 w-fit items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
                <X aria-hidden className="size-4" /> Hapus pencarian “{search}”
              </Link>
            )}

            {visible.length === 0 ? (
              <p className="rounded-panel border border-dashed border-line bg-panel px-6 py-10 text-center text-sm text-ink-muted">
                {search ? 'Tidak ada pendaftar yang cocok dengan pencarian ini.' : 'Tidak ada pendaftar dengan status ini.'}
              </p>
            ) : (
              <div className="overflow-hidden rounded-panel border border-line bg-panel">
                <RegistrationListHeader showFee={isPaid} />
                <ul className="divide-y divide-line">
                  {visible.map((registration) => (
                    <RegistrationRow
                      key={registration.id}
                      registration={registration}
                      fields={fields}
                      eventId={event.id}
                      returnTo={selfHref}
                      showFee={isPaid}
                      open={registration.id === openRow?.id}
                      feedback={registration.id === openRow?.id ? <ActionFeedback params={query} /> : undefined}
                    />
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function EmptyState({ formState, formHref }: { formState: 'missing' | 'closed' | 'open'; formHref: string }) {
  const copy = {
    missing: {
      title: 'Belum ada formulir pendaftaran',
      body: 'Buat formulir supaya peserta bisa mendaftar langsung di StudentFo.',
      action: 'Buat formulir',
    },
    closed: {
      title: 'Formulir belum menerima pendaftar',
      body: 'Aktifkan “Terima pendaftaran lewat StudentFo” di tab Formulir.',
      action: 'Buka tab Formulir',
    },
    open: {
      title: 'Belum ada pendaftar',
      body: 'Pendaftar baru muncul di sini begitu mengirim formulir.',
      action: null,
    },
  }[formState];
  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line bg-panel px-6 py-14 text-center">
      <ClipboardList aria-hidden className="size-9 text-ink-faint" />
      <h2 className="text-lg">{copy.title}</h2>
      <p className="max-w-md text-sm text-ink-muted">{copy.body}</p>
      {copy.action && (
        <Link href={formHref} className={buttonVariants({ className: 'mt-1' })}>
          {copy.action}
        </Link>
      )}
    </div>
  );
}
