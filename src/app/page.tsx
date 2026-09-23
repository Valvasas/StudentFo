import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  CalendarClock,
  GraduationCap,
  Heart,
  Link2,
  Presentation,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { DeadlineRing } from '@/components/event/deadline-ring';
import { DeadlineTicker } from '@/components/event/deadline-ticker';
import { DeadlineWeek } from '@/components/event/deadline-week';
import { EventGrid } from '@/components/event/event-grid';
import { SearchForm } from '@/components/event/filter-bar';
import { SaveButton } from '@/components/event/save-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionUser, isProfileComplete } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { formatDateId } from '@/lib/deadline';
import { parseEventQuery } from '@/lib/search-params';
import {
  EDUCATION_LEVEL_LABEL,
  EVENT_TYPE_LABEL,
  type EventType,
  EVENT_TYPES,
} from '@/types/domain';

/**
 * Beranda dirender dinamis, bukan statis.
 *
 * Alasannya tunggal tapi menentukan: setiap label "H-5" di halaman ini
 * dihitung dari waktu request. Halaman statis akan menyajikan hitungan
 * mundur yang membeku di waktu build — persis kesalahan yang dilarang
 * Blueprint §5.1.
 */
export const dynamic = 'force-dynamic';

const PROMISES = [
  {
    icon: ShieldCheck,
    title: 'Diverifikasi manusia',
    detail: 'Setiap entri ditinjau sebelum tayang, bukan langsung dari mesin.',
  },
  {
    icon: CalendarClock,
    title: 'Sisa waktu selalu terbaru',
    detail: 'Hitungan hari dihitung ulang tiap kunjungan, dalam zona waktu WIB.',
  },
  {
    icon: Link2,
    title: 'Sumber selalu dicantumkan',
    detail: 'Bisa dicek langsung ke pengumuman asli penyelenggara.',
  },
] as const;

/**
 * Ikon per jenis kegiatan. Sengaja dipetakan eksplisit, bukan diambil dari
 * daftar ikon acak: ikonnya jadi bagian dari kosakata visual produk, dan
 * pengguna belajar "piala = lomba" setelah beberapa kunjungan. Ikon yang
 * berganti-ganti antar rilis menghapus hafalan itu.
 */
const TYPE_ICON: Record<EventType, typeof Trophy> = {
  LOMBA: Trophy,
  BEASISWA: GraduationCap,
  MAGANG: Briefcase,
  WORKSHOP: Presentation,
  KONFERENSI: Users,
  PELATIHAN: BookOpen,
  VOLUNTEER: Heart,
};

export default async function HomePage() {
  const user = await getSessionUser();
  const repository = await getEventRepository();
  const profile = user ? { educationLevel: user.educationLevel, interests: user.interests } : null;

  const [closingSoon, latest, stats, categories, savedEventIds, deadlineWeek] = await Promise.all([
    repository.listClosingSoon(6),
    repository.listEvents({ ...parseEventQuery({}), sort: 'newest', pageSize: 6, profile }),
    repository.getStats(),
    repository.listCategories(),
    user ? repository.listSavedEventIds(user.id) : Promise.resolve([]),
    repository.getDeadlineWeek(),
  ]);

  const [heroEvent, ...restClosing] = closingSoon;
  const isHeroSaved = heroEvent ? savedEventIds.includes(heroEvent.id) : false;

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="border-b border-line bg-brand-soft">
        <div className="container-page grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="max-w-2xl">
            <Badge variant="brand" className="mb-4">
              <Sparkles aria-hidden className="size-3" />
              {stats.addedThisWeek} kegiatan baru minggu ini
            </Badge>
            <h1 className="text-4xl sm:text-5xl">
              Semua peluang pengembangan diri, di satu halaman.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-ink-soft">
              Lomba, beasiswa, magang, sampai workshop — dikumpulkan dari sumber publik, diverifikasi
              manual, dan selalu menampilkan sisa waktu pendaftarannya. Berhenti berburu info di
              belasan grup.
            </p>

            <div className="mt-6 max-w-xl">
              <SearchForm query={parseEventQuery({})} />
            </div>

            <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="Kegiatan aktif" value={stats.totalActive} />
              <Stat label="Tutup minggu ini" value={stats.closingThisWeek} />
              <Stat label="Penyelenggara" value={stats.organizerCount} />
            </dl>
          </div>

          {/* Panel sorotan. Kolom kanan hero diisi SATU kegiatan konkret dengan
              tenggat terdekat, bukan ilustrasi: pengguna yang baru mendarat
              langsung melihat contoh isi produk, lengkap dengan sisa waktunya. */}
          {heroEvent && (
            <article className="rounded-card border border-line bg-panel p-5 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <Badge variant="brand">{EVENT_TYPE_LABEL[heroEvent.eventType]}</Badge>
                <DeadlineRing deadlineAt={heroEvent.primaryDeadlineAt} size={56} />
              </div>

              <h2 className="mt-4 text-lg font-semibold leading-snug">
                <Link href={`/events/${heroEvent.slug}`} className="hover:text-brand-text">
                  {heroEvent.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-ink-muted">{heroEvent.organizer}</p>

              <dl className="mt-4 border-t border-line">
                <HeroFact
                  label="Jenjang"
                  value={
                    heroEvent.educationLevels.length > 0
                      ? heroEvent.educationLevels
                          .map((level) => EDUCATION_LEVEL_LABEL[level])
                          .join(', ')
                      : 'Terbuka umum'
                  }
                />
                <HeroFact
                  label="Lokasi"
                  value={heroEvent.isOnline ? 'Daring' : (heroEvent.location ?? 'Menyusul')}
                />
                <HeroFact
                  label="Tenggat"
                  value={
                    heroEvent.primaryDeadlineAt
                      ? formatDateId(heroEvent.primaryDeadlineAt)
                      : 'Belum diumumkan'
                  }
                />
              </dl>

              <div className="mt-4 flex flex-col gap-2">
                <Button asChild size="sm">
                  <Link href={`/events/${heroEvent.slug}`}>
                    Lihat detail <ArrowUpRight aria-hidden />
                  </Link>
                </Button>
                <SaveButton
                  eventId={heroEvent.id}
                  isSaved={isHeroSaved}
                  returnTo="/"
                  variant="full"
                />
              </div>
            </article>
          )}
        </div>
      </section>

      <DeadlineTicker events={closingSoon} />

      <div className="container-page py-10">
        {/* ---------- Banner cold-start (§6) ----------
            Hilang begitu jenjang & minat terisi. Banner yang tetap muncul
            setelah pengguna menuruti ajakannya membuat produk terasa tidak
            mencatat apa pun yang baru saja dikerjakan. */}
        {!isProfileComplete(user) && (
          <div className="mb-10 flex flex-col gap-3 rounded-card border border-line bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <UserPlus aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
              <div>
                <p className="text-sm font-medium">Urutan ini belum disesuaikan denganmu</p>
                <p className="text-sm text-ink-muted">
                  Saat ini kegiatan diurutkan dari yang terbaru dan paling banyak disimpan. Isi
                  jenjang dan bidang minatmu supaya kami tahu apa yang layak ditaruh di atas.
                </p>
              </div>
            </div>
            <Button asChild variant="secondary" size="sm" className="shrink-0">
              <Link href={user ? '/profile' : '/register'}>
                {user ? 'Lengkapi profil' : 'Buat akun gratis'} <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        )}

        <DeadlineWeek days={deadlineWeek} />

        {/* ---------- Segera ditutup ---------- */}
        {restClosing.length > 0 && (
          <section aria-labelledby="segera-ditutup" className="mb-12">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 id="segera-ditutup" className="text-2xl">
                Segera ditutup
              </h2>
              <Link
                href="/events?sort=deadline"
                className="text-sm font-medium text-brand-text hover:underline"
              >
                Lihat semua tenggat
              </Link>
            </div>

            <ul className="border-t border-line">
              {restClosing.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/events/${event.slug}`}
                    className="flex items-center gap-4 border-b border-line py-3 transition-colors duration-150 ease-snap hover:bg-panel-nested/50"
                  >
                    <DeadlineRing deadlineAt={event.primaryDeadlineAt} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-medium">{event.title}</span>
                      <span className="mt-0.5 line-clamp-1 text-xs text-ink-muted">
                        {event.organizer}
                      </span>
                    </span>
                    <span className="hidden w-28 shrink-0 text-sm text-ink-muted sm:block">
                      {EVENT_TYPE_LABEL[event.eventType]}
                    </span>
                    <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- Jelajah per jenis ---------- */}
        <section aria-labelledby="jenis" className="mb-12">
          <div className="mb-4">
            <h2 id="jenis" className="text-2xl">
              Jelajahi
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Pilih jenis peluang untuk menyaring daftar kegiatan.
            </p>
          </div>

          <ul className="grid gap-3 xs:grid-cols-2 lg:grid-cols-4">
            {EVENT_TYPES.map((type) => {
              const Icon = TYPE_ICON[type];
              return (
                <li key={type}>
                  <Link
                    href={`/events?type=${type}`}
                    className="flex min-h-16 items-center gap-3 rounded-card border border-line bg-panel p-4 transition-colors duration-150 ease-snap hover:border-brand hover:bg-brand-soft"
                  >
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-brand-text"
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="text-sm font-medium">{EVENT_TYPE_LABEL[type]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {categories.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/events?kategori=${category.slug}`}
                    className="inline-flex min-h-9 items-center rounded-pill border border-line bg-panel px-3 text-sm text-ink-soft transition-colors duration-150 ease-snap hover:border-brand hover:text-brand-text"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- Terbaru + kredibilitas ---------- */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section aria-labelledby="terbaru">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 id="terbaru" className="text-2xl">
                Baru ditambahkan
              </h2>
              <Link href="/events" className="text-sm font-medium text-brand-text hover:underline">
                Jelajahi semua
              </Link>
            </div>
            {latest.items.length > 0 ? (
              <EventGrid events={latest.items} savedEventIds={savedEventIds} returnTo="/" />
            ) : (
              <p className="text-sm text-ink-muted">Belum ada kegiatan yang tayang.</p>
            )}
          </section>

          <aside className="rounded-card border border-line bg-panel p-5">
            <h2 className="font-display text-base font-semibold">
              Kenapa info di sini bisa dipercaya
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {PROMISES.map((promise) => (
                <li key={promise.title} className="flex gap-3">
                  <promise.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                  <div>
                    <p className="text-sm font-medium">{promise.title}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">{promise.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-line pt-4 text-xs text-ink-muted">
              Menemukan info yang keliru? Laporkan lewat tautan sumber di halaman detail. Tahu
              kegiatan yang belum ada di sini?{' '}
              <Link href="/submit" className="font-medium text-brand-text hover:underline">
                Kirim kegiatan
              </Link>
              .
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-display text-2xl font-semibold tabular-nums">
        {value.toLocaleString('id-ID')}
      </dd>
    </div>
  );
}
