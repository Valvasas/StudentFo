import Link from 'next/link';
import { ArrowRight, BadgeCheck, CalendarClock, Clock, FileText, type LucideIcon, Plus, ReceiptText } from 'lucide-react';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { loadMyRegistrations } from '@/components/home/account-role';
import { WORKSPACE_TABS, workspacePath } from '@/components/organizer/event-workspace';
import { registrationEventClosed } from '@/components/registration/registration-view';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { toEventActor, type AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysUntil, formatDateId, formatShortDateId } from '@/lib/deadline';
import { withFallback } from '@/lib/fallback';
import { firstNameOf, greetingFor, todayLabel } from '@/lib/greeting';
import { ORGANIZER_STATUS_LABEL } from '@/lib/organizer';
import type { RawSearchParams } from '@/lib/search-params';
import type { EventSummary, OrganizerProfile, RegistrationStats } from '@/types/domain';

const TASK_LIMIT = 6;
const EVENT_LIMIT = 5;
const DEADLINE_WINDOW_DAYS = 7;

interface Task {
  readonly key: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly detail: string;
}

/**
 * Beranda penyelenggara (ADR-056): ringkasan + tindakan, bukan salinan studio.
 * Tujuan utamanya mengelola acara, pendaftar, dan verifikasi pembayaran —
 * jadi yang tampil hanya angka yang berubah setiap hari dan pekerjaan yang
 * menunggu; pengelolaan lengkapnya tetap di /penyelenggara.
 */
export async function OrganizerHome({ user, organizer, params }: { user: AuthUser; organizer: OrganizerProfile; params: RawSearchParams }) {
  const now = new Date();
  const verified = organizer.status === 'VERIFIED';
  const unpaid = (await loadMyRegistrations(user.id)).filter((registration) => registration.status === 'AWAITING_PAYMENT').length;

  return (
    <div className="container-page pb-12 pt-8 sm:pt-12">
      <div className="mb-6 max-w-2xl empty:hidden">
        <AuthFeedback params={params} />
      </div>
      <header className="enter flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-sm text-ink-muted">{todayLabel(now)}</p>
          <h1 className="text-[clamp(30px,4.6vw,44px)] leading-[1.05]">
            {greetingFor(now)}, {firstNameOf(user.fullName)}.
          </h1>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ink-soft">
            <span className="min-w-0 truncate font-medium">{organizer.orgName}</span>
            <Badge variant={verified ? 'success' : 'warning'}>
              {verified ? <BadgeCheck aria-hidden className="size-3.5" /> : <Clock aria-hidden className="size-3.5" />}
              {ORGANIZER_STATUS_LABEL[organizer.status]}
            </Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/submit" className={buttonVariants()}>
            <Plus aria-hidden className="size-4" />
            Kirim acara baru
          </Link>
          {verified && (
            <Link href="/penyelenggara" className={buttonVariants({ variant: 'secondary' })}>
              Buka studio penyelenggara
            </Link>
          )}
        </div>
      </header>

      {/* Penyelenggara juga mendaftar acara orang lain; tagihannya sendiri tidak boleh tenggelam. */}
      {unpaid > 0 && (
        <Link
          href="/pembayaran"
          className="mt-6 flex min-h-11 items-center gap-3 rounded-card border border-line bg-panel px-4 py-3 text-sm transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested"
        >
          <ReceiptText aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">
            <span className="font-semibold">{unpaid} tagihan pendaftaranmu</span> belum dibayar
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0" />
        </Link>
      )}

      {verified ? <VerifiedDashboard user={user} now={now} /> : <PendingApplication organizer={organizer} />}
    </div>
  );
}

function PendingApplication({ organizer }: { organizer: OrganizerProfile }) {
  return (
    <section aria-labelledby="status-pengajuan" className="mt-8 max-w-2xl rounded-panel border border-line bg-panel p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-caution-soft text-caution">
          <Clock className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="status-pengajuan" className="text-lg">
            Pengajuan sedang ditinjau
          </h2>
          <p className="text-sm text-ink-muted">
            Dikirim {formatDateId(organizer.createdAt)}. Setelah terverifikasi, acara, formulir, dan pendaftar dikelola dari sini.
          </p>
        </div>
      </div>
      <Link href="/penyelenggara" className={buttonVariants({ variant: 'secondary', className: 'mt-5' })}>
        Lihat pengajuan <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}

async function VerifiedDashboard({ user, now }: { user: AuthUser; now: Date }) {
  const repository = await getEventRepository();
  const events = (await repository.listManagedEvents(user.id))
    .map(({ event }) => event)
    .sort((left, right) => deadlineOrder(left, now) - deadlineOrder(right, now));
  const active = events.filter((event) => !registrationEventClosed(event, now));
  // Angka & formulir pelengkap: gagal dimuat = kartu tanpa angka, bukan beranda yang error.
  // Formulir yang gagal dibaca dianggap ada supaya tidak muncul ajakan "buat formulir" palsu.
  // Angka diambil untuk SEMUA acara: bukti bayar paling ramai masuk justru setelah tenggat.
  const [stats, hasForm] =
    events.length === 0
      ? [[] as readonly RegistrationStats[], [] as readonly boolean[]]
      : await Promise.all([
          withFallback(
            'ringkasan pendaftar',
            () => repository.listRegistrationStats(toEventActor(user), events.map((event) => event.id)),
            [] as readonly RegistrationStats[],
          ),
          Promise.all(active.map((event) => repository.getRegistrationForm(event.id).then((form) => form !== null, () => true))),
        ]);
  const statsOf = new Map(stats.map((entry) => [entry.eventId, entry]));
  const totals = stats.reduce(
    (sum, entry) => ({ recent: sum.recent + entry.recent, review: sum.review + entry.paymentReview, confirmed: sum.confirmed + entry.confirmed }),
    { recent: 0, review: 0, confirmed: 0 },
  );

  const reviewTasks: Task[] = [];
  for (const event of events) {
    const entry = statsOf.get(event.id);
    if (entry && entry.paymentReview > 0) {
      reviewTasks.push({
        key: `bukti-${event.id}`,
        href: `${workspacePath(event.id, 'pendaftar')}?status=diperiksa`,
        icon: ReceiptText,
        title: `Periksa ${entry.paymentReview} bukti bayar`,
        detail: event.title,
      });
    }
  }
  const deadlineTasks: Task[] = [];
  const formTasks: Task[] = [];
  active.forEach((event, index) => {
    const entry = statsOf.get(event.id);
    const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
    if (days !== null && days <= DEADLINE_WINDOW_DAYS) {
      deadlineTasks.push({
        key: `tenggat-${event.id}`,
        href: workspacePath(event.id),
        icon: CalendarClock,
        title: closingLabel(days),
        detail: `${event.title} · ${entry?.total ?? 0} pendaftar`,
      });
    }
    if (hasForm[index] === false) {
      formTasks.push({
        key: `formulir-${event.id}`,
        href: workspacePath(event.id, 'formulir'),
        icon: FileText,
        title: 'Buat formulir pendaftaran',
        detail: event.title,
      });
    }
  });
  const tasks = [...reviewTasks, ...deadlineTasks, ...formTasks];

  const kpis = [
    { label: 'Acara aktif', value: active.length },
    { label: 'Pendaftar 7 hari', value: totals.recent },
    { label: 'Bukti bayar menunggu', value: totals.review },
    { label: 'Terkonfirmasi', value: totals.confirmed },
  ];

  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex flex-col-reverse gap-1 rounded-card border border-line bg-panel px-4 py-3.5">
            <dt className="text-[13px] text-ink-muted">{kpi.label}</dt>
            <dd className="font-display text-[28px] font-bold leading-none tabular-nums">{kpi.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-labelledby="perlu-tindakan" className="min-w-0 rounded-panel border border-line bg-panel p-5 sm:p-6">
          <h2 id="perlu-tindakan" className="flex min-h-11 items-center text-xl">
            Perlu tindakan
          </h2>
          {tasks.length > 0 ? (
            <ul className="mt-3 flex flex-col divide-y divide-line border-t border-line">
              {tasks.slice(0, TASK_LIMIT).map((task) => (
                <li key={task.key}>
                  <Link href={task.href} className="group flex min-h-11 items-center gap-3 py-3">
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-panel-nested">
                      <task.icon className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold group-hover:underline">{task.title}</span>
                      <span className="truncate text-[13px] text-ink-muted">{task.detail}</span>
                    </span>
                    <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-card bg-panel-nested px-4 py-5 text-sm text-ink-muted">
              <span className="block font-semibold text-ink">Tidak ada yang perlu diurus.</span>
              Bukti bayar baru dan tenggat yang mendekat akan muncul di sini.
            </p>
          )}
          {tasks.length > TASK_LIMIT && (
            <Link href="/penyelenggara" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold">
              {tasks.length - TASK_LIMIT} lainnya di studio <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          )}
        </section>

        <section aria-labelledby="acara-aktif" className="min-w-0 rounded-panel border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 id="acara-aktif" className="text-xl">
              Acara aktif
            </h2>
            <Link href="/penyelenggara" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink">
              Semua acara <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>
          {active.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line border-t border-line">
              {active.slice(0, EVENT_LIMIT).map((event) => (
                <li key={event.id} className="flex flex-col gap-1 py-3">
                  <Link href={workspacePath(event.id)} className="truncate font-semibold hover:underline">
                    {event.title}
                  </Link>
                  <span className="text-[13px] text-ink-muted">
                    {event.primaryDeadlineAt ? `Tutup ${formatShortDateId(event.primaryDeadlineAt)}` : 'Tanggal TBA'} ·{' '}
                    {statsOf.get(event.id)?.total ?? 0} pendaftar
                  </span>
                  <div className="-ml-2 flex flex-wrap">
                    {WORKSPACE_TABS.filter((tab) => tab.key !== 'ringkasan').map((tab) => (
                      <Link
                        key={tab.key}
                        href={workspacePath(event.id, tab.key)}
                        className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-medium text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
                      >
                        {tab.label}
                        <span className="sr-only"> {event.title}</span>
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-card bg-panel-nested px-4 py-5 text-sm text-ink-muted">
              <span className="block font-semibold text-ink">Belum ada acara aktif.</span>
              Kirim acara baru, atau klaim acara lembagamu dari halaman acaranya.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

/** Tenggat terdekat di atas; tanpa tanggal di paling bawah. */
function deadlineOrder(event: EventSummary, now: Date): number {
  const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
  return days ?? Number.MAX_SAFE_INTEGER;
}

function closingLabel(days: number): string {
  if (days <= 0) return 'Pendaftaran tutup hari ini';
  if (days === 1) return 'Pendaftaran tutup besok';
  return `Pendaftaran tutup ${days} hari lagi`;
}
