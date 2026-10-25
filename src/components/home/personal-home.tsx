import { cookies } from 'next/headers';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bookmark, Hourglass, type LucideIcon, ReceiptText, Ticket, UsersRound } from 'lucide-react';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { DeadlineWeek } from '@/components/event/deadline-week';
import { EventGrid } from '@/components/event/event-grid';
import { loadMyRegistrations } from '@/components/home/account-role';
import { GettingStarted, type GettingStartedStep } from '@/components/home/getting-started';
import { SearchBox } from '@/components/listing/listing-ui';
import { registrationHref } from '@/components/registration/registration-cta';
import { registrationCta, registrationEventClosed, type RegistrationCta } from '@/components/registration/registration-view';
import { type AuthUser, isProfileComplete } from '@/lib/auth';
import { formatRupiah } from '@/lib/currency';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import { GETTING_STARTED_COOKIE, isGettingStartedHidden } from '@/lib/getting-started';
import { firstNameOf, greetingFor, todayLabel } from '@/lib/greeting';
import { parseEventQuery, type RawSearchParams } from '@/lib/search-params';
import { needsActionSoon } from '@/lib/tracker-progress';
import { EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, type EventRegistration, type TrackerStatus } from '@/types/domain';

const ACTION_LIMIT = 6;
const RECOMMENDATION_LIMIT = 6;

interface Shortcut {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly count?: number;
  readonly countLabel?: string;
}

/**
 * Beranda peserta (ADR-053, ADR-056): tujuan utamanya menemukan & mendaftar
 * kegiatan serta melacak tenggat & pembayaran. Urut menurut urgensi:
 * (1) tagihan & incaran yang tutup ≤ 7 hari, (2) posisi pendaftaran,
 * (3) kegiatan baru yang cocok.
 *
 * Tidak ada aturan baru — "perlu tindakan" = `needsActionSoon` (papan
 * Pendaftaran) + tagihan dari menu Pembayaran, "sesuai minatmu" = urutan
 * `relevance` yang sama dengan /events. "Mulai di sini" (ADR-061) hanya
 * membaca keadaan akun yang sudah dimuat + kartu pencocokan.
 */
export async function PersonalHome({ user, params }: { user: AuthUser; params: RawSearchParams }) {
  const repository = await getEventRepository();
  const now = new Date();
  const [tracker, saved, recommended, week, categories, registrations, seeker, cookieStore] = await Promise.all([
    repository.listTrackerItems(user.id),
    repository.listSavedEvents(user.id),
    repository.listEvents({
      sort: 'relevance',
      profile: { educationLevel: user.educationLevel, interests: user.interests },
      // Lebih dari yang ditampilkan: yang sudah disimpan/dilacak dibuang dulu.
      pageSize: RECOMMENDATION_LIMIT * 2,
    }),
    repository.getDeadlineWeek(),
    repository.listCategories(),
    loadMyRegistrations(user.id),
    withFallback('kartu pencocokan', () => repository.getSeekerProfile(user.id), null),
    cookies(),
  ]);

  const trackedIds = new Set(tracker.map((item) => item.eventId));
  const savedIds = new Set(saved.map((event) => event.id));
  const allUnpaid = registrations.filter((registration) => registration.status === 'AWAITING_PAYMENT');
  const unpaid = allUnpaid.slice(0, ACTION_LIMIT);
  const inReview = registrations.filter((registration) => registration.status === 'PAYMENT_REVIEW');
  // Simpanan (penanda) dan baris tracker "Disimpan" sama-sama berarti "belum
  // didaftar"; satu kegiatan yang ada di keduanya cukup muncul sekali.
  const deadlines = needsActionSoon(
    [
      ...tracker,
      ...saved.filter((event) => !trackedIds.has(event.id)).map((event) => ({ status: 'SAVED' as TrackerStatus, event })),
    ],
    now,
  ).slice(0, ACTION_LIMIT - unpaid.length);
  // Acara yang memakai formulir StudentFo didaftar di tab ini juga, bukan
  // lewat tautan luar di tab baru (ADR-056). Paling banyak ACTION_LIMIT baris.
  const deadlineCtas = await Promise.all(
    deadlines.map(async ({ item }) => {
      const form = await withFallback('formulir pendaftaran', () => repository.getRegistrationForm(item.event.id), null);
      // Sama dengan getMyRegistration: DITOLAK tetap "milikmu" (final, tidak bisa daftar ulang).
      const mine = registrations.find((entry) => entry.event.id === item.event.id && entry.status !== 'CANCELLED') ?? null;
      return registrationCta(form, mine, registrationEventClosed(item.event, now));
    }),
  );
  const picks = recommended.items.filter((event) => !trackedIds.has(event.id) && !savedIds.has(event.id)).slice(0, RECOMMENDATION_LIMIT);

  const counts = {
    watched: tracker.length,
    // Label & hitungan sengaja berbeda dari kolom Papan lamaran ("Sudah
    // Daftar" = status APPLIED saja): angka yang sama di bawah label yang sama
    // tetapi berbeda nilai antarhalaman membuat orang meragukan keduanya.
    waiting: tracker.filter((item) => item.status === 'APPLIED' || item.status === 'INTERVIEW').length,
    accepted: tracker.filter((item) => item.status === 'ACCEPTED').length,
  };
  const interestNames = user.interests
    .map((slug) => categories.find((category) => category.slug === slug)?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 3);
  const profileReady = isProfileComplete(user);
  const gettingStarted: GettingStartedStep[] = [
    { label: 'Pilih minat & jenjangmu', hint: 'Rekomendasi dan pengingat menyesuaikan pilihanmu.', href: '/profile/interests', done: profileReady },
    { label: 'Simpan kegiatan pertamamu', hint: 'Pengingat H-3 & H-1 muncul di lonceng notifikasi.', href: '/events', done: saved.length + tracker.length > 0 },
    { label: 'Buat kartu pemain', hint: 'Dicocokkan dengan rekan yang keahliannya melengkapimu.', href: '/teams/cocok', done: seeker !== null },
  ];
  const showGettingStarted =
    gettingStarted.some((step) => !step.done) && !isGettingStartedHidden(cookieStore.get(GETTING_STARTED_COOKIE)?.value, user.id);

  const shortcuts: Shortcut[] = [
    { href: '/tracker', label: 'Papan lamaran', icon: Ticket },
    { href: '/pembayaran', label: 'Pendaftaran & pembayaran', icon: ReceiptText, count: allUnpaid.length, countLabel: 'belum dibayar' },
    { href: '/profile?tab=tersimpan', label: 'Tersimpan', icon: Bookmark, count: saved.length, countLabel: 'tersimpan' },
    { href: '/teams', label: 'Cari tim', icon: UsersRound },
  ];

  return (
    <div className="container-page pb-8 pt-8 sm:pt-12">
      {/* Tautan konfirmasi email mendarat di sini (`/?notice=email_confirmed`) —
          tanpa ini sambutan untuk pengguna baru hilang diam-diam. */}
      <div className="mb-6 max-w-2xl empty:hidden">
        <AuthFeedback params={params} />
      </div>
      <header className="enter flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-2xl flex-col gap-1.5">
          <p className="text-sm text-ink-muted">{todayLabel(now)}</p>
          <h1 className="text-[clamp(30px,4.6vw,44px)] leading-[1.05]">
            {greetingFor(now)}, {firstNameOf(user.fullName)}.
          </h1>
        </div>
        <div className="flex w-full lg:max-w-md">
          <SearchBox query={parseEventQuery({})} placeholder="Cari lomba, beasiswa, magang…" />
        </div>
      </header>

      {/* Akun baru: panduan dulu. Setelah minat terisi, yang mendesak didahulukan dan panduan turun ke bawahnya. */}
      {showGettingStarted && !profileReady && <GettingStarted steps={gettingStarted} className="mt-8" />}

      {/* items-start: tanpa itu kartu "Perlu tindakan" yang kosong ikut meregang
          setinggi "Pantauanmu" dan menyisakan petak kosong besar. */}
      <div className="mt-8 grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section aria-labelledby="perlu-tindakan" className="min-w-0 rounded-panel border border-line bg-panel p-5 sm:p-6">
          <h2 id="perlu-tindakan" className="text-xl">
            Perlu tindakan
          </h2>
          {unpaid.length + deadlines.length > 0 ? (
            <ul className="mt-3 flex flex-col divide-y divide-line border-t border-line">
              {unpaid.map((registration) => (
                <PaymentRow key={registration.id} registration={registration} />
              ))}
              {deadlines.map(({ item }, index) => (
                <li key={item.event.id} className="flex items-center gap-3 py-3">
                  <DeadlineTag deadlineAt={item.event.primaryDeadlineAt} className="shrink-0" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link href={`/events/${item.event.slug}`} className="line-clamp-2 font-semibold hover:underline">
                      {item.event.title}
                    </Link>
                    <span className="truncate text-[13px] text-ink-muted">
                      {EVENT_TYPE_LABEL[item.event.eventType]} · {item.event.organizer}
                    </span>
                  </span>
                  <RegisterAction slug={item.event.slug} title={item.event.title} cta={deadlineCtas[index] ?? null} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-card bg-panel-nested px-4 py-5 text-sm">
              <p className="font-semibold">Tidak ada yang mendesak.</p>
              <p className="mt-0.5 text-ink-muted">Kegiatan yang kamu simpan muncul di sini saat tenggatnya tinggal 7 hari.</p>
            </div>
          )}
          {inReview.length > 0 && (
            <Link
              href={inReview.length === 1 && inReview[0] ? registrationHref(inReview[0].id) : '/pembayaran'}
              className="mt-3 flex min-h-11 items-center gap-2.5 rounded-sm px-1 text-sm text-ink-soft hover:text-ink"
            >
              <Hourglass aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate">
                {inReview.length === 1 && inReview[0]
                  ? `Bukti bayar ${inReview[0].event.title} sedang diperiksa`
                  : `${inReview.length} bukti bayar sedang diperiksa`}
              </span>
              <ArrowRight aria-hidden className="size-3.5 shrink-0" />
            </Link>
          )}
        </section>

        <section aria-labelledby="pantauanmu" className="flex min-w-0 flex-col rounded-panel border border-line bg-panel p-5 sm:p-6">
          <h2 id="pantauanmu" className="text-xl">
            Pantauanmu
          </h2>
          {counts.watched > 0 ? (
            <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-card border border-line">
              {[
                { label: 'Dipantau', value: counts.watched },
                { label: 'Menunggu kabar', value: counts.waiting },
                { label: 'Diterima', value: counts.accepted },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col-reverse gap-0.5 px-3 py-3">
                  <dt className="text-[12.5px] text-ink-muted">{stat.label}</dt>
                  <dd className="font-display text-2xl font-bold tabular-nums">{stat.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            // Tiga angka nol tidak memberi tahu apa pun; kalimat ini memberi tahu cara mengisinya.
            <p className="mt-2 text-sm text-ink-muted">Simpan kegiatan untuk memantau tenggat dan tahap pendaftarannya.</p>
          )}
          <nav aria-label="Akses cepat" className="mt-4 grid grid-cols-2 gap-2">
            {shortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="flex min-h-11 items-center gap-2 rounded-sm border border-line px-3 py-2 text-sm font-medium transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested"
              >
                <shortcut.icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 truncate">{shortcut.label}</span>
                {shortcut.count !== undefined && shortcut.count > 0 && (
                  <span className="rounded-[6px] bg-panel-nested px-1.5 text-xs font-semibold tabular-nums">
                    {shortcut.count}
                    <span className="sr-only"> {shortcut.countLabel}</span>
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </section>
      </div>

      {showGettingStarted && profileReady && <GettingStarted steps={gettingStarted} className="mt-5" />}

      <div className="mt-14">
        <DeadlineWeek days={week} />
      </div>

      <section aria-labelledby="untukmu">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex flex-col gap-1">
            <h2 id="untukmu" className="text-2xl">
              Sesuai minatmu
            </h2>
            {profileReady && interestNames.length > 0 && (
              <p className="text-sm text-ink-muted">
                {interestNames.join(', ')}
                {user.educationLevel ? ` · ${EDUCATION_LEVEL_LABEL[user.educationLevel]}` : ''}
              </p>
            )}
          </div>
          <Link href="/events" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold">
            Lihat semua kegiatan <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        {picks.length > 0 ? (
          // Di ponsel tiga kartu cukup — enam kartu bertumpuk = enam layar gulir.
          <div className="max-sm:[&>ul>li:nth-child(n+4)]:hidden">
            <EventGrid events={picks} savedEventIds={[...savedIds]} returnTo="/" />
          </div>
        ) : (
          <EmptyPicks />
        )}
      </section>
    </div>
  );
}

const registerActionClass =
  'hidden min-h-11 shrink-0 items-center gap-1 rounded-sm px-3 text-sm font-semibold hover:bg-panel-nested sm:inline-flex';

/** `cta` null = tanpa formulir StudentFo yang aktif → tautan resmi lewat /daftar di tab baru (ADR-032). */
function RegisterAction({ slug, title, cta }: { slug: string; title: string; cta: RegistrationCta | null }) {
  if (cta === null) {
    return (
      <a href={`/events/${slug}/daftar`} target="_blank" rel="noopener noreferrer nofollow" className={registerActionClass}>
        Daftar <ArrowUpRight aria-hidden className="size-3.5" />
        <span className="sr-only"> ke {title} (tab baru)</span>
      </a>
    );
  }
  if (cta.kind === 'mine') {
    return (
      <Link href={registrationHref(cta.registrationId)} className={registerActionClass}>
        Lihat <ArrowRight aria-hidden className="size-3.5" />
        <span className="sr-only"> pendaftaranmu di {title}</span>
      </Link>
    );
  }
  if (cta.kind === 'open') {
    return (
      <Link href={`/events/${slug}/formulir`} className={registerActionClass}>
        Daftar <ArrowRight aria-hidden className="size-3.5" />
        <span className="sr-only"> ke {title}</span>
      </Link>
    );
  }
  return <span className="hidden shrink-0 px-3 text-sm text-ink-muted sm:inline">{cta.kind === 'full' ? 'Kuota penuh' : 'Ditutup'}</span>;
}

function PaymentRow({ registration }: { registration: EventRegistration }) {
  const action = registration.feeAmount ? `Bayar ${formatRupiah(registration.feeAmount)}` : 'Selesaikan pembayaran';
  return (
    <li>
      <Link href={registrationHref(registration.id)} className="group flex min-h-11 items-center gap-3 py-3">
        <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[6px] bg-highlight-soft px-2 text-xs font-semibold">
          <ReceiptText aria-hidden className="size-3.5" />
          Tagihan
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 font-semibold group-hover:underline">{registration.event.title}</span>
          <span className="truncate text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">{action}</span> · {registration.code}
          </span>
        </span>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </Link>
    </li>
  );
}

function EmptyPicks() {
  return (
    <p className="rounded-card border border-dashed border-line bg-panel px-5 py-8 text-center text-sm text-ink-muted">
      Semua kegiatan yang cocok sudah ada di daftarmu.{' '}
      <Link href="/events" className="font-semibold text-ink underline underline-offset-[3px]">
        Jelajahi jenis lain
      </Link>
      .
    </p>
  );
}
