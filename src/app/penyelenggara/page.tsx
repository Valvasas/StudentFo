import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  Clock,
  FilePlus2,
  Link2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { MySubmissions } from '@/components/submit/my-submissions';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { requireUser } from '@/lib/auth';
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

const SOURCE_TEXT: Record<ManagedEvent['source'], string> = {
  SUBMISSION: 'Dikirim lembagamu',
  CLAIM: 'Diklaim',
  ADMIN: 'Ditetapkan moderator',
};

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

  return (
    <div className="container-page flex flex-col gap-10 py-8">
      <header className="enter flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[.08em] text-ink-muted">
            Studio penyelenggara
          </p>
          <h1 className="text-[clamp(28px,4vw,38px)] leading-tight">
            {verified ? profile.orgName : 'Kelola acaramu di StudentFo'}
          </h1>
          <p className="text-ink-soft">
            {verified
              ? 'Pantau jangkauan acaramu, klaim acara yang sudah tayang, dan ajukan pembaruan — semuanya tetap dicek moderator supaya peserta bisa percaya.'
              : 'Penyelenggara terverifikasi bisa melihat analitik acaranya, mendapat lencana terverifikasi, dan mengajukan pembaruan tanpa menunggu moderator menemukannya sendiri.'}
          </p>
        </div>
        {profile && <StatusBadge profile={profile} />}
      </header>

      <ActionFeedback params={params} className="max-w-2xl" />

      {verified ? (
        <>
          <QuickActions />
          <ManagedEventsSection managed={active} hasHistory={history.length > 0} />
          <MySubmissions submissions={openSubmissions} title="Menunggu atau tidak disetujui moderator" />
          <ClaimsSection claims={claims} />
          <HistorySection history={history} />
          <details className="group rounded-panel border border-line bg-panel">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
              Data lembaga
              <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-snap group-open:rotate-90" />
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
    { title: 'Kelola acara', body: 'Klaim acara lembagamu, lihat analitik, ajukan pembaruan.', done: false },
  ];
  return (
    <aside aria-labelledby="alur" className="enter flex flex-col gap-4 [animation-delay:80ms]">
      <h2 id="alur" className="flex items-center gap-2 text-xl">
        <ShieldCheck aria-hidden className="size-5 text-ink-muted" />
        Kenapa harus diverifikasi?
      </h2>
      <p className="text-sm text-ink-soft">
        Ribuan pelajar mengandalkan informasi di sini untuk mendaftar. Verifikasi mencegah orang mengaku sebagai
        penyelenggara lalu mengganti tautan pendaftaran ke formulir palsu.
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

function QuickActions() {
  const actions = [
    {
      href: '/submit',
      icon: FilePlus2,
      title: 'Kirim acara baru',
      body: 'Masuk antrean moderator; setelah disetujui otomatis masuk dasbor ini.',
    },
    {
      href: '/events',
      icon: Link2,
      title: 'Klaim acara yang sudah tayang',
      body: 'Buka acaranya, lalu tab Penyelenggara → Klaim.',
    },
  ];
  return (
    <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
      {actions.map((action, index) => (
        <li key={action.href} className="enter" style={{ animationDelay: `${index * 60}ms` }}>
          <Link
            href={action.href}
            className="group flex h-full items-start gap-3 rounded-panel border border-line bg-panel p-5 transition-[border-color,transform,box-shadow] duration-200 ease-snap hover:-translate-y-0.5 hover:border-brand hover:shadow-raised"
          >
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand-text">
              <action.icon className="size-5" />
            </span>
            <span className="flex flex-1 flex-col gap-1">
              <span className="font-semibold">{action.title}</span>
              <span className="text-sm text-ink-muted">{action.body}</span>
            </span>
            <ArrowRight aria-hidden className="mt-1 size-4 text-ink-muted transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ManagedEventsSection({ managed, hasHistory }: { managed: readonly ManagedEvent[]; hasHistory: boolean }) {
  const now = new Date();
  return (
    <section aria-labelledby="acara-saya" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="acara-saya" className="text-2xl">Acara aktif</h2>
        <span className="text-sm text-ink-muted">{managed.length} acara</span>
      </div>
      {managed.length === 0 ? (
        <p className="rounded-panel border border-dashed border-line bg-panel px-6 py-10 text-center text-sm text-ink-muted">
          {hasHistory
            ? 'Tidak ada acara yang sedang buka. Rekap acara sebelumnya ada di Riwayat acara di bawah.'
            : 'Belum ada. Kirim acara baru atau klaim acara lembagamu yang sudah tayang.'}
        </p>
      ) : (
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
          {managed.map(({ event, source, since }, index) => {
            const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
            const closed = event.status === 'EXPIRED' || (days !== null && days < 0);
            return (
              <li key={event.id} className="reveal" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
                <Link
                  href={`/penyelenggara/acara/${event.id}`}
                  className="group flex h-full flex-col gap-3 rounded-panel border border-line bg-panel p-5 transition-[border-color,box-shadow] duration-200 ease-snap hover:border-brand hover:shadow-raised"
                >
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="brand">{EVENT_TYPE_LABEL[event.eventType]}</Badge>
                    <Badge variant={closed ? 'neutral' : 'success'}>{closed ? 'Ditutup' : 'Tayang'}</Badge>
                    <span className="text-ink-muted">{SOURCE_TEXT[source]} · {formatDateId(since)}</span>
                  </span>
                  <span className="text-base font-semibold leading-snug">{event.title}</span>
                  <span className="mt-auto flex items-center justify-between gap-2 text-sm text-ink-muted">
                    <span className="flex items-center gap-1.5">
                      <CalendarClock aria-hidden className="size-4" />
                      {closed ? 'Pendaftaran ditutup' : daysLeftLabel(days)}
                    </span>
                    <span className="flex items-center gap-1 font-medium text-ink">
                      <BarChart3 aria-hidden className="size-4" /> Analitik
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
        &ldquo;Menandai sudah daftar&rdquo; hanya menghitung peserta yang mencatatnya di StudentFo — bukan jumlah pendaftar
        resmimu.
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
