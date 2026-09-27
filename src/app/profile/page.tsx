import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Bookmark, Check, ChevronRight, Clock, Eye, GraduationCap, Lock, Mail, Pencil } from 'lucide-react';
import { toggleSaveEventAction } from '@/app/tracker/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { CategoryIcon } from '@/components/listing/category-icon';
import { AccountShell } from '@/components/layout/account-shell';
import {
  DemoAboutCard,
  DemoAchievements,
  DemoCity,
  DemoHeadline,
  DemoPhone,
  DemoStatusPicker,
  DemoTeamCard,
} from '@/components/profile/demo-profile-parts';
import { requireUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil, formatShortDateId } from '@/lib/deadline';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { initialsOf } from '@/lib/initials';
import { profileCompleteness } from '@/lib/profile-completeness';
import type { RawSearchParams } from '@/lib/search-params';
import { TRACKER_STEPS, TRACKER_STEP_LABEL, trackerProgress } from '@/lib/tracker-progress';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Profil',
  robots: { index: false, follow: false },
};

const TABS = [
  { key: 'tentang', label: 'Tentang', private: false, demoOnly: false },
  { key: 'pencapaian', label: 'Pencapaian', private: false, demoOnly: true },
  { key: 'pendaftaran', label: 'Pendaftaran', private: true, demoOnly: false },
  { key: 'tersimpan', label: 'Tersimpan', private: true, demoOnly: false },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/**
 * Profil (kanvas desain Profil bertab, chat8).
 *
 * Tab & "Lihat sebagai publik" memakai query string (`?tab=`,
 * `?tampilan=publik`) supaya tautan "Tersimpan" di navbar dan "Pendaftaran"
 * di menu akun langsung membuka bagiannya, dan semuanya berfungsi tanpa JS.
 * Tab Pendaftaran & Tersimpan membaca tracker dan simpanan sungguhan;
 * bagian yang belum punya kolom database (bio, status, pencapaian — ADR-039)
 * hanya tampil di mode data contoh.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const user = await requireUser('/profile');
  const repository = await getEventRepository();
  const [categories, savedEvents, trackerItems] = await Promise.all([
    repository.listCategories(),
    repository.listSavedEvents(user.id),
    repository.listTrackerItems(user.id),
  ]);

  const isPublic = params.tampilan === 'publik';
  const tabs = TABS.filter((item) => (!isPublic || !item.private) && (demoFeaturesEnabled || !item.demoOnly));
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab: TabKey = tabs.some((item) => item.key === rawTab) ? (rawTab as TabKey) : 'tentang';
  const tabHref = (key: TabKey) => `/profile?${new URLSearchParams({ ...(key !== 'tentang' ? { tab: key } : {}), ...(isPublic ? { tampilan: 'publik' } : {}) })}`.replace(/\?$/, '');
  const now = new Date();

  const completeness = profileCompleteness(user);
  const applications = trackerItems.filter((item) => item.status !== 'SAVED');
  const counts: Partial<Record<TabKey, number>> = { pendaftaran: applications.length, tersimpan: savedEvents.length };
  const interests = user.interests
    .map((slug) => categories.find((category) => category.slug === slug))
    .filter((category): category is NonNullable<typeof category> => Boolean(category));
  const togglePublicHref = isPublic ? (tab === 'tentang' ? '/profile' : `/profile?tab=${tab}`) : `/profile?tampilan=publik${tab !== 'tentang' && !TABS.find((item) => item.key === tab)?.private ? `&tab=${tab}` : ''}`;

  return (
    <AccountShell user={user} active="profil">
      <AuthFeedback params={params} />
      <ActionFeedback params={params} />

      {isPublic && (
        <div role="status" className="enter flex flex-wrap items-center gap-3.5 rounded-[12px] bg-inverse px-[18px] py-3.5 text-on-inverse [animation-duration:400ms]">
          <Eye aria-hidden className="size-4" />
          <span className="min-w-[220px] flex-1 text-sm leading-normal">
            Ini tampilan yang dilihat tim dan penyelenggara. Kontak, pendaftaran, dan item tersimpan tidak ditampilkan.
          </span>
          <Link href={togglePublicHref} className="flex min-h-11 items-center rounded-sm bg-on-inverse px-3.5 text-[13.5px] font-semibold text-inverse sm:min-h-9">
            Kembali ke profilku
          </Link>
        </div>
      )}

      <div className="enter flex flex-wrap items-stretch gap-5">
        <section aria-labelledby="nama-profil" className="flex min-w-0 flex-[2_1_420px] flex-col gap-5 rounded-[20px] border border-line p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="relative size-20">
              <span aria-hidden className="flex size-20 items-center justify-center rounded-pill bg-brand text-[26px] font-semibold tracking-[-0.02em] text-on-brand">
                {initialsOf(user.fullName)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={togglePublicHref}
                aria-current={isPublic ? 'page' : undefined}
                className="flex h-11 items-center gap-[7px] rounded-card border border-line-strong/70 px-3.5 text-[13.5px] font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested"
              >
                <Eye aria-hidden className="size-4" />
                {isPublic ? 'Tampilan pribadi' : 'Lihat sebagai publik'}
              </Link>
              {!isPublic && (
                <Link
                  href="/profile/details"
                  className="flex h-11 items-center gap-[7px] rounded-card bg-brand px-3.5 text-[13.5px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover"
                >
                  <Pencil aria-hidden className="size-[15px]" />
                  Edit profil
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h1 id="nama-profil" className="text-[clamp(30px,4vw,38px)] leading-[1.05] tracking-[-0.04em]">
              {user.fullName}
            </h1>
            {demoFeaturesEnabled && <DemoHeadline />}
          </div>
          <ul className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[13.5px] text-ink-muted">
            <li className="flex items-center gap-1.5">
              <GraduationCap aria-hidden className="size-[15px]" />
              <span>
                {[user.major, user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : null].filter(Boolean).join(' · ') ||
                  'Program studi & jenjang belum diisi'}
              </span>
            </li>
            {demoFeaturesEnabled && <DemoCity />}
          </ul>
          {demoFeaturesEnabled && <DemoStatusPicker editable={!isPublic} />}
        </section>

        {!isPublic && (
          <section aria-labelledby="kelengkapan" className="flex min-w-0 flex-[1_1_260px] flex-col gap-4 rounded-[20px] bg-panel-nested p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div
                role="img"
                aria-label={`Kelengkapan profil ${completeness.percent}%`}
                className="relative size-[72px] shrink-0 rounded-pill"
                style={{ background: `conic-gradient(var(--color-accent) ${Math.round(completeness.percent * 3.6)}deg, var(--color-border) 0)` }}
              >
                <span aria-hidden className="absolute inset-[7px] flex items-center justify-center rounded-pill bg-panel-nested text-[17px] font-bold tracking-[-0.02em]">
                  {completeness.percent}%
                </span>
              </div>
              <div className="flex flex-col gap-[3px]">
                <h2 id="kelengkapan" className="text-[15px] font-semibold">
                  {completeness.percent === 100 ? 'Profil sudah lengkap' : completeness.percent >= 50 ? 'Profil hampir siap' : 'Yuk lengkapi profilmu'}
                </h2>
                <p className="text-[13px] leading-snug text-ink-muted">Profil lengkap membuat urutan kegiatan lebih sesuai dengan minat dan jenjangmu.</p>
              </div>
            </div>
            <ul className="flex flex-col">
              {[...completeness.items]
                .sort((left, right) => Number(left.done) - Number(right.done))
                .map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="group flex min-h-11 items-center gap-3 border-t border-line-strong/40 text-sm">
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-pill border-[1.5px] border-brand text-on-brand',
                          item.done ? 'bg-brand' : 'border-dashed bg-panel-nested',
                        )}
                      >
                        {item.done && <Check className="size-[11px]" strokeWidth={2.6} />}
                      </span>
                      <span className={cn('flex-1', item.done && 'text-ink-muted line-through')}>
                        {item.label}
                        <span className="sr-only">{item.done ? ', sudah' : ', belum'}</span>
                      </span>
                      {!item.done && (
                        <span aria-hidden className="flex items-center gap-1 text-[13px] font-semibold transition-[gap] duration-150 group-hover:gap-[7px]">
                          Tambah <ArrowRight className="size-[13px]" />
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>

      <div className="sticky top-0 z-20 -mx-1 border-b border-line bg-canvas px-1 md:top-16">
        <nav aria-label="Bagian profil" className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((item, index) => {
            const active = item.key === tab;
            const firstPrivate = item.private && !tabs[index - 1]?.private;
            const count = counts[item.key];
            return (
              <span key={item.key} className="flex items-center">
                {firstPrivate && (
                  <span aria-hidden className="ml-3 flex h-[52px] items-center gap-1.5 whitespace-nowrap border-l border-line pl-4 pr-1 text-xs font-medium text-ink-muted">
                    <Lock className="size-3" />
                    Hanya kamu
                  </span>
                )}
                <Link
                  href={tabHref(item.key)}
                  scroll={false}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-[52px] items-center gap-2 whitespace-nowrap px-3.5 text-[14.5px] transition-colors duration-150 ease-snap',
                    active ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-text-primary)]' : 'font-medium text-ink-muted hover:text-ink',
                  )}
                >
                  {item.label}
                  {item.private && <span className="sr-only">, hanya kamu</span>}
                  {count !== undefined && (
                    <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-[10px] px-1.5 text-[11.5px] font-semibold', active ? 'bg-brand text-on-brand' : 'bg-panel-nested text-ink-muted')}>
                      {count}
                    </span>
                  )}
                </Link>
              </span>
            );
          })}
        </nav>
      </div>

      <section aria-label={tabs.find((item) => item.key === tab)?.label} className="enter flex min-h-[360px] flex-col gap-5 [animation-duration:300ms]">
        {tab === 'tentang' && (
          <div className="flex flex-wrap items-start gap-5">
            <div className="flex min-w-0 flex-[2_1_420px] flex-col gap-5">
              {demoFeaturesEnabled && <DemoAboutCard isPublic={isPublic} />}
              {demoFeaturesEnabled && <DemoTeamCard />}
              {!demoFeaturesEnabled && (
                <section className="flex flex-col gap-2 rounded-[18px] border border-dashed border-line-strong p-6">
                  <h2 className="text-base font-semibold">Bio, peran tim, dan pencapaian</h2>
                  <p className="text-sm leading-relaxed text-ink-muted">Bagian ini segera hadir. Sementara itu, lengkapi jenjang dan minat supaya rekomendasinya pas.</p>
                </section>
              )}
            </div>
            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-5">
              <section aria-labelledby="minat-title" className="flex flex-col gap-3.5 rounded-[18px] border border-line p-[22px]">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="minat-title" className="text-base font-semibold">
                    Minat
                  </h2>
                  {!isPublic && (
                    <Link href="/profile/interests" className="inline-flex min-h-11 items-center text-[13px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
                      Atur<span className="sr-only"> minat</span>
                    </Link>
                  )}
                </div>
                {interests.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {interests.map((category) => (
                      <li key={category.slug} className="flex h-[30px] items-center gap-1.5 rounded-sm bg-brand px-[11px] text-[13px] font-semibold text-on-brand">
                        <CategoryIcon slug={category.slug} />
                        {category.name.split(' & ')[0]}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-muted">{isPublic ? 'Belum memilih minat.' : 'Belum ada minat. Pilih bidang supaya rekomendasi lebih pas.'}</p>
                )}
              </section>
              {!isPublic && (
                <section aria-labelledby="kontak-title" className="flex flex-col gap-1 rounded-[18px] border border-line p-[22px]">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 id="kontak-title" className="text-base font-semibold">
                      Kontak
                    </h2>
                    <span className="flex items-center gap-[5px] text-xs text-ink-muted">
                      <Lock aria-hidden className="size-3" />
                      Privat
                    </span>
                  </div>
                  <a href={`mailto:${user.email}`} className="flex min-h-11 items-center gap-2.5 break-all text-[13.5px] hover:underline">
                    <Mail aria-hidden className="size-4 shrink-0" />
                    {user.email}
                  </a>
                  {demoFeaturesEnabled && <DemoPhone />}
                  <Link href="/profile/privacy" className="inline-flex min-h-11 items-center self-start text-[12.5px] text-ink-muted underline underline-offset-[3px] hover:text-ink">
                    Atur siapa yang bisa melihat
                  </Link>
                </section>
              )}
            </div>
          </div>
        )}

        {tab === 'pencapaian' && demoFeaturesEnabled && <DemoAchievements isPublic={isPublic} />}

        {tab === 'pendaftaran' && (
          <section aria-labelledby="pendaftaran-title" className="flex flex-col gap-1.5 rounded-[18px] border border-line p-5 sm:p-6">
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="pendaftaran-title" className="text-base font-semibold">
                Pendaftaran aktif
              </h2>
              <span className="flex items-center gap-[5px] text-[12.5px] text-ink-muted">
                <Lock aria-hidden className="size-3" />
                Hanya terlihat olehmu
              </span>
            </div>
            {applications.length > 0 ? (
              <ul className="flex flex-col">
                {applications.map((item) => {
                  const progress = trackerProgress(item.status);
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/tracker/${item.event.slug}`}
                        className="-mx-3 grid grid-cols-[minmax(0,1fr)_20px] items-center gap-x-4 gap-y-2.5 rounded-[10px] border-t border-line px-3 py-3.5 transition-colors duration-150 ease-snap hover:bg-panel-nested sm:grid-cols-[minmax(0,1fr)_150px_20px]"
                      >
                        <span className="flex min-w-0 flex-col gap-[3px]">
                          <span className="text-xs text-ink-muted">
                            {EVENT_TYPE_LABEL[item.event.eventType]} · tutup {item.event.primaryDeadlineAt ? formatShortDateId(item.event.primaryDeadlineAt) : 'TBA'}
                          </span>
                          <span className="truncate text-[15px] font-semibold">{item.event.title}</span>
                          <span className="text-[13px] text-ink-muted">{progress.rejected ? 'Belum berhasil kali ini' : (progress.next ?? 'Selamat, kamu diterima!')}</span>
                        </span>
                        <span className="col-start-1 flex max-w-[220px] flex-col gap-1.5 sm:col-start-auto">
                          <span aria-hidden className="flex gap-[3px]">
                            {TRACKER_STEPS.map((step, index) => (
                              <span key={step} className={cn('h-[5px] flex-1 rounded-[2px]', index <= progress.reached ? 'bg-brand' : 'bg-line')} />
                            ))}
                          </span>
                          <span className="text-xs font-medium">
                            <span className="sr-only">Tahap {progress.reached + 1} dari {TRACKER_STEPS.length}: </span>
                            {progress.rejected ? 'Ditolak' : TRACKER_STEP_LABEL[TRACKER_STEPS[progress.reached]!]}
                          </span>
                        </span>
                        <ChevronRight aria-hidden className="col-start-2 row-span-2 row-start-1 size-4 text-ink-muted sm:col-start-auto sm:row-auto" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-start gap-3 border-t border-line pb-1 pt-5">
                <p className="text-sm text-ink-muted">Belum ada pendaftaran. Setelah mendaftar di situs penyelenggara, tandai kegiatannya sebagai “Sudah daftar” di papan pendaftaran.</p>
                <Link href="/tracker" className="flex min-h-11 items-center gap-1.5 rounded-card border border-line-strong/70 px-3.5 text-[13.5px] font-semibold hover:bg-panel-nested">
                  Buka papan pendaftaran <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </div>
            )}
          </section>
        )}

        {tab === 'tersimpan' && (
          <section aria-labelledby="tersimpan-title" className="flex flex-col gap-1.5 rounded-[18px] border border-line p-5 sm:p-6">
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="tersimpan-title" className="text-base font-semibold">
                Tersimpan
              </h2>
              <span className="text-[12.5px] text-ink-muted">Urut dari tenggat terdekat</span>
            </div>
            {savedEvents.length > 0 ? (
              <ul className="flex flex-col">
                {[...savedEvents]
                  .sort((left, right) => (left.primaryDeadlineAt ?? '9999').localeCompare(right.primaryDeadlineAt ?? '9999'))
                  .map((event) => {
                    const days = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
                    const urgent = days !== null && days >= 0 && days <= 7;
                    return (
                      <li key={event.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-line py-3 sm:flex-nowrap">
                        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-line">
                          <CategoryIcon slug={event.categorySlugs[0]} className="size-4" />
                        </span>
                        <Link href={`/events/${event.slug}`} className="flex min-w-0 flex-1 flex-col gap-0.5 hover:underline">
                          <span className="truncate text-[14.5px] font-semibold">{event.title}</span>
                          <span className="text-[12.5px] text-ink-muted">
                            {EVENT_TYPE_LABEL[event.eventType]} · {event.organizer}
                          </span>
                        </Link>
                        <span
                          className={cn(
                            'order-last ml-[50px] whitespace-nowrap sm:order-none sm:ml-0',
                            urgent ? 'inline-flex h-6 items-center gap-1 rounded-[6px] bg-brand px-2 text-xs font-semibold text-on-brand' : 'text-[12.5px] text-ink-muted',
                          )}
                        >
                          {urgent && <Clock aria-hidden className="size-3" />}
                          {daysLeftLabel(days)}
                        </span>
                        <form action={toggleSaveEventAction}>
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="returnTo" value="/profile?tab=tersimpan" />
                          <button
                            type="submit"
                            aria-label={`Hapus ${event.title} dari tersimpan`}
                            className="flex size-11 items-center justify-center rounded-sm transition-colors duration-150 ease-snap hover:bg-panel-nested"
                          >
                            <Bookmark aria-hidden className="size-4 fill-current" />
                          </button>
                        </form>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <div className="flex flex-col items-start gap-3 border-t border-line pb-1 pt-5">
                <p className="text-sm text-ink-muted">Belum ada yang disimpan. Tekan ikon simpan di halaman lomba atau acara.</p>
                <Link href="/events?type=LOMBA" className="flex min-h-11 items-center gap-1.5 rounded-card border border-line-strong/70 px-3.5 text-[13.5px] font-semibold hover:bg-panel-nested">
                  Jelajahi lomba <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </div>
            )}
          </section>
        )}
      </section>
    </AccountShell>
  );
}
