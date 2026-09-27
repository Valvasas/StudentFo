import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bookmark,
  CalendarClock,
  ExternalLink,
  FileText,
  GraduationCap,
  MapPin,
  Users,
} from 'lucide-react';
import { toggleSaveEventAction } from '@/app/tracker/actions';
import { RequirementsChecklist } from '@/components/event/requirements-checklist';
import { SaveButton } from '@/components/event/save-button';
import { ShareButton } from '@/components/event/share-button';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { CategoryIcon, shortCategoryName } from '@/components/listing/category-icon';
import { InlineCountdown } from '@/components/listing/countdown';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import {
  daysLeftLabel,
  daysUntil,
  formatDateId,
  formatDateTimeId,
  formatShortDateId,
  getDeadlineState,
  jakartaDateParts,
} from '@/lib/deadline';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { EVENT_TYPE_NAV, eventTypeHref } from '@/lib/event-type-nav';
import { initialsOf } from '@/lib/initials';
import type { RawSearchParams } from '@/lib/search-params';
import { cn, safeHostname, sanitizeExternalUrl } from '@/lib/utils';
import {
  DEADLINE_LABEL_TEXT,
  EDUCATION_LEVEL_LABEL,
  EVENT_TYPE_LABEL,
  TRACKER_STATUS_LABEL,
  type EventDetail,
} from '@/types/domain';

export const dynamic = 'force-dynamic';

/** Dipanggil oleh generateMetadata DAN halaman; cache() membuatnya satu query per request. */
const loadEvent = cache(async (slug: string): Promise<EventDetail | null> =>
  (await getEventRepository()).getEventBySlug(slug),
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadEvent(slug);
  if (!event) return { title: 'Kegiatan tidak ditemukan' };

  const description = event.description?.slice(0, 155) ?? `${EVENT_TYPE_LABEL[event.eventType]} oleh ${event.organizer}.`;

  return {
    title: event.title,
    description,
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: { title: event.title, description, type: 'article' },
  };
}

const TABS = [
  { key: 'ringkasan', label: 'Ringkasan' },
  { key: 'syarat', label: 'Syarat & berkas' },
  { key: 'tahapan', label: 'Tahapan' },
  { key: 'penyelenggara', label: 'Penyelenggara' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const headingClass = 'text-[22px] font-bold tracking-[-0.025em]';

/**
 * Detail kegiatan (kanvas desain Detail, versi bertab — chat8).
 *
 * Tab memakai `?tab=` dan tautan biasa, bukan state klien: tautan yang
 * dibagikan membuka bagian yang sama, tombol back bekerja, dan halaman
 * tetap utuh tanpa JavaScript. Bagian kanvas yang butuh data yang belum
 * ada di skema (poster, hadiah, daftar berkas per jenis — ADR-039) diganti
 * dengan data yang ada atau arahan ke pengumuman resmi, bukan diisi rekaan.
 */
export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [event, user, repository] = await Promise.all([loadEvent(slug), getSessionUser(), getEventRepository()]);
  if (!event) notFound();

  const rawTab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: TabKey = TABS.some((item) => item.key === rawTab) ? (rawTab as TabKey) : 'ringkasan';
  const tabIndex = TABS.findIndex((item) => item.key === tab);

  const [isSaved, trackerItems, categories, similar] = await Promise.all([
    user ? repository.isEventSaved(user.id, event.id) : Promise.resolve(false),
    user ? repository.listTrackerItems(user.id) : Promise.resolve([]),
    repository.listCategories(),
    repository.listEvents({ types: [event.eventType], sort: 'deadline', pageSize: 4 }),
  ]);
  const tracked = trackerItems.find((item) => item.eventId === event.id);
  const category = categories.find((item) => item.slug === event.categorySlugs[0]);

  const now = new Date();
  const state = getDeadlineState(event.primaryDeadlineAt, now);
  const isClosed = state.urgency === 'closed' || event.status === 'EXPIRED';
  // Tautan berasal dari sumber pihak ketiga hasil scraping. Divalidasi ulang
  // di titik render — bukan diasumsikan aman karena "kan sudah divalidasi
  // di pipeline". Satu lapis saja tidak cukup untuk data yang tidak kita tulis.
  const registrationUrl = sanitizeExternalUrl(event.registrationLink);
  const sourceUrl = sanitizeExternalUrl(event.sourceUrl);
  const sourceHost = sourceUrl ? safeHostname(sourceUrl) : null;

  const nav = EVENT_TYPE_NAV.find((item) => item.types.includes(event.eventType));
  const listHref = nav ? eventTypeHref(nav) : `/events?type=${event.eventType}`;
  const typeLabel = nav?.label ?? EVENT_TYPE_LABEL[event.eventType];
  const levels = event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]);
  const place = event.isOnline ? 'Daring' : (event.location ?? 'Lokasi menyusul');
  const isTeamEvent = event.eventType === 'LOMBA';
  const detailPath = `/events/${event.slug}`;
  const tabHref = (key: TabKey) => (key === 'ringkasan' ? detailPath : `${detailPath}?tab=${key}`);
  const upcoming = event.deadlines.find((deadline) => (daysUntil(deadline.deadlineAt, now) ?? -1) >= 0);
  const deadlineParts = event.primaryDeadlineAt ? jakartaDateParts(event.primaryDeadlineAt) : null;
  const others = similar.items.filter((item) => item.id !== event.id).slice(0, 3);

  const requirements = [
    levels.length > 0 ? `Pelajar/mahasiswa aktif jenjang ${levels.join(' atau ')}` : 'Terbuka untuk semua jenjang',
    event.isOnline ? 'Bisa mengikuti kegiatan secara daring' : `Bisa hadir di ${place}`,
    ...(isTeamEvent ? ['Memenuhi ketentuan jumlah anggota tim dari penyelenggara'] : []),
    'Mendaftar sebelum tenggat melalui tautan resmi penyelenggara',
  ];

  const facts = [
    { icon: FileText, label: 'Jenis', value: EVENT_TYPE_LABEL[event.eventType] },
    { icon: GraduationCap, label: 'Jenjang', value: levels.join(' & ') || 'Semua jenjang' },
    { icon: MapPin, label: 'Pelaksanaan', value: place },
    { icon: CalendarClock, label: 'Tutup', value: event.primaryDeadlineAt ? formatDateId(event.primaryDeadlineAt) : 'Belum diumumkan' },
    { icon: Bookmark, label: 'Disimpan', value: `${event.savedCount.toLocaleString('id-ID')} orang` },
  ];

  const register = isClosed ? (
    // `disabled` tidak berefek pada <a>, jadi kegiatan yang ditutup tidak diberi tautan sama sekali.
    <span className="flex h-12 items-center justify-center rounded-card bg-panel-nested text-[15px] font-semibold text-ink-muted">
      Pendaftaran sudah ditutup
    </span>
  ) : registrationUrl ? (
    // Lewat /daftar supaya klik tercatat untuk kalibrasi (ADR-032); <a>
    // biasa, bukan <Link>, supaya prefetch tidak ikut tercatat.
    // rel="noopener": tanpa ini, halaman tujuan bisa mengakses window.opener.
    <a
      href={`${detailPath}/daftar`}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="flex h-12 items-center justify-center gap-2 rounded-card bg-brand text-[15px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover"
    >
      Daftar sekarang
      <ArrowUpRight aria-hidden className="size-4" />
      <span className="sr-only">(membuka situs penyelenggara di tab baru)</span>
    </a>
  ) : (
    <p className="rounded-card bg-caution-soft p-3 text-sm text-caution">
      Tautan pendaftaran belum tersedia atau tidak valid. Cek langsung ke situs penyelenggara.
    </p>
  );

  return (
    <div className="pb-28 min-[960px]:pb-0">
      <div className="container-page pt-6">
        <ActionFeedback params={query} className="mb-4 max-w-2xl" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={listHref}
            className="flex h-11 items-center gap-2 rounded-card border border-line pl-2.5 pr-3.5 text-sm font-medium transition-colors duration-150 ease-snap hover:bg-panel-nested"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Kembali ke {typeLabel}
          </Link>
          <nav aria-label="Remah roti" className="hidden flex-wrap items-center gap-2 text-[13px] text-ink-muted sm:flex">
            <Link href="/" className="inline-flex min-h-11 items-center hover:text-ink">
              Beranda
            </Link>
            <span aria-hidden>/</span>
            <Link href={listHref} className="inline-flex min-h-11 items-center hover:text-ink">
              {typeLabel}
            </Link>
            <span aria-hidden>/</span>
            <span aria-current="page" className="max-w-[32ch] truncate text-ink">
              {event.title}
            </span>
          </nav>
        </div>

        <div className="mt-6 grid items-center gap-10 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
          <div className="enter flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-[26px] items-center rounded-[6px] bg-brand px-2.5 text-[12.5px] font-semibold text-on-brand">
                {EVENT_TYPE_LABEL[event.eventType]}
              </span>
              {category && (
                <span className="flex h-[26px] items-center gap-1.5 rounded-[6px] border border-line px-2.5 text-[12.5px] font-medium">
                  <CategoryIcon slug={category.slug} />
                  {shortCategoryName(category.name)}
                </span>
              )}
              {tracked && (
                <span className="flex h-[26px] items-center rounded-[6px] bg-panel-nested px-2.5 text-[12.5px] font-semibold">
                  Di pendaftaranmu: {TRACKER_STATUS_LABEL[tracked.status]}
                </span>
              )}
              {isClosed && (
                <span className="flex h-[26px] items-center rounded-[6px] bg-panel-nested px-2.5 text-[12.5px] font-semibold text-ink-muted">
                  Pendaftaran ditutup
                </span>
              )}
            </div>
            <h1 className="text-[clamp(30px,4.6vw,42px)] leading-[1.08] tracking-[-0.04em] [text-wrap:balance]">{event.title}</h1>
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-brand font-mono text-xs font-medium">
                {initialsOf(event.organizer)}
              </span>
              <span className="flex flex-col gap-px">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                  {event.organizer}
                  <BadgeCheck aria-hidden className="size-4" />
                </span>
                <span className="text-[12.5px] text-ink-muted">Ditinjau manual sebelum tayang</span>
              </span>
            </div>
            {event.description && (
              <p className="max-w-[56ch] whitespace-pre-line text-base leading-[1.65] text-ink-soft">{event.description}</p>
            )}
          </div>

          {/* Kanvas menaruh poster resmi di sini; poster belum dikumpulkan
              (ADR-039), jadi panel ini merangkum tanggal tutup & sumbernya. */}
          <div
            aria-hidden
            className="enter relative hidden aspect-[4/3] w-full max-w-[520px] justify-self-end overflow-hidden rounded-2xl bg-panel-nested [animation-delay:80ms] [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px] md:block"
          >
            <div className="absolute inset-[12%] flex flex-col justify-between rounded-[14px] border border-line bg-panel p-[7%] shadow-[0_18px_40px_rgba(0,0,0,.06)]">
              <span className="font-mono text-xs uppercase tracking-[.08em] text-ink-muted">Tutup pendaftaran</span>
              <span className="flex items-end gap-4">
                <span className="text-[clamp(56px,7vw,88px)] font-bold leading-[.9] tracking-[-0.05em]">{deadlineParts?.day ?? '–'}</span>
                <span className="flex flex-col pb-1.5">
                  <span className="text-lg font-semibold">{deadlineParts?.month ?? 'Belum diumumkan'}</span>
                  <span className="text-sm text-ink-muted">{deadlineParts ? `${deadlineParts.weekday}, ${deadlineParts.year}` : ''}</span>
                </span>
              </span>
              <span className="flex items-center justify-between gap-3 border-t border-line pt-3 text-[13px]">
                <span className="truncate text-ink-muted">{sourceHost ? `Sumber: ${sourceHost}` : 'Sumber resmi penyelenggara'}</span>
                <span className="font-semibold">{daysLeftLabel(state.daysLeft)}</span>
              </span>
            </div>
          </div>
        </div>

        <dl className="mt-8 grid gap-px overflow-hidden rounded-[14px] border border-line bg-line [grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr))]">
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-1.5 bg-panel px-[18px] py-4">
              <dt className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                <fact.icon aria-hidden className="size-3.5" />
                {fact.label}
              </dt>
              <dd className="text-[15px] font-semibold tracking-[-0.01em]">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="sticky top-0 z-30 mt-8 border-b border-line bg-canvas md:top-16">
        <nav aria-label="Bagian informasi" className="container-page flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {TABS.map((item) => {
            const active = item.key === tab;
            const count = item.key === 'syarat' ? requirements.length : item.key === 'tahapan' ? event.deadlines.length : null;
            return (
              <Link
                key={item.key}
                href={tabHref(item.key)}
                scroll={false}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-[52px] shrink-0 items-center gap-2 whitespace-nowrap px-3.5 text-[14.5px] transition-colors duration-150 ease-snap',
                  active ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-text-primary)]' : 'font-medium text-ink-muted hover:text-ink',
                )}
              >
                {item.label}
                {count !== null && count > 0 && (
                  <span
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center rounded-[10px] px-1.5 text-[11.5px] font-semibold',
                      active ? 'bg-brand text-on-brand' : 'bg-panel-nested text-ink-muted',
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="container-page flex flex-wrap items-start gap-12 pb-12 pt-9">
        <section aria-label={TABS[tabIndex]?.label} className="enter flex min-w-0 flex-[1_1_560px] flex-col gap-10 [animation-duration:300ms]">
          {tab === 'ringkasan' && (
            <>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className={headingClass}>Sebelum mendaftar</h2>
                  <p className="text-[14.5px] text-ink-muted">Cek tiga hal ini. Buka tiap bagian untuk detail lengkapnya.</p>
                </div>
                <ol className="flex flex-col overflow-hidden rounded-[12px] border border-line">
                  {[
                    { key: 'syarat' as const, title: 'Syarat peserta', detail: `${requirements.length} syarat, termasuk jenjang ${levels.join(' atau ') || 'bebas'}` },
                    {
                      key: 'tahapan' as const,
                      title: 'Tahapan dan jadwal',
                      detail: `${event.deadlines.length} tanggal penting${upcoming ? `, berikutnya ${formatShortDateId(upcoming.deadlineAt)}` : ''}`,
                    },
                    { key: 'penyelenggara' as const, title: 'Penyelenggara', detail: `${event.organizer} · ditinjau manual` },
                  ].map((item, index) => (
                    <li key={item.key} className="border-b border-line last:border-b-0">
                      <Link href={tabHref(item.key)} scroll={false} className="flex items-center gap-4 px-[18px] py-4 transition-colors duration-150 ease-snap hover:bg-panel-nested">
                        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-line font-mono text-[12.5px]">
                          0{index + 1}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-[15px] font-semibold">{item.title}</span>
                          <span className="text-[13px] text-ink-muted">{item.detail}</span>
                        </span>
                        <span className="flex items-center gap-1.5 whitespace-nowrap text-[13.5px] font-medium">
                          Lihat <ArrowRight aria-hidden className="size-3.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>

              {isTeamEvent && !isClosed && (
                <div className="flex flex-wrap items-center gap-3.5 rounded-[14px] bg-panel-nested p-[18px]">
                  <span aria-hidden className="flex size-8 items-center justify-center rounded-pill bg-brand text-on-brand">
                    <Users className="size-4" />
                  </span>
                  <p className="min-w-[200px] flex-1 text-sm leading-normal text-ink-soft">
                    Lomba ini diikuti per tim. Belum punya tim? Cari rekan lintas kampus atau buka timmu sendiri.
                  </p>
                  <Link
                    href={`/teams?kegiatan=${event.slug}`}
                    className="flex h-11 items-center gap-1.5 rounded-card border border-line-strong/70 bg-panel px-3.5 text-sm font-semibold transition-colors duration-150 ease-snap hover:border-brand"
                  >
                    <Users aria-hidden className="size-4" />
                    Cari tim
                  </Link>
                </div>
              )}
            </>
          )}

          {tab === 'syarat' && (
            <>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className={headingClass}>Syarat peserta</h2>
                  <p className="text-[14.5px] text-ink-muted">Tandai untuk mengecek kesiapanmu. Syarat lengkap selalu mengikuti pengumuman resmi.</p>
                </div>
                <RequirementsChecklist items={requirements} />
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className={headingClass}>Berkas yang disiapkan</h2>
                  <p className="text-[14.5px] text-ink-muted">Daftar berkas berbeda di tiap penyelenggara dan tercantum di pengumuman resminya.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3.5 rounded-[12px] border border-line px-[18px] py-3.5">
                  <FileText aria-hidden className="size-5 shrink-0 text-ink-muted" />
                  <p className="min-w-[200px] flex-1 text-[14.5px]">Baca bagian persyaratan berkas di pengumuman resmi sebelum mulai mengisi formulir.</p>
                  {sourceUrl && (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex min-h-11 items-center gap-1 whitespace-nowrap text-sm font-semibold underline underline-offset-[3px]"
                    >
                      Buka sumber <ExternalLink aria-hidden className="size-3.5" />
                      <span className="sr-only">(tab baru)</span>
                    </a>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === 'tahapan' && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 className={headingClass}>Tahapan dan jadwal</h2>
                <p className="text-[14.5px] text-ink-muted">Semua waktu dalam WIB. Jadwal bisa berubah sesuai pengumuman penyelenggara.</p>
              </div>
              {event.deadlines.length > 0 ? (
                <ol className="flex flex-col">
                  {event.deadlines.map((deadline, index) => {
                    const days = daysUntil(deadline.deadlineAt, now);
                    const past = days !== null && days < 0;
                    const isNext = deadline.id === upcoming?.id;
                    return (
                      <li key={deadline.id} className="grid grid-cols-[88px_24px_minmax(0,1fr)] gap-3 sm:grid-cols-[120px_24px_minmax(0,1fr)]">
                        <span className="pt-px font-mono text-[13px] text-ink-muted">{formatShortDateId(deadline.deadlineAt)}</span>
                        <span aria-hidden className="flex flex-col items-center">
                          <span className={cn('mt-[3px] size-3.5 shrink-0 rounded-pill border-[1.5px] border-brand', past || isNext ? 'bg-brand' : 'bg-panel')} />
                          {index < event.deadlines.length - 1 && <span className={cn('min-h-7 w-[1.5px] flex-1', past ? 'bg-brand' : 'bg-line')} />}
                        </span>
                        <span className="flex flex-col gap-1 pb-7">
                          <span className="text-[15px] font-semibold leading-snug">
                            {DEADLINE_LABEL_TEXT[deadline.label]}
                            {deadline.isPrimary && <span className="font-normal text-ink-muted"> · tenggat utama</span>}
                          </span>
                          <span className="text-[13px] text-ink-muted">{formatDateTimeId(deadline.deadlineAt)}</span>
                          {isNext && (
                            <span className="flex h-[22px] items-center self-start rounded-[6px] bg-brand px-2 text-xs font-semibold text-on-brand">
                              Berikutnya · {daysLeftLabel(days)}
                            </span>
                          )}
                          {past && <span className="text-xs text-ink-muted">Sudah lewat</span>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-[14.5px] text-ink-muted">Penyelenggara belum mengumumkan jadwalnya.</p>
              )}
            </div>
          )}

          {tab === 'penyelenggara' && (
            <div className="flex flex-col gap-4">
              <h2 className={headingClass}>Penyelenggara</h2>
              <div className="flex flex-wrap items-center gap-[18px] rounded-[14px] border border-line p-[22px]">
                <span aria-hidden className="flex size-14 items-center justify-center rounded-[12px] bg-brand text-base font-semibold text-on-brand">
                  {initialsOf(event.organizer)}
                </span>
                <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-base font-semibold">
                    {event.organizer}
                    <BadgeCheck aria-hidden className="size-4" />
                  </span>
                  <span className="text-[13.5px] text-ink-muted">
                    Informasinya dicocokkan moderator dengan sumber{' '}
                    {sourceHost ? <strong className="font-medium text-ink-soft">{sourceHost}</strong> : 'aslinya'} sebelum tayang.
                  </span>
                </div>
              </div>
              <div role="note" className="flex gap-3 rounded-[12px] border border-dashed border-ink-muted p-4 text-sm leading-normal">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Jangan transfer biaya pendaftaran ke rekening pribadi, dan pastikan formulir yang kamu isi berada di domain resmi
                  penyelenggara. Ada yang janggal? Bandingkan dengan pengumuman aslinya.
                </span>
              </div>
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-h-11 items-center gap-1 self-start text-[13.5px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink"
                >
                  Buka pengumuman asli di {sourceHost ?? 'situs penyelenggara'}
                  <ExternalLink aria-hidden className="size-3.5" />
                  <span className="sr-only">(tab baru)</span>
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
            {tabIndex > 0 && (
              <Link
                href={tabHref(TABS[tabIndex - 1]!.key)}
                scroll={false}
                className="flex h-11 items-center gap-2 rounded-card border border-line pl-3 pr-4 text-sm font-medium transition-colors duration-150 ease-snap hover:bg-panel-nested"
              >
                <ArrowLeft aria-hidden className="size-4" />
                {TABS[tabIndex - 1]!.label}
              </Link>
            )}
            <span className="flex-1" />
            {tabIndex < TABS.length - 1 && (
              <Link
                href={tabHref(TABS[tabIndex + 1]!.key)}
                scroll={false}
                className="flex h-11 items-center gap-2 rounded-card border border-brand pl-4 pr-3 text-sm font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested"
              >
                Selanjutnya: {TABS[tabIndex + 1]!.label}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>
        </section>

        {/* Panel aksi, menempel saat menggulir supaya tombol daftar selalu
            terjangkau. Di bawah 960px digantikan bilah bawah. */}
        <aside aria-label="Pendaftaran" className="hidden min-w-[300px] flex-[0_1_340px] flex-col gap-3 min-[960px]:sticky min-[960px]:top-[136px] min-[960px]:flex">
          <div className="flex flex-col gap-[18px] rounded-2xl border border-line bg-panel p-6 shadow-[0_12px_32px_rgba(0,0,0,.05)]">
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] text-ink-muted">{isClosed ? 'Pendaftaran' : 'Pendaftaran tutup dalam'}</span>
              {event.primaryDeadlineAt && !isClosed ? (
                <InlineCountdown deadlineAt={event.primaryDeadlineAt} renderedAt={now.getTime()} />
              ) : (
                <span className="text-2xl font-semibold">{isClosed ? 'Sudah ditutup' : 'Tanggal belum diumumkan'}</span>
              )}
              <span className="text-[13px] text-ink-muted">
                <span className="sr-only">{state.longLabel}. </span>
                {event.primaryDeadlineAt ? `Tutup ${formatDateTimeId(event.primaryDeadlineAt)}` : 'Pantau pengumuman penyelenggara'}
              </span>
            </div>
            <dl className="flex flex-col gap-2.5 border-y border-line py-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Jenjang</dt>
                <dd className="text-right font-semibold">{levels.join(', ') || 'Semua'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Pelaksanaan</dt>
                <dd className="text-right font-semibold">{place}</dd>
              </div>
            </dl>
            <div className="flex flex-col gap-2">
              {register}
              {isTeamEvent && !isClosed && (
                <Link
                  href={`/teams?kegiatan=${event.slug}`}
                  className="flex h-11 items-center justify-center gap-2 rounded-card border border-line-strong/70 text-[14.5px] font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested"
                >
                  <Users aria-hidden className="size-4" />
                  Belum punya tim? Cari tim
                </Link>
              )}
              <div className="flex gap-2">
                <SaveButton eventId={event.id} isSaved={isSaved} returnTo={detailPath} variant="full" className="flex-1" />
                <ShareButton title={event.title} path={detailPath} />
              </div>
            </div>
          </div>
          {demoFeaturesEnabled && !isClosed && (
            <Link
              href={`${detailPath}/persiapan`}
              className="flex min-h-11 items-center gap-2 rounded-card bg-panel-nested px-3.5 py-3 text-[13px] leading-snug text-ink-soft transition-colors duration-150 ease-snap hover:bg-brand-soft"
            >
              <FileText aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">Siapkan data & berkas sebelum mendaftar</span>
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          )}
          <p className="text-[12.5px] leading-normal text-ink-muted">
            StudentFo hanya mengumpulkan informasi. Pendaftaran, seleksi, dan keputusan sepenuhnya ada di penyelenggara.
          </p>
        </aside>
      </div>

      {others.length > 0 && (
        <section aria-labelledby="serupa" className="container-page flex flex-col gap-4 pb-8">
          <h2 id="serupa" className={headingClass}>
            {typeLabel} lain yang serupa
          </h2>
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
            {others.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/events/${item.slug}`}
                  className="flex h-full flex-col gap-2.5 rounded-[12px] border border-line p-[18px] transition-colors duration-200 ease-snap hover:border-brand"
                >
                  <span className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                    <CategoryIcon slug={item.categorySlugs[0]} />
                    {shortCategoryName(categories.find((entry) => entry.slug === item.categorySlugs[0])?.name ?? 'Umum')}
                  </span>
                  <span className="text-[15px] font-semibold leading-snug">{item.title}</span>
                  <span className="text-[12.5px] text-ink-muted">
                    {item.organizer} · {daysLeftLabel(item.primaryDeadlineAt ? daysUntil(item.primaryDeadlineAt, now) : null)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Bilah bawah ponsel & tablet (< 960px): tenggat, simpan, daftar.
          Nama aksesibelnya sama dengan tombol di panel samping (yang
          disembunyikan di lebar ini), jadi alur & uji tidak bercabang. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas shadow-[0_-8px_24px_rgba(0,0,0,.06)] min-[960px]:hidden">
        <div className="mx-auto flex max-w-[720px] items-center gap-2.5 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">{isClosed ? 'Pendaftaran ditutup' : daysLeftLabel(state.daysLeft)}</span>
            <span className="truncate text-[12.5px] text-ink-muted">
              {event.primaryDeadlineAt ? `Tutup ${formatDateId(event.primaryDeadlineAt)}` : event.organizer}
            </span>
          </div>
          <form action={toggleSaveEventAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="returnTo" value={detailPath} />
            <button
              type="submit"
              aria-label={isSaved ? 'Tersimpan di Tracker' : 'Simpan ke Tracker'}
              className="flex size-12 items-center justify-center rounded-card border border-line"
            >
              <Bookmark aria-hidden className={cn('size-4', isSaved && 'fill-current')} />
            </button>
          </form>
          {!isClosed && registrationUrl && (
            <a
              href={`${detailPath}/daftar`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label="Daftar sekarang (membuka situs penyelenggara di tab baru)"
              className="flex h-12 shrink-0 items-center justify-center rounded-card bg-brand px-[18px] text-[15px] font-semibold text-on-brand"
            >
              Daftar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
