import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Building2,
  Heart,
  type LucideIcon,
  Send,
  ShieldCheck,
  Ticket,
  UsersRound,
} from 'lucide-react';
import { DeadlineTag } from '@/components/event/deadline-tag';
import { DeadlineWeek } from '@/components/event/deadline-week';
import { EventGrid } from '@/components/event/event-grid';
import { SearchBox } from '@/components/listing/listing-ui';
import { CalendarSketch } from '@/components/ui/illustrations';
import { HandNote } from '@/components/ui/sketch';
import { type AuthUser, isProfileComplete } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { withFallback } from '@/lib/fallback';
import { firstNameOf, greetingFor, todayLabel } from '@/lib/greeting';
import { parseEventQuery } from '@/lib/search-params';
import { needsActionSoon } from '@/lib/tracker-progress';
import { EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL, type TrackerStatus } from '@/types/domain';

const ACTION_LIMIT = 5;

interface Shortcut {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly note?: string;
}
const RECOMMENDATION_LIMIT = 6;

/**
 * Beranda untuk pengguna yang sudah masuk (ADR-053).
 *
 * Sebelumnya `/` menampilkan halaman pemasaran yang sama untuk semua orang —
 * pengguna yang sudah punya akun disambut "Buat akun dalam satu menit" dan
 * harus menggali menu untuk tahu apa yang perlu ia kerjakan. Halaman ini
 * menjawab tiga pertanyaan orang yang kembali, berurutan menurut urgensi:
 * (1) apa yang tutup sebentar lagi dari incaranku, (2) bagaimana posisi
 * pendaftaranku, (3) apa yang baru dan cocok untukku.
 *
 * Semua data lewat repository yang sama dengan halaman lain; tidak ada
 * aturan baru — "perlu tindakan" = `needsActionSoon` (papan Pendaftaran),
 * "sesuai minatmu" = urutan `relevance` yang sama dengan /events.
 */
export async function PersonalHome({ user }: { user: AuthUser }) {
  const repository = await getEventRepository();
  const now = new Date();
  const [tracker, saved, recommended, week, categories, organizer] = await Promise.all([
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
    // Pendukung, bukan inti: satu tabel penyelenggara yang bermasalah tidak
    // boleh menjatuhkan beranda SEMUA pengguna — paling buruk pintasan studio
    // tidak tampil (ADR-047).
    withFallback('profil penyelenggara', () => repository.getOrganizerProfile(user.id), null),
  ]);

  const trackedIds = new Set(tracker.map((item) => item.eventId));
  const savedIds = new Set(saved.map((event) => event.id));
  // Simpanan (penanda) dan baris tracker "Disimpan" sama-sama berarti "belum
  // didaftar"; satu kegiatan yang ada di keduanya cukup muncul sekali.
  const actions = needsActionSoon(
    [
      ...tracker,
      ...saved.filter((event) => !trackedIds.has(event.id)).map((event) => ({ status: 'SAVED' as TrackerStatus, event })),
    ],
    now,
  ).slice(0, ACTION_LIMIT);
  const picks = recommended.items.filter((event) => !trackedIds.has(event.id) && !savedIds.has(event.id)).slice(0, RECOMMENDATION_LIMIT);

  const counts = {
    watched: tracker.length,
    // Label & hitungan sengaja berbeda dari kolom papan Pendaftaran ("Sudah
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

  // Pintasan peran (moderator, penyelenggara) didahulukan selebar penuh: bagi
  // mereka itulah pekerjaan utamanya, bukan pintasan kelima yang terpotong.
  const roleShortcuts: Shortcut[] = [
    ...(user.role === 'ADMIN' ? [{ href: '/admin', label: 'Buka antrean moderasi', icon: ShieldCheck }] : []),
    ...(organizer?.status === 'VERIFIED' ? [{ href: '/penyelenggara', label: 'Buka studio penyelenggara', icon: Building2 }] : []),
  ];
  const shortcuts: Shortcut[] = [
    { href: '/tracker', label: 'Pendaftaran', icon: Ticket },
    { href: '/profile?tab=tersimpan', label: 'Tersimpan', icon: Bookmark, note: saved.length > 0 ? String(saved.length) : undefined },
    { href: '/teams', label: 'Cari tim', icon: UsersRound },
    { href: '/submit', label: 'Kirim kegiatan', icon: Send },
  ];

  return (
    <div className="container-page pb-8 pt-8 sm:pt-12">
      <header className="enter flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          <HandNote className="self-start text-[19px] text-ink-muted">{todayLabel(now)}</HandNote>
          <h1 className="text-[clamp(32px,5vw,48px)] leading-[1.05]">
            {greetingFor(now)}, <span className="marker">{firstNameOf(user.fullName)}</span>.
          </h1>
          <p className="text-[17px] leading-relaxed text-ink-muted">
            {actions.length > 0
              ? `${actions.length} kegiatan incaranmu tutup dalam 7 hari. Selesaikan pendaftarannya dulu, ya.`
              : 'Tidak ada tenggat mendesak di daftarmu. Waktu yang pas untuk mencari peluang baru.'}
          </p>
        </div>
        <div className="flex w-full lg:max-w-md">
          <SearchBox query={parseEventQuery({})} placeholder="Cari lomba, beasiswa, magang…" />
        </div>
      </header>

      {!profileReady && (
        <Link
          href="/profile/interests"
          className="sketch-box mt-8 flex items-center gap-4 bg-panel px-5 py-4 transition-colors duration-150 ease-snap hover:bg-panel-nested"
        >
          <Heart aria-hidden className="size-5 shrink-0" />
          <span className="flex flex-1 flex-col">
            <span className="font-semibold">Pilih minat & jenjangmu</span>
            <span className="text-sm text-ink-muted">
              Dua isian ini yang menentukan urutan &ldquo;Sesuai minatmu&rdquo; dan pengingat yang kamu terima.
            </span>
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0" />
        </Link>
      )}

      <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section aria-labelledby="perlu-tindakan" className="rounded-panel border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="perlu-tindakan" className="text-xl">
              Perlu tindakan
            </h2>
            <Link href="/tracker" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink">
              Papan pendaftaran <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>
          <p className="text-sm text-ink-muted">Incaranmu yang belum didaftar dan tutup ≤ 7 hari lagi.</p>
          {actions.length > 0 ? (
            <ul className="mt-4 flex flex-col divide-y divide-line border-t border-line">
              {actions.map(({ item }) => (
                <li key={item.event.id} className="flex items-center gap-3 py-3">
                  <DeadlineTag deadlineAt={item.event.primaryDeadlineAt} className="shrink-0" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link href={`/events/${item.event.slug}`} className="truncate font-semibold hover:underline">
                      {item.event.title}
                    </Link>
                    <span className="truncate text-[13px] text-ink-muted">
                      {EVENT_TYPE_LABEL[item.event.eventType]} · {item.event.organizer}
                    </span>
                  </span>
                  <a
                    href={`/events/${item.event.slug}/daftar`}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="hidden min-h-11 shrink-0 items-center gap-1 rounded-sm px-3 text-sm font-semibold hover:bg-panel-nested sm:inline-flex"
                  >
                    Daftar <ArrowUpRight aria-hidden className="size-3.5" />
                    <span className="sr-only"> ke {item.event.title} (tab baru)</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-card bg-panel-nested px-4 py-6 text-center sm:flex-row sm:gap-5 sm:text-left">
              <CalendarSketch className="h-[84px] w-[105px] text-ink-soft sm:h-[112px] sm:w-[140px]" />
              <div className="flex flex-col gap-1">
                <p className="font-semibold">Aman, tidak ada yang mepet.</p>
                <p className="text-sm text-ink-muted">
                  Simpan kegiatan yang kamu incar — kalau tenggatnya tinggal seminggu, ia muncul di sini dan di lonceng
                  notifikasi.
                </p>
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="pantauanmu" className="flex flex-col rounded-panel border border-line bg-panel p-5 sm:p-6">
          <h2 id="pantauanmu" className="text-xl">
            Pantauanmu
          </h2>
          {roleShortcuts.map((shortcut) => (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className="mt-4 flex min-h-12 items-center gap-2.5 rounded-sm bg-brand px-4 text-sm font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover"
            >
              <shortcut.icon aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">{shortcut.label}</span>
              <ArrowRight aria-hidden className="size-4 shrink-0" />
            </Link>
          ))}
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
            // Tiga angka nol tidak memberi tahu apa pun; kalimat ini memberi tahu
            // cara mengisinya.
            <p className="mt-2 text-sm text-ink-muted">
              Belum ada kegiatan yang kamu pantau. Tekan ikon simpan{' '}
              <Bookmark aria-hidden className="inline size-3.5 align-[-2px]" /> di kartu kegiatan — ia langsung masuk
              papan Pendaftaran, tempat kamu menandai tahapnya.
            </p>
          )}
          <nav aria-label="Pintasan" className="mt-4 grid grid-cols-2 gap-2">
            {shortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="flex min-h-11 items-center gap-2 rounded-sm border border-line px-3 py-2 text-sm font-medium transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested"
              >
                <shortcut.icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 truncate">{shortcut.label}</span>
                {shortcut.note && (
                  <span className="rounded-[6px] bg-panel-nested px-1.5 text-xs font-semibold tabular-nums">{shortcut.note}</span>
                )}
              </Link>
            ))}
          </nav>
        </section>
      </div>

      <div className="mt-14">
        <DeadlineWeek days={week} />
      </div>

      <section aria-labelledby="untukmu">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex flex-col gap-1">
            <h2 id="untukmu" className="text-2xl">
              Sesuai minatmu
            </h2>
            <p className="text-sm text-ink-muted">
              {profileReady
                ? `Diurutkan dari minat ${interestNames.join(', ') || 'pilihanmu'}${
                    user.educationLevel ? ` dan jenjang ${EDUCATION_LEVEL_LABEL[user.educationLevel]}` : ''
                  }, lalu kedekatan tenggat dan kebaruannya.`
                : 'Minat atau jenjangmu belum diisi — sementara ini diurutkan dari yang terbaru, paling banyak disimpan, dan tenggatnya masih sempat dikejar.'}
            </p>
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

