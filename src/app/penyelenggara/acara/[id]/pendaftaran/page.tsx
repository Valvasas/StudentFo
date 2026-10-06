import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BellRing,
  ClipboardList,
  Hourglass,
  Lightbulb,
  ListOrdered,
  Lock,
  PencilLine,
  Percent,
  ShieldCheck,
  Sparkles,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react';
import { setRegistrationFormStatusAction } from '@/app/penyelenggara/registration-actions';
import { ShareButton } from '@/components/event/share-button';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { NotManaging } from '@/components/organizer/not-managing';
import { CapacityMeter, LabeledBars, RegistrationColumns } from '@/components/organizer/registration-charts';
import { StudioEventHeader } from '@/components/organizer/studio-event-header';
import { buttonVariants } from '@/components/ui/button';
import { IllustrationStage } from '@/components/ui/feature-hero';
import { ChartRiseSketch, ClipboardSketch } from '@/components/ui/feature-illustrations';
import { HandNote } from '@/components/ui/sketch';
import { SubmitButton } from '@/components/ui/submit-button';
import { toActionErrorCode } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateTimeId } from '@/lib/deadline';
import { REGISTRATION_RANGES, registrationGate, registrationInsights, submittedInRange, type RegistrationInsight } from '@/lib/registration';
import { firstParam, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { REGISTRATION_STATUS_LABEL, REGISTRATION_STATUSES, type RegistrationForm, type RegistrationStats } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Performa pendaftaran',
  robots: { index: false, follow: false },
};

const number = (value: number) => value.toLocaleString('id-ID');

const STATUS_COPY: Record<RegistrationForm['status'], { label: string; text: string; dot: string }> = {
  DRAFT: { label: 'Draf', text: 'Belum terlihat peserta. Periksa formulirnya, lalu buka saat siap.', dot: 'bg-ink-muted' },
  OPEN: { label: 'Dibuka', text: 'Tombol "Daftar di StudentFo" tampil di halaman acara dan kartu katalog.', dot: 'bg-success' },
  CLOSED: { label: 'Ditutup', text: 'Tidak menerima pendaftar baru. Pendaftar yang ada tetap tersimpan dan bisa kamu kelola.', dot: 'bg-danger' },
};

const STATUS_HINT: Record<(typeof REGISTRATION_STATUSES)[number], string> = {
  CONFIRMED: 'memegang kursi',
  PENDING: 'memegang kursi, menunggu keputusanmu',
  WAITLISTED: 'naik otomatis saat kursi lepas',
  REJECTED: 'tidak bisa mendaftar ulang',
  CANCELLED: 'dibatalkan peserta',
};

function parseRange(raw: string | undefined): number {
  const value = Number(raw);
  return (REGISTRATION_RANGES as readonly number[]).includes(value) ? value : 30;
}

/**
 * Performa pendaftaran langsung (ADR-055). Angka di sini dari pendaftaran
 * StudentFo sendiri — berbeda dari "Menandai sudah daftar" di analitik
 * halaman, yang hanya batas bawah. Pusat kendali (buka/tutup) ada di atas
 * angka: keputusan yang paling sering diambil tidak boleh di bawah lipatan.
 */
export default async function RegistrationDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const base = `/penyelenggara/acara/${encodeURIComponent(id)}`;
  const selfPath = `${base}/pendaftaran`;
  const user = await requireUser(selfPath);
  const range = parseRange(firstParam(query.range));

  const repository = await getEventRepository();
  const managed = (await repository.listManagedEvents(user.id)).find((entry) => entry.event.id === id);
  if (!managed) return <NotManaging />;

  const formResult = await repository.getManagedRegistrationForm(user.id, id).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, code: toActionErrorCode(error) }),
  );
  if (!formResult.ok && formResult.code === 'not_event_manager') return <NotManaging />;
  const form = formResult.ok ? formResult.value : null;

  const [event, stats, seats] = form
    ? await Promise.all([
        repository.getEventBySlug(managed.event.slug),
        repository.getRegistrationStats(user.id, id, range),
        repository.getRegistrationSeats(id),
      ])
    : [await repository.getEventBySlug(managed.event.slug), null, null];
  if (!event) return <NotManaging />;

  const rangePath = range === 30 ? selfPath : `${selfPath}?range=${range}`;

  return (
    <div className="container-page flex flex-col gap-8 py-8">
      <StudioEventHeader event={event} active="pendaftaran" pending={stats?.byStatus.PENDING} />
      <ActionFeedback params={query} className="max-w-2xl" />

      {!formResult.ok ? (
        <p role="alert" className="rounded-panel border border-danger-line bg-danger-soft p-5 text-sm text-danger">
          Data pendaftaran belum bisa dimuat. Muat ulang halaman sebentar lagi.
        </p>
      ) : !form || !stats || !seats ? (
        <EmptyForm formHref={`${base}/pendaftaran/formulir`} hasExternalLink={Boolean(event.registrationLink)} />
      ) : (
        <>
          <ControlCenter
            form={form}
            eventId={event.id}
            canOpen={registrationGate({ status: 'OPEN' }, event).ok}
            returnTo={rangePath}
            formHref={`${base}/pendaftaran/formulir`}
            publicPath={`/events/${event.slug}/pendaftaran`}
            title={event.title}
          />
          <nav aria-label="Rentang waktu" className="flex w-fit gap-1 rounded-card border border-line bg-panel p-1">
            {REGISTRATION_RANGES.map((value) => (
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
          <Dashboard form={form} stats={stats} seats={seats} pendaftarHref={`${base}/pendaftar`} />
        </>
      )}
    </div>
  );
}

function ControlCenter({
  form,
  eventId,
  canOpen,
  returnTo,
  formHref,
  publicPath,
  title,
}: {
  form: RegistrationForm;
  eventId: string;
  canOpen: boolean;
  returnTo: string;
  formHref: string;
  publicPath: string;
  title: string;
}) {
  // OPEN di database tetapi tenggat sudah lewat: gerbang menolak semua pendaftar baru — jangan tulis "Dibuka".
  const lapsed = form.status === 'OPEN' && !canOpen;
  const copy = lapsed
    ? { label: 'Tertutup otomatis', text: 'Tenggat acara sudah lewat, jadi formulir tidak menerima pendaftar baru. Pendaftar yang ada tetap bisa kamu kelola.', dot: 'bg-caution' }
    : STATUS_COPY[form.status];
  const next = form.status === 'OPEN' ? 'CLOSED' : 'OPEN';
  return (
    <section aria-labelledby="kendali" className="flex flex-wrap items-center justify-between gap-5 rounded-[24px] border border-line bg-panel p-5 sm:p-6">
      <div className="flex min-w-0 max-w-xl items-start gap-4">
        <span aria-hidden className="relative mt-1 flex size-3 shrink-0">
          {form.status === 'OPEN' && !lapsed && <span className="absolute inset-0 animate-ping rounded-pill bg-success opacity-40 motion-reduce:hidden" />}
          <span className={cn('relative size-3 rounded-pill', copy.dot)} />
        </span>
        <span className="flex flex-col gap-1">
          <h2 id="kendali" className="text-[18px] font-bold tracking-[-0.02em]">
            Pendaftaran langsung · {copy.label}
          </h2>
          <span className="text-[13.5px] leading-relaxed text-ink-muted">
            {copy.text}
            {form.openedAt && ` Pertama dibuka ${formatDateTimeId(form.openedAt)}.`}
          </span>
          {!canOpen && form.status !== 'OPEN' && (
            <span className="text-[13px] font-medium text-caution">Acara sudah lewat tenggat atau tidak tayang — pendaftaran tidak bisa dibuka lagi.</span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={formHref} className={buttonVariants({ variant: 'secondary' })}>
          <PencilLine aria-hidden /> Edit formulir
        </Link>
        {form.status === 'OPEN' && !lapsed && <ShareButton title={title} path={publicPath} label="Bagikan tautan daftar" />}
        {(next === 'CLOSED' || canOpen) && (
          <form action={setRegistrationFormStatusAction}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="status" value={next} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <SubmitButton className={buttonVariants({ variant: next === 'OPEN' ? 'primary' : 'danger' })}>
              {next === 'OPEN' ? (form.status === 'DRAFT' ? 'Buka pendaftaran' : 'Buka lagi') : 'Tutup pendaftaran'}
            </SubmitButton>
          </form>
        )}
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, hint, index }: { icon: typeof Users; label: string; value: string; hint: string; index: number }) {
  return (
    <li className="rise flex flex-col gap-2 rounded-[20px] border border-line bg-panel p-5" style={{ '--i': index } as CSSProperties}>
      <span className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
        <span aria-hidden className="flex size-8 items-center justify-center rounded-[10px] bg-panel-nested text-ink">
          <Icon className="size-4" />
        </span>
        {label}
      </span>
      <span className="font-display text-[32px] font-bold leading-none tracking-[-0.03em] tabular-nums">{value}</span>
      <span className="text-[12.5px] text-ink-muted">{hint}</span>
    </li>
  );
}

const INSIGHT_ICON: Record<RegistrationInsight['tone'], { icon: typeof Sparkles; className: string }> = {
  good: { icon: Sparkles, className: 'border-success-line bg-success-soft' },
  warn: { icon: BellRing, className: 'border-caution-line bg-caution-soft' },
  info: { icon: Lightbulb, className: 'border-line bg-panel' },
};

function Dashboard({
  form,
  stats,
  seats,
  pendaftarHref,
}: {
  form: RegistrationForm;
  stats: RegistrationStats;
  seats: { capacity: number | null; taken: number; waitlisted: number };
  pendaftarHref: string;
}) {
  const active = stats.byStatus.PENDING + stats.byStatus.CONFIRMED + stats.byStatus.WAITLISTED;
  const total = REGISTRATION_STATUSES.reduce((sum, status) => sum + stats.byStatus[status], 0);
  const inRange = submittedInRange(stats);
  const conversion = stats.visitors > 0 ? (inRange / stats.visitors) * 100 : null;
  const insights = registrationInsights(stats, form);
  const kpis = [
    { icon: Users, label: 'Pendaftar aktif', value: number(active), hint: `${number(total)} formulir masuk sejak dibuka` },
    { icon: ListOrdered, label: `Mendaftar ${stats.days} hari terakhir`, value: number(inRange), hint: `${number(stats.series.reduce((sum, day) => sum + day.cancelled, 0))} batal di rentang yang sama` },
    {
      icon: Percent,
      label: 'Konversi halaman',
      value: conversion === null ? '—' : `${conversion.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`,
      hint: `dari ${number(stats.visitors)} pengunjung unik`,
    },
    form.reviewMode === 'MANUAL'
      ? {
          icon: Timer,
          label: 'Waktu keputusan (median)',
          value: stats.medianDecisionHours === null ? '—' : `${stats.medianDecisionHours.toLocaleString('id-ID')} jam`,
          hint: `${number(stats.byStatus.PENDING)} masih menunggu`,
        }
      : { icon: UserCheck, label: 'Terdaftar', value: number(stats.byStatus.CONFIRMED), hint: 'langsung aktif tanpa peninjauan' },
  ];

  if (total === 0) {
    return (
      <section className="grid items-center gap-8 rounded-[28px] border border-dashed border-line-strong bg-panel p-6 sm:p-9 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-3">
          <HandNote className="text-[21px] text-ink-muted">grafiknya menunggu pendaftar pertama</HandNote>
          <h2 className="text-[26px] font-bold leading-tight tracking-[-0.03em]">Belum ada yang mendaftar</h2>
          <p className="max-w-[54ch] text-[15px] leading-relaxed text-ink-muted">
            {form.status === 'OPEN'
              ? 'Formulirmu sudah terbuka. Bagikan tautannya ke grup angkatan, himpunan, dan media sosial lembagamu — pendaftar pertama biasanya datang dari situ.'
              : 'Buka pendaftaran dari panel di atas. Begitu ada yang mendaftar, kurva harian, kursi, dan asal pendaftar tampil di sini.'}
          </p>
        </div>
        <IllustrationStage tint="sky" className="min-h-[200px]">
          <ChartRiseSketch />
        </IllustrationStage>
      </section>
    );
  }

  return (
    <>
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
        {kpis.map((kpi, index) => (
          <Kpi key={kpi.label} {...kpi} index={index} />
        ))}
      </ul>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="harian" className="flex flex-col gap-4 rounded-[24px] border border-line bg-panel p-5 sm:p-6">
          <div className="flex flex-col gap-0.5">
            <h2 id="harian" className="text-lg">
              Pendaftar per hari
            </h2>
            <p className="text-sm text-ink-muted">Arahkan kursor ke batang untuk angka harian. Hari kalender WIB.</p>
          </div>
          <RegistrationColumns series={stats.series} />
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="kursi" className="flex flex-col gap-4 rounded-[24px] border border-line bg-panel p-5 sm:p-6">
            <h2 id="kursi" className="text-lg">
              Kursi
            </h2>
            <CapacityMeter seats={seats} waitlist={form.waitlist} />
          </section>
          <section aria-labelledby="corong" className="flex flex-col gap-4 rounded-[24px] border border-line bg-panel p-5 sm:p-6">
            <div className="flex flex-col gap-0.5">
              <h2 id="corong" className="text-lg">
                Dari kunjungan ke pendaftaran
              </h2>
              <p className="text-sm text-ink-muted">{stats.days} hari terakhir.</p>
            </div>
            <LabeledBars
              caption="Corong pendaftaran"
              total={Math.max(stats.visitors, inRange)}
              rows={[
                { label: 'Pengunjung unik', count: stats.visitors },
                { label: 'Mengirim pendaftaran', count: inRange },
              ]}
            />
          </section>
        </div>
      </div>

      {insights.length > 0 && (
        <section aria-labelledby="saran" className="flex flex-col gap-3">
          <h2 id="saran" className="flex items-center gap-2 text-lg">
            <Lightbulb aria-hidden className="size-5 text-ink-muted" /> Yang bisa kamu lakukan
          </h2>
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
            {insights.map((insight, index) => {
              const tone = INSIGHT_ICON[insight.tone];
              return (
                <li key={insight.text} className={cn('rise flex gap-3 rounded-[18px] border p-4', tone.className)} style={{ '--i': index } as CSSProperties}>
                  <tone.icon aria-hidden className="mt-0.5 size-5 shrink-0" />
                  <span className="text-[14px] leading-relaxed">{insight.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
        <section aria-labelledby="status" className="flex flex-col gap-4 rounded-[24px] border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="status" className="text-lg">
              Status pendaftar
            </h2>
            <Link href={pendaftarHref} className="flex min-h-11 items-center gap-1 text-[13.5px] font-semibold underline underline-offset-4">
              Kelola <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>
          <LabeledBars
            caption="Status pendaftar sejak dibuka"
            total={total}
            rows={REGISTRATION_STATUSES.map((status) => ({ label: REGISTRATION_STATUS_LABEL[status], count: stats.byStatus[status], hint: STATUS_HINT[status] }))}
          />
        </section>
        <section aria-labelledby="asal" className="flex flex-col gap-5 rounded-[24px] border border-line bg-panel p-5 sm:p-6">
          <div className="flex flex-col gap-0.5">
            <h2 id="asal" className="text-lg">
              Asal pendaftar aktif
            </h2>
            <p className="text-sm text-ink-muted">Dari data yang mereka kirim dengan persetujuan untuk dibagikan kepadamu.</p>
          </div>
          {stats.levels.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Jenjang</h3>
              <LabeledBars caption="Jenjang pendaftar aktif" total={active} rows={stats.levels} />
            </div>
          )}
          {stats.institutions.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Institusi teratas</h3>
              <LabeledBars caption="Institusi teratas" total={null} rows={stats.institutions} />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function EmptyForm({ formHref, hasExternalLink }: { formHref: string; hasExternalLink: boolean }) {
  const perks = [
    { icon: ClipboardList, title: 'Data rapi tanpa spreadsheet', body: 'Nama, kontak, institusi, jenjang, dan jawabanmu sendiri — siap diekspor ke CSV.' },
    { icon: Hourglass, title: 'Kuota & daftar tunggu otomatis', body: 'Kursi penuh? Pendaftar berikutnya antre dan naik sendiri saat ada yang batal.' },
    { icon: BellRing, title: 'Peserta dikabari otomatis', body: 'Konfirmasi, penolakan, dan naik antrean dikirim lewat notifikasi StudentFo.' },
    { icon: ShieldCheck, title: 'Aman untuk peserta', body: 'Formulir menolak pertanyaan kata sandi, OTP, NIK, atau rekening — tidak bisa jadi alat phishing.' },
  ];
  return (
    <section className="grid items-center gap-8 rounded-[28px] border border-line bg-panel p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:gap-14">
      <div className="enter flex flex-col gap-5">
        <HandNote className="text-[22px] text-ink-muted">±3 menit menyusunnya</HandNote>
        <h2 className="-mt-2 text-[clamp(28px,3.6vw,40px)] font-bold leading-[1.05] tracking-[-0.03em]">
          Terima pendaftar <span className="marker">langsung di StudentFo</span>
        </h2>
        <p className="max-w-[56ch] text-[15.5px] leading-relaxed text-ink-muted">
          Peserta tidak perlu pindah ke formulir lain, dan kamu bisa memantau setiap pendaftar dari studio ini.
          {hasExternalLink && ' Tautan pendaftaran resmimu tetap tampil sebagai alternatif.'}
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {perks.map((perk, index) => (
            <li key={perk.title} className="rise flex gap-3" style={{ '--i': index + 2 } as CSSProperties}>
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-panel-nested">
                <perk.icon className="size-[18px]" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold">{perk.title}</span>
                <span className="text-[13px] leading-relaxed text-ink-muted">{perk.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link href={formHref} className={buttonVariants({ size: 'lg' })}>
            Susun formulir <ArrowRight aria-hidden />
          </Link>
          <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            <Lock aria-hidden className="size-3.5" /> Tersimpan sebagai draf sampai kamu membukanya.
          </span>
        </div>
      </div>
      <IllustrationStage tint="mint" className="enter min-h-[260px] [animation-delay:140ms]">
        <ClipboardSketch />
      </IllustrationStage>
    </section>
  );
}

