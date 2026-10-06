import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Eye,
  Lightbulb,
  Lock,
  MousePointerClick,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { proposeRevisionAction } from '@/app/penyelenggara/actions';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { Sparkbars, VisitsChart } from '@/components/organizer/analytics-chart';
import { RevisionChanges } from '@/components/organizer/revision-changes';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { toActionErrorCode } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysUntil, formatDateId, formatDateTimeId } from '@/lib/deadline';
import { ORGANIZER_LIMITS } from '@/lib/organizer';
import {
  ANALYTICS_RANGES,
  benchmarkRatio,
  buildFunnel,
  insightsOf,
  parseAnalyticsRange,
  trendOf,
  type AnalyticsInsight,
  type TrendSummary,
} from '@/lib/organizer-analytics';
import type { RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import {
  EDUCATION_LEVEL_LABEL,
  EDUCATION_LEVELS,
  type AnalyticsDay,
  type EventAnalytics,
  type EventDetail,
  type EventRevision,
} from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Analitik acara',
  robots: { index: false, follow: false },
};

const REVISION_BADGE = {
  PENDING: { text: 'Menunggu moderator', variant: 'warning' },
  APPROVED: { text: 'Diterapkan', variant: 'success' },
  REJECTED: { text: 'Ditolak', variant: 'danger' },
} as const;

const number = (value: number) => value.toLocaleString('id-ID');

/**
 * Analitik satu acara (ADR-043). Hanya pengelola TERVERIFIKASI — diperiksa
 * repository (dan `event_analytics()` di Postgres), bukan oleh halaman ini.
 * Angka audiens memakai k-anonimitas: kelompok < 5 orang tidak ditampilkan.
 */
export default async function EventAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const selfPath = `/penyelenggara/acara/${encodeURIComponent(id)}`;
  const user = await requireUser(selfPath);
  const range = parseAnalyticsRange(Array.isArray(query.range) ? query.range[0] : query.range);

  const repository = await getEventRepository();
  const managed = (await repository.listManagedEvents(user.id)).find((entry) => entry.event.id === id);
  if (!managed) return <NotManaging />;

  const [event, categories, revisions, analyticsResult] = await Promise.all([
    repository.getEventBySlug(managed.event.slug),
    repository.listCategories(),
    repository.listEventRevisions(user.id, id),
    repository.getEventAnalytics(user.id, id, range).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, code: toActionErrorCode(error) }),
    ),
  ]);
  if (!event || (!analyticsResult.ok && analyticsResult.code === 'not_event_manager')) return <NotManaging />;

  const rangePath = range === 30 ? selfPath : `${selfPath}?range=${range}`;
  const now = new Date();
  const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
  const isClosed = event.status === 'EXPIRED' || (days !== null && days < 0);
  const categoryName = new Map(categories.map((category) => [category.slug, category.name]));

  return (
    <div className="container-page flex flex-col gap-8 py-8">
      <div className="flex flex-col gap-3">
        <Link href="/penyelenggara" className="inline-flex min-h-11 items-center gap-1 self-start text-sm text-brand-text hover:underline">
          <ArrowLeft aria-hidden className="size-4" /> Studio penyelenggara
        </Link>
        <header className="enter flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 max-w-3xl flex-col gap-2">
            <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <Badge variant={isClosed ? 'neutral' : 'success'}>{isClosed ? 'Pendaftaran ditutup' : 'Tayang'}</Badge>
              {event.primaryDeadlineAt && <span>Tutup {formatDateTimeId(event.primaryDeadlineAt)}</span>}
            </span>
            <h1 className="text-[clamp(26px,3.6vw,36px)] leading-tight">{event.title}</h1>
          </div>
          <Link href={`/events/${event.slug}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Lihat halaman publik <ArrowUpRight aria-hidden />
          </Link>
        </header>
      </div>

      <ActionFeedback params={query} className="max-w-2xl" />

      <nav aria-label="Rentang waktu" className="flex w-fit gap-1 rounded-card border border-line bg-panel p-1">
        {ANALYTICS_RANGES.map((value) => (
          <Link
            key={value}
            href={value === 30 ? selfPath : `${selfPath}?range=${value}`}
            aria-current={value === range ? 'page' : undefined}
            scroll={false}
            className={cn(
              'flex h-9 min-w-16 items-center justify-center rounded-sm px-3 text-sm font-medium transition-colors duration-150 ease-snap',
              value === range ? 'bg-brand text-on-brand' : 'text-ink-muted hover:bg-panel-nested hover:text-ink',
            )}
          >
            {value} hari
          </Link>
        ))}
      </nav>

      {analyticsResult.ok ? (
        <AnalyticsBody analytics={analyticsResult.value} isClosed={isClosed} daysLeft={days} categoryName={categoryName} />
      ) : (
        <p role="alert" className="rounded-panel border border-danger-line bg-danger-soft p-5 text-sm text-danger">
          Analitik belum bisa dimuat. Muat ulang halaman sebentar lagi.
        </p>
      )}

      <RevisionSection event={event} revisions={revisions} returnTo={rangePath} />
    </div>
  );
}

function NotManaging() {
  return (
    <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
      <Lock aria-hidden className="size-10 text-ink-faint" />
      <h1 className="text-2xl">Acara ini tidak ada di dasbormu</h1>
      <p className="max-w-md text-ink-muted">
        Analitik hanya untuk penyelenggara terverifikasi yang mengelola acara ini. Klaim acaranya dari tab Penyelenggara
        di halaman acara.
      </p>
      <Link href="/penyelenggara" className={buttonVariants()}>
        Ke studio penyelenggara
      </Link>
    </div>
  );
}

function AnalyticsBody({
  analytics,
  isClosed,
  daysLeft,
  categoryName,
}: {
  analytics: EventAnalytics;
  isClosed: boolean;
  daysLeft: number | null;
  categoryName: ReadonlyMap<string, string>;
}) {
  const sum = (key: keyof Omit<AnalyticsDay, 'day'>) => analytics.series.reduce((total, day) => total + day[key], 0);
  const kpis = [
    { key: 'visitors', label: 'Pengunjung unik', hint: 'unik per hari', icon: Users, value: sum('visitors'), trend: trendOf(analytics.series, 'visitors') },
    { key: 'views', label: 'Total kunjungan', hint: 'termasuk kunjungan ulang', icon: Eye, value: sum('views'), trend: trendOf(analytics.series, 'views') },
    { key: 'saves', label: 'Disimpan', hint: 'ke tracker peserta', icon: Bookmark, value: sum('saves'), trend: trendOf(analytics.series, 'saves') },
    { key: 'clicks', label: 'Klik "Daftar"', hint: 'menuju formulir resmimu', icon: MousePointerClick, value: sum('clicks'), trend: trendOf(analytics.series, 'clicks') },
  ] as const;
  const insights = insightsOf(analytics, { daysLeft, isClosed });
  const funnel = buildFunnel(analytics.totals);
  const ratio = benchmarkRatio(analytics);
  const levelTotal = analytics.audience.levels.reduce((total, bucket) => total + bucket.count, 0) + analytics.audience.hidden;

  return (
    <>
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
        {kpis.map((kpi, index) => (
          <li
            key={kpi.key}
            className="enter flex flex-col gap-3 rounded-panel border border-line bg-panel p-5 shadow-card"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <span className="flex items-center justify-between gap-2 text-sm text-ink-muted">
              <span className="flex items-center gap-1.5">
                <kpi.icon aria-hidden className="size-4" />
                {kpi.label}
              </span>
              <TrendChip trend={kpi.trend} />
            </span>
            <span className="text-[32px] font-bold leading-none tracking-[-0.03em] tabular-nums">{number(kpi.value)}</span>
            <Sparkbars series={analytics.series} metric={kpi.key} />
            <span className="text-xs text-ink-faint">{kpi.hint} · {analytics.days} hari terakhir</span>
          </li>
        ))}
      </ul>

      <section aria-labelledby="grafik" className="rounded-panel border border-line bg-panel p-5 shadow-card sm:p-6">
        <h2 id="grafik" className="mb-4 text-lg">Kunjungan harian</h2>
        <VisitsChart series={analytics.series} />
      </section>

      {insights.length > 0 && (
        <section aria-labelledby="saran" className="flex flex-col gap-3">
          <h2 id="saran" className="flex items-center gap-2 text-lg">
            <Lightbulb aria-hidden className="size-5 text-ink-muted" /> Saran untukmu
          </h2>
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
            {insights.map((insight, index) => (
              <InsightCard key={insight.key} insight={insight} delay={index * 60} />
            ))}
          </ul>
        </section>
      )}

      <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))]">
        <section aria-labelledby="corong" className="flex flex-col gap-4 rounded-panel border border-line bg-panel p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 id="corong" className="text-lg">Corong peserta</h2>
            <p className="text-sm text-ink-muted">Sejak acara tayang. Persentase dari pengunjung unik.</p>
          </div>
          <ol className="flex flex-col gap-3">
            {funnel.map((step, index) => (
              <li key={step.key} className="flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{step.label}</span>
                  <span className="tabular-nums text-ink-muted">
                    <strong className="font-semibold text-ink">{number(step.value)}</strong>
                    {index > 0 && ` · ${step.ofFirst.toLocaleString('id-ID')}%`}
                  </span>
                </span>
                <span className="h-2.5 overflow-hidden rounded-pill bg-panel-nested" aria-hidden>
                  <span
                    className="grow-x block h-full rounded-pill bg-brand"
                    style={{ width: `${Math.max(step.ofFirst, step.value > 0 ? 2 : 0)}%`, animationDelay: `${index * 90}ms` }}
                  />
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-faint">
            “Menandai sudah daftar” berasal dari tracker peserta — tidak semua peserta menandainya, jadi anggap sebagai batas bawah.
          </p>
        </section>

        <section aria-labelledby="audiens" className="flex flex-col gap-4 rounded-panel border border-line bg-panel p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 id="audiens" className="text-lg">Siapa yang menyimpan</h2>
            <p className="text-sm text-ink-muted">
              Dari profil akun yang menyimpan acaramu. Kelompok berisi kurang dari {analytics.audience.minGroup} orang
              disembunyikan supaya tidak ada yang bisa dikenali.
            </p>
          </div>
          {analytics.audience.levels.length === 0 && analytics.audience.interests.length === 0 ? (
            <p className="flex items-center gap-2 rounded-card bg-panel-nested p-4 text-sm text-ink-muted">
              <Lock aria-hidden className="size-4 shrink-0" />
              Belum cukup penyimpan untuk ditampilkan tanpa mengungkap individu.
            </p>
          ) : (
            <>
              <BucketList
                title="Jenjang"
                buckets={analytics.audience.levels.map((bucket) => ({
                  label: EDUCATION_LEVEL_LABEL[bucket.label as keyof typeof EDUCATION_LEVEL_LABEL] ?? bucket.label,
                  count: bucket.count,
                }))}
                total={levelTotal}
              />
              <BucketList
                title="Minat teratas"
                buckets={analytics.audience.interests.map((bucket) => ({ label: categoryName.get(bucket.label) ?? bucket.label, count: bucket.count }))}
                total={Math.max(1, ...analytics.audience.interests.map((bucket) => bucket.count))}
                relative
              />
              {analytics.audience.hidden > 0 && (
                <p className="text-xs text-ink-faint">{number(analytics.audience.hidden)} penyimpan ada di kelompok kecil yang disembunyikan.</p>
              )}
            </>
          )}
        </section>
      </div>

      <section aria-labelledby="pembanding" className="flex flex-wrap items-center gap-4 rounded-panel border border-line bg-panel p-5 shadow-card">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-card bg-brand-soft text-brand-text">
          <TrendingUp className="size-5" />
        </span>
        <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
          <h2 id="pembanding" className="text-base">Dibanding acara sejenis</h2>
          <p className="text-sm text-ink-muted">
            {ratio === null
              ? 'Belum cukup acara berjenis sama untuk dibandingkan secara adil.'
              : `Kunjunganmu ${ratio.toLocaleString('id-ID')}× median ${number(analytics.benchmark.peers)} acara berjenis sama di ${analytics.days} hari terakhir (median ${number(Math.round(analytics.benchmark.medianViews))} kunjungan).`}
          </p>
        </div>
        {ratio !== null && (
          <span className={cn('text-2xl font-bold tabular-nums', ratio >= 1 ? 'text-success' : 'text-ink-muted')}>
            {ratio.toLocaleString('id-ID')}×
          </span>
        )}
      </section>
    </>
  );
}

function TrendChip({ trend }: { trend: TrendSummary }) {
  if (trend.changePct === null || trend.changePct === 0) return null;
  const up = trend.changePct > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn('flex items-center gap-0.5 rounded-sm px-1.5 text-xs font-semibold tabular-nums', up ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}
      title="Paruh akhir rentang dibanding paruh sebelumnya"
    >
      <Icon aria-hidden className="size-3" />
      <span className="sr-only">{up ? 'naik' : 'turun'} </span>
      {Math.abs(trend.changePct)}%
    </span>
  );
}

const INSIGHT_TONE = {
  good: { icon: Sparkles, className: 'border-success-line bg-success-soft text-success' },
  attention: { icon: ShieldAlert, className: 'border-caution-line bg-caution-soft text-caution' },
  info: { icon: Lightbulb, className: 'border-info-line bg-info-soft text-info' },
} as const;

function InsightCard({ insight, delay }: { insight: AnalyticsInsight; delay: number }) {
  const tone = INSIGHT_TONE[insight.tone];
  return (
    <li className={cn('reveal flex gap-3 rounded-panel border p-4', tone.className)} style={{ animationDelay: `${delay}ms` }}>
      <tone.icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <span className="flex flex-col gap-1">
        <span className="font-semibold">{insight.title}</span>
        <span className="text-sm text-ink-soft">{insight.body}</span>
      </span>
    </li>
  );
}

function BucketList({
  title,
  buckets,
  total,
  relative = false,
}: {
  title: string;
  buckets: readonly { label: string; count: number }[];
  total: number;
  /** Batang relatif terhadap kelompok terbesar (minat bisa lebih dari satu per orang). */
  relative?: boolean;
}) {
  if (buckets.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink-soft">{title}</h3>
      <ul className="flex flex-col gap-2">
        {buckets.map((bucket, index) => {
          const pct = total > 0 ? Math.round((bucket.count / total) * 100) : 0;
          return (
            <li key={bucket.label} className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className="truncate">{bucket.label}</span>
              <span className="h-2 overflow-hidden rounded-pill bg-panel-nested" aria-hidden>
                <span className="grow-x block h-full rounded-pill bg-brand/70" style={{ width: `${pct}%`, animationDelay: `${index * 70}ms` }} />
              </span>
              <span className="tabular-nums text-ink-muted">
                {number(bucket.count)}
                {!relative && <span className="text-ink-faint"> · {pct}%</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RevisionSection({ event, revisions, returnTo }: { event: EventDetail; revisions: readonly EventRevision[]; returnTo: string }) {
  const pending = revisions.filter((revision) => revision.status === 'PENDING').length;
  return (
    <section aria-labelledby="perbarui" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="perbarui" className="text-2xl">Perbarui informasi acara</h2>
        <p className="max-w-2xl text-sm text-ink-muted">
          Hanya kolom yang kamu ubah yang dikirim, dan halaman acara baru berubah setelah dicek moderator. Judul & nama
          penyelenggara tidak bisa diubah dari sini — hubungi moderator untuk itu.
          {pending > 0 && ` ${pending} permintaan masih menunggu.`}
        </p>
      </div>

      <details className="group rounded-panel border border-line bg-panel">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
          Ajukan perubahan
          <ArrowUpRight aria-hidden className="size-4 transition-transform duration-200 ease-snap group-open:rotate-90" />
        </summary>
        <form action={proposeRevisionAction} className="flex flex-col gap-5 border-t border-line p-5">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="slug" value={event.slug} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <Field id="rev-link" label="Tautan pendaftaran" hint="Harus https://. Mengganti tautan selalu diperiksa paling ketat oleh moderator.">
            <TextInput id="rev-link" name="registrationLink" type="url" inputMode="url" maxLength={500} defaultValue={event.registrationLink} />
          </Field>
          <Field
            id="rev-deadline"
            label="Perpanjang / ubah tenggat pendaftaran (opsional)"
            hint={`Saat ini: ${event.primaryDeadlineAt ? formatDateId(event.primaryDeadlineAt) : 'belum diumumkan'}. Ditutup pukul 23.59 WIB di tanggal yang dipilih.`}
          >
            <TextInput id="rev-deadline" name="deadlineDate" type="date" />
          </Field>
          <Field id="rev-description" label="Deskripsi" hint={`Maks. ${ORGANIZER_LIMITS.descriptionMax.toLocaleString('id-ID')} karakter.`}>
            <TextArea id="rev-description" name="description" rows={6} maxLength={ORGANIZER_LIMITS.descriptionMax} defaultValue={event.description ?? ''} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field id="rev-location" label="Lokasi">
              <TextInput id="rev-location" name="location" maxLength={ORGANIZER_LIMITS.locationMax} defaultValue={event.location ?? ''} />
            </Field>
            <label className="choice">
              <input type="checkbox" name="isOnline" defaultChecked={event.isOnline} className="check" />
              Daring
            </label>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13.5px] font-semibold">Jenjang peserta (minimal satu)</legend>
            <div className="flex flex-wrap gap-2">
              {EDUCATION_LEVELS.map((level) => (
                <label key={level} className="choice">
                  <input type="checkbox" name="educationLevels" value={level} defaultChecked={event.educationLevels.includes(level)} className="check" />
                  {EDUCATION_LEVEL_LABEL[level]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="rev-note" label="Catatan untuk moderator (opsional)" hint="Mis. tautan pengumuman perpanjangan resmi — mempercepat pengecekan.">
            <TextArea id="rev-note" name="note" rows={2} maxLength={ORGANIZER_LIMITS.noteMax} />
          </Field>
          <SubmitButton pendingLabel="Mengirim…" className={buttonVariants({ className: 'self-start' })}>Kirim ke moderator</SubmitButton>
        </form>
      </details>

      {revisions.length > 0 && (
        <ol className="flex flex-col gap-3">
          {revisions.map((revision) => (
            <li key={revision.id} className="flex flex-col gap-3 rounded-panel border border-line bg-panel p-4">
              <span className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
                <span>Diajukan {formatDateTimeId(revision.createdAt)}</span>
                <Badge variant={REVISION_BADGE[revision.status].variant}>{REVISION_BADGE[revision.status].text}</Badge>
              </span>
              <RevisionChanges changes={revision.changes} current={null} />
              {revision.reviewNote && <p className="text-sm text-ink-soft">Catatan moderator: {revision.reviewNote}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
