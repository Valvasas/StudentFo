import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  Clock,
  FilePlus2,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { WORKSPACE_TABS, workspacePath } from '@/components/organizer/event-workspace';
import { registrationEventClosed } from '@/components/registration/registration-view';
import { MySubmissions } from '@/components/submit/my-submissions';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { requireUser, toEventActor, type AuthUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil, formatDateId, formatDateTimeId } from '@/lib/deadline';
import { ORGANIZER_LIMITS, ORGANIZER_STATUS_LABEL } from '@/lib/organizer';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import {
  EVENT_TYPE_LABEL,
  type EventClaim,
  type ManagedEvent,
  type OrganizerHistoryEntry,
  type OrganizerProfile,
  type RegistrationForm,
  type RegistrationStats,
  type TrustRequestStatus,
} from '@/types/domain';
import { applyOrganizerAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Studio penyelenggara',
  robots: { index: false, follow: false },
};

const SELF = '/penyelenggara';

const REQUEST_BADGE: Record<TrustRequestStatus, { text: string; variant: 'warning' | 'success' | 'danger' }> = {
  PENDING: { text: 'Menunggu moderator', variant: 'warning' },
  APPROVED: { text: 'Disetujui', variant: 'success' },
  REJECTED: { text: 'Ditolak', variant: 'danger' },
};

interface RegistrationSummary {
  readonly stats: RegistrationStats | null;
  readonly form: RegistrationForm | null;
}

/**
 * Studio penyelenggara (ADR-042/043).
 *
 * Alur kepercayaan dijelaskan DI DEPAN, bukan disembunyikan: pengguna
 * mengajukan → moderator memverifikasi → baru bisa mengklaim acara & melihat
 * analitik. Setiap postingan & perubahan tetap lewat moderator — penyelenggara
 * terverifikasi mendapat kemudahan (formulir terisi, lencana, analitik),
 * bukan jalan pintas melewati pemeriksaan.
 */
export default async function OrganizerStudioPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const user = await requireUser(SELF);
  const repository = await getEventRepository();
  const profile = await repository.getOrganizerProfile(user.id);
  const verified = profile?.status === 'VERIFIED';
  const [managed, claims, history, submissions] = verified
    ? await Promise.all([
        repository.listManagedEvents(user.id),
        repository.listMyClaims(user.id),
        repository.listOrganizerHistory(user.id),
        repository.listMySubmissions(user.id, 10),
      ])
    : [[], [], [], []];
  // Kiriman yang sudah disetujui sudah tampil sebagai acara kelolaan; di sini
  // hanya yang masih perlu perhatian penyelenggara.
  const openSubmissions = submissions.filter((submission) => submission.status !== 'APPROVED');
  // Acara yang sudah tutup pindah ke Riwayat (angka akhir), bukan bercampur
  // dengan acara yang masih butuh perhatian.
  const closedIds = new Set(history.map((entry) => entry.eventId));
  const active = managed.filter(({ event }) => !closedIds.has(event.id));
  const registrations = verified ? await loadRegistrationSummaries(user, repository, active) : new Map<string, RegistrationSummary>();

  return (
    <div className="container-page flex flex-col gap-10 py-8">
      <header className="enter flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 max-w-2xl flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[.08em] text-ink-muted">Studio penyelenggara</p>
          <h1 className="text-[clamp(28px,4vw,38px)] leading-tight">
            {verified ? profile.orgName : 'Kelola acaramu di StudentFo'}
          </h1>
          {!verified && profile?.status !== 'REVOKED' && (
            <p className="text-ink-soft">
              Penyelenggara terverifikasi bisa membuka pendaftaran, memeriksa pembayaran, dan melihat analitik acaranya.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {profile && <StatusBadge profile={profile} />}
          {verified && (
            <Link href="/submit" className={buttonVariants()}>
              <FilePlus2 aria-hidden /> Kirim acara baru
            </Link>
          )}
        </div>
      </header>

      <ActionFeedback params={params} className="max-w-2xl" />
      {/* Penyelenggara baru mendarat di sini dari tautan konfirmasi email. Hanya
          `notice`: beberapa kode error ada di kedua daftar dan akan tampil dobel. */}
      <div className="max-w-2xl empty:hidden">
        <AuthFeedback params={{ notice: params.notice }} />
      </div>

      {verified ? (
        <>
          <ManagedEventsSection managed={active} registrations={registrations} hasHistory={history.length > 0} />
          <MySubmissions submissions={openSubmissions} title="Menunggu atau tidak disetujui moderator" />
          <ClaimsSection claims={claims} />
          <HistorySection history={history} />
          <details className="group rounded-panel border border-line bg-panel">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 flex-col gap-0.5">
                Data lembaga
                <span className="text-[13px] font-normal text-ink-muted">Nama, situs, dan bukti peranmu yang diperiksa moderator</span>
              </span>
              <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform duration-200 ease-snap group-open:rotate-90" />
            </summary>
            <div className="flex flex-col gap-4 border-t border-line p-5">
              <p role="note" className="flex items-start gap-2 rounded-card bg-caution-soft p-3 text-sm text-caution">
                <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                Mengubah nama, situs, atau bukti mengembalikan lembagamu ke antrean verifikasi. Selama menunggu, lencana,
                analitik, dan pengajuan perubahan nonaktif.
              </p>
              <ApplicationForm profile={profile} submitLabel="Simpan & verifikasi ulang" />
            </div>
          </details>
        </>
      ) : profile?.status === 'REVOKED' ? (
        <div role="note" className="flex max-w-2xl items-start gap-3 rounded-panel border border-danger-line bg-danger-soft p-5 text-danger">
          <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold">Status penyelenggara akun ini dicabut.</p>
            {profile.reviewNote && <p className="text-sm">Catatan moderator: {profile.reviewNote}</p>}
            <p className="text-sm">Pengajuan ulang tidak bisa dilakukan sendiri. Hubungi moderator bila menurutmu ini keliru.</p>
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))]">
          <section aria-labelledby="ajukan" className="enter flex flex-col gap-4 rounded-panel border border-line bg-panel p-6 shadow-card">
            <h2 id="ajukan" className="text-xl">
              {profile?.status === 'PENDING' ? 'Perbarui pengajuan' : 'Ajukan verifikasi'}
            </h2>
            {profile?.status === 'REJECTED' && profile.reviewNote && (
              <p className="rounded-card bg-danger-soft p-3 text-sm text-danger">Catatan moderator: {profile.reviewNote}</p>
            )}
            <ApplicationForm profile={profile} submitLabel={profile ? 'Kirim ulang pengajuan' : 'Kirim pengajuan'} />
          </section>
          <TrustSteps status={profile?.status ?? null} />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ profile }: { profile: OrganizerProfile }) {
  const variant = profile.status === 'VERIFIED' ? 'success' : profile.status === 'PENDING' ? 'warning' : 'danger';
  const Icon = profile.status === 'VERIFIED' ? BadgeCheck : profile.status === 'PENDING' ? Clock : ShieldAlert;
  return (
    <Badge variant={variant} className="h-8 px-3 text-sm">
      <Icon aria-hidden className="size-4" />
      {ORGANIZER_STATUS_LABEL[profile.status]}
    </Badge>
  );
}

function ApplicationForm({ profile, submitLabel }: { profile: OrganizerProfile | null; submitLabel: string }) {
  return (
    <form action={applyOrganizerAction} className="flex flex-col gap-4">
      <input type="hidden" name="returnTo" value={SELF} />
      <Field id="orgName" label="Nama lembaga / organisasi" hint="Sesuai nama resmi, mis. “BEM Fakultas Teknik Universitas X”.">
        <TextInput
          id="orgName"
          name="orgName"
          required
          minLength={2}
          maxLength={ORGANIZER_LIMITS.orgNameMax}
          defaultValue={profile?.orgName ?? ''}
          autoComplete="organization"
        />
      </Field>
      <Field id="website" label="Situs atau akun resmi (opsional)" hint="Harus diawali https://. Moderator mengecek nama lembaga di sini.">
        <TextInput id="website" name="website" type="url" inputMode="url" maxLength={500} placeholder="https://" defaultValue={profile?.website ?? ''} />
      </Field>
      <Field
        id="evidence"
        label="Bukti peranmu"
        hint={`Jabatanmu dan tautan yang membuktikannya (halaman pengurus, unggahan resmi yang menyebut namamu). ${ORGANIZER_LIMITS.evidenceMin}–${ORGANIZER_LIMITS.evidenceMax} karakter; hanya dibaca moderator.`}
      >
        <TextArea
          id="evidence"
          name="evidence"
          required
          minLength={ORGANIZER_LIMITS.evidenceMin}
          maxLength={ORGANIZER_LIMITS.evidenceMax}
          defaultValue={profile?.evidence ?? ''}
        />
      </Field>
      <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ className: 'self-start' })}>{submitLabel}</SubmitButton>
    </form>
  );
}

function TrustSteps({ status }: { status: OrganizerProfile['status'] | null }) {
  const steps = [
    { title: 'Ajukan', body: 'Isi nama lembaga dan bukti peranmu.', done: status !== null },
    {
      title: 'Diverifikasi moderator',
      body: 'Bukti dicek manual ke sumber resmi. Kamu dikabari lewat lonceng notifikasi.',
      done: false,
      current: status === 'PENDING',
    },
    { title: 'Kelola acara', body: 'Buka pendaftaran, periksa pembayaran, lihat analitik.', done: false },
  ];
  return (
    <aside aria-labelledby="alur" className="enter flex flex-col gap-4 [animation-delay:80ms]">
      <h2 id="alur" className="flex items-center gap-2 text-xl">
        <ShieldCheck aria-hidden className="size-5 text-ink-muted" />
        Alur verifikasi
      </h2>
      <p className="text-sm text-ink-soft">
        Verifikasi mencegah orang lain mengaku sebagai panitia lalu mengganti tautan pendaftaran.
      </p>
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <span className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-pill border text-xs font-semibold',
                  step.done ? 'border-brand bg-brand text-on-brand' : step.current ? 'border-brand text-ink' : 'border-line text-ink-muted',
                )}
              >
                {index + 1}
              </span>
              {index < steps.length - 1 && <span aria-hidden className={cn('min-h-6 w-px flex-1', step.done ? 'bg-brand' : 'bg-line')} />}
            </span>
            <span className="flex flex-col gap-0.5 pb-5">
              <span className="font-semibold">
                {step.title}
                {step.current && <span className="ml-2 text-xs font-medium text-caution">sedang ditinjau</span>}
              </span>
              <span className="text-sm text-ink-muted">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

async function loadRegistrationSummaries(
  user: AuthUser,
  repository: Awaited<ReturnType<typeof getEventRepository>>,
  active: readonly ManagedEvent[],
): Promise<ReadonlyMap<string, RegistrationSummary>> {
  const ids = active.map(({ event }) => event.id);
  if (ids.length === 0) return new Map();
  // Angka pendaftar pelengkap: gagal dimuat = kartu tanpa angka, bukan studio yang error.
  const [stats, forms] = await Promise.all([
    repository.listRegistrationStats(toEventActor(user), ids).catch((error: unknown) => {
      console.error('[studio] ringkasan pendaftar gagal dimuat:', error);
      return [] as readonly RegistrationStats[];
    }),
    Promise.all(ids.map((id) => repository.getRegistrationForm(id).catch(() => null))),
  ]);
  return new Map(ids.map((id, index) => [id, { stats: stats.find((entry) => entry.eventId === id) ?? null, form: forms[index] ?? null }]));
}

function ManagedEventsSection({
  managed,
  registrations,
  hasHistory,
}: {
  managed: readonly ManagedEvent[];
  registrations: ReadonlyMap<string, RegistrationSummary>;
  hasHistory: boolean;
}) {
  const now = new Date();
  return (
    <section aria-labelledby="acara-saya" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="acara-saya" className="text-2xl">Acara aktif</h2>
        <span className="text-sm text-ink-muted">{managed.length} acara</span>
      </div>
      {managed.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-panel border border-dashed border-line bg-panel px-6 py-10 text-center text-sm text-ink-muted">
          <p>{hasHistory ? 'Tidak ada acara yang sedang buka. Rekap acara sebelumnya ada di Riwayat acara.' : 'Belum ada acara di studiomu.'}</p>
          <p>Kirim acara baru, atau klaim acara lembagamu dari tab Penyelenggara di halaman acaranya.</p>
        </div>
      ) : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]">
          {managed.map(({ event }, index) => {
            const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
            const closed = registrationEventClosed(event, now);
            const summary = registrations.get(event.id);
            return (
              <li
                key={event.id}
                className="reveal flex flex-col rounded-panel border border-line bg-panel transition-[border-color,box-shadow] duration-200 ease-snap hover:border-line-strong hover:shadow-card"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="brand">{EVENT_TYPE_LABEL[event.eventType]}</Badge>
                    <Badge variant={closed ? 'neutral' : 'success'}>{closed ? 'Ditutup' : 'Tayang'}</Badge>
                    <span className="flex items-center gap-1 text-ink-muted">
                      <CalendarClock aria-hidden className="size-3.5" />
                      {closed ? 'Pendaftaran ditutup' : daysLeftLabel(days)}
                    </span>
                  </span>
                  <Link href={workspacePath(event.id)} className="text-base font-semibold leading-snug hover:underline">
                    {event.title}
                  </Link>
                  <RegistrationLine eventId={event.id} summary={summary} />
                </div>
                <nav aria-label={`Kelola ${event.title}`} className="grid grid-cols-4 divide-x divide-line border-t border-line">
                  {WORKSPACE_TABS.map((tab) => (
                    <Link
                      key={tab.key}
                      href={workspacePath(event.id, tab.key)}
                      className="flex min-h-11 items-center justify-center px-1 text-[13px] font-medium text-ink-muted transition-colors duration-150 ease-snap first:rounded-bl-panel last:rounded-br-panel hover:bg-panel-nested hover:text-ink"
                    >
                      {tab.label}
                      <span className="sr-only"> — {event.title}</span>
                    </Link>
                  ))}
                </nav>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RegistrationLine({ eventId, summary }: { eventId: string; summary: RegistrationSummary | undefined }) {
  if (!summary) return null;
  const { stats, form } = summary;
  const total = stats?.total ?? 0;
  if (!form && total === 0) {
    return <span className="text-sm text-ink-muted">Belum memakai formulir StudentFo</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
      <span className="flex items-center gap-1.5">
        <Users aria-hidden className="size-4" />
        <span>
          <strong className="font-semibold text-ink tabular-nums">{total.toLocaleString('id-ID')}</strong> pendaftar
          {stats && stats.confirmed > 0 && stats.confirmed !== total && <> · {stats.confirmed.toLocaleString('id-ID')} terkonfirmasi</>}
        </span>
      </span>
      {form && !form.isOpen && <span>Formulir ditutup</span>}
      {stats && stats.paymentReview > 0 && (
        <Link
          href={`${workspacePath(eventId, 'pendaftar')}?status=diperiksa`}
          className="relative inline-flex min-h-9 items-center gap-1.5 rounded-sm bg-caution-soft px-2 text-[13px] font-semibold text-caution after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:underline"
        >
          <ReceiptText aria-hidden className="size-4" />
          {stats.paymentReview.toLocaleString('id-ID')} bukti bayar perlu dicek
        </Link>
      )}
    </span>
  );
}

/**
 * Rekap acara yang sudah tutup (ADR-046) — angka seumur acara, untuk
 * membandingkan antar-edisi. Berbeda dari analitik per acara (jendela
 * 7–90 hari, audiens); detailnya tetap satu klik ke halaman analitik.
 */
function HistorySection({ history }: { history: readonly OrganizerHistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <section aria-labelledby="riwayat-acara" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="riwayat-acara" className="text-2xl">Riwayat acara</h2>
        <span className="text-sm text-ink-muted">Angka akhir sejak acara tayang</span>
      </div>
      <ul className="flex flex-col gap-3">
        {history.map((entry) => {
          const clickRate = entry.visitors > 0 ? Math.round((entry.clicks / entry.visitors) * 1000) / 10 : null;
          const metrics = [
            { label: 'Pengunjung unik', value: entry.visitors.toLocaleString('id-ID') },
            { label: 'Disimpan', value: entry.saves.toLocaleString('id-ID') },
            { label: 'Klik "Daftar"', value: `${entry.clicks.toLocaleString('id-ID')}${clickRate !== null ? ` · ${clickRate.toLocaleString('id-ID')}%` : ''}` },
            { label: 'Menandai sudah daftar', value: entry.applied.toLocaleString('id-ID') },
          ];
          return (
            <li key={entry.eventId} className="flex flex-col gap-4 rounded-panel border border-line bg-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="brand">{EVENT_TYPE_LABEL[entry.eventType]}</Badge>
                    <span className="text-ink-muted">{entry.closedAt ? `Tutup ${formatDateId(entry.closedAt)}` : 'Selesai'}</span>
                  </span>
                  <span className="text-base font-semibold leading-snug">{entry.title}</span>
                </span>
                <Link
                  href={`/penyelenggara/acara/${entry.eventId}`}
                  className="flex min-h-11 items-center gap-1.5 text-sm font-medium underline underline-offset-[3px]"
                >
                  <BarChart3 aria-hidden className="size-4" /> Analitik lengkap
                  <span className="sr-only"> {entry.title}</span>
                </Link>
              </div>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
                {metrics.map((metric) => (
                  <div key={metric.label} className="flex flex-col gap-1 bg-panel px-4 py-3">
                    <dt className="text-[12.5px] text-ink-muted">{metric.label}</dt>
                    <dd className="font-mono text-lg font-medium tracking-[-0.02em]">{metric.value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
      <p className="text-[12.5px] text-ink-muted">
        &ldquo;Menandai sudah daftar&rdquo; hanya dari peserta yang mencatatnya di StudentFo.
      </p>
    </section>
  );
}

function ClaimsSection({ claims }: { claims: readonly EventClaim[] }) {
  if (claims.length === 0) return null;
  return (
    <section aria-labelledby="klaim-saya" className="flex flex-col gap-4">
      <h2 id="klaim-saya" className="text-xl">Klaim acara</h2>
      <ul className="flex flex-col divide-y divide-line rounded-panel border border-line bg-panel">
        {claims.map((claim) => (
          <li key={claim.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              {claim.event.slug ? (
                <Link href={`/events/${claim.event.slug}`} className="truncate font-medium hover:underline">
                  {claim.event.title}
                </Link>
              ) : (
                <span className="truncate font-medium">{claim.event.title}</span>
              )}
              <span className="text-xs text-ink-muted">
                Diajukan {formatDateTimeId(claim.createdAt)}
                {claim.reviewNote ? ` · Catatan: ${claim.reviewNote}` : ''}
              </span>
            </span>
            <Badge variant={REQUEST_BADGE[claim.status].variant}>{REQUEST_BADGE[claim.status].text}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
