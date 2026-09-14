import Link from 'next/link';
import { ArrowRight, CalendarClock, Link2, ShieldCheck, Sparkles, TrendingUp, UserPlus } from 'lucide-react';
import { EventGrid } from '@/components/event/event-grid';
import { SearchForm } from '@/components/event/filter-bar';
import { DeadlineRing } from '@/components/event/deadline-ring';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEventRepository } from '@/lib/data';
import { formatDateId } from '@/lib/deadline';
import { parseEventQuery } from '@/lib/search-params';
import { EDUCATION_LEVEL_LABEL, EVENT_TYPE_LABEL } from '@/types/domain';

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

export default async function HomePage() {
  const repository = await getEventRepository();

  const [closingSoon, latest, stats, categories] = await Promise.all([
    repository.listClosingSoon(5),
    repository.listEvents({ ...parseEventQuery({}), sort: 'newest', pageSize: 6 }),
    repository.getStats(),
    repository.listCategories(),
  ]);

  const [heroEvent, ...restClosing] = closingSoon;

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="border-b border-line bg-panel">
        <div className="container-page grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div className="max-w-2xl">
            <Badge variant="brand" className="mb-4">
              <Sparkles aria-hidden className="size-3" />
              {stats.addedThisWeek} kegiatan baru minggu ini
            </Badge>
            <h1 className="text-3xl sm:text-4xl">
              Semua peluang pengembangan diri, di satu halaman.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-ink-soft">
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

          {/* Panel ini mengisi kolom kanan dengan janji produk yang konkret,
              bukan ilustrasi. Di layar sempit ia turun ke bawah hero dan
              tetap terbaca sebagai daftar biasa. */}
          <ul className="flex flex-col gap-4 rounded-card border border-line bg-canvas p-5">
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
        </div>
      </section>

      <div className="container-page py-10">
        {/* ---------- Banner cold-start (§6) ---------- */}
        <div className="mb-10 flex flex-col gap-3 rounded-card border border-line bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <UserPlus aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
            <div>
              <p className="text-sm font-medium">Rekomendasi belum dipersonalisasi</p>
              <p className="text-sm text-ink-muted">
                Saat ini urutan disusun dari yang terbaru dan paling banyak disimpan. Lengkapi jurusan
                dan minatmu untuk urutan yang benar-benar relevan.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link href="/tracker">
              Lengkapi profil <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>

        {/* ---------- Sorotan Minggu Ini (bento) ---------- */}
        {heroEvent && (
          <section aria-labelledby="sorotan" className="mb-12">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 id="sorotan" className="text-2xl">
                Sorotan minggu ini
              </h2>
              <Link
                href="/events?sort=deadline"
                className="text-sm font-medium text-brand-text hover:underline"
              >
                Lihat semua tenggat
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Kartu utama sengaja dibuat jauh lebih besar. Bento grid tanpa
                  perbedaan bobot cuma jadi grid biasa yang ukurannya acak. */}
              <article className="relative flex flex-col justify-between gap-6 rounded-card border border-line bg-panel p-6 shadow-card lg:col-span-2">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <Badge variant="brand">{EVENT_TYPE_LABEL[heroEvent.eventType]}</Badge>
                    <DeadlineRing deadlineAt={heroEvent.primaryDeadlineAt} size={64} />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold leading-snug sm:text-2xl">
                    <Link
                      href={`/events/${heroEvent.slug}`}
                      className="after:absolute after:inset-0 after:content-[''] hover:text-brand-text"
                    >
                      {heroEvent.title}
                    </Link>
                  </h3>
                  <p className="mt-2 text-sm text-ink-muted">{heroEvent.organizer}</p>

                  <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                    <HeroMeta
                      label="Lokasi"
                      value={heroEvent.isOnline ? 'Daring' : (heroEvent.location ?? 'Menyusul')}
                    />
                    <HeroMeta
                      label="Jenjang"
                      value={
                        heroEvent.educationLevels.length > 0
                          ? heroEvent.educationLevels
                              .map((level) => EDUCATION_LEVEL_LABEL[level])
                              .join(', ')
                          : 'Terbuka umum'
                      }
                    />
                    <HeroMeta
                      label="Tenggat"
                      value={
                        heroEvent.primaryDeadlineAt
                          ? formatDateId(heroEvent.primaryDeadlineAt)
                          : 'Belum diumumkan'
                      }
                    />
                  </dl>
                </div>
                <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <TrendingUp aria-hidden className="size-4" />
                  Tenggat paling dekat di antara kegiatan yang masih terbuka
                </p>
              </article>

              <ul className="flex flex-col gap-3">
                {restClosing.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/events/${event.slug}`}
                      className="flex items-center gap-3 rounded-card border border-line bg-panel p-3 transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested/40"
                    >
                      <DeadlineRing deadlineAt={event.primaryDeadlineAt} size={44} />
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-medium">{event.title}</span>
                        <span className="mt-0.5 line-clamp-1 text-xs text-ink-muted">
                          {event.organizer}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------- Jelajah per bidang ---------- */}
        <section aria-labelledby="bidang" className="mb-12">
          <h2 id="bidang" className="mb-4 text-2xl">
            Telusuri per bidang
          </h2>
          <ul className="flex flex-wrap gap-2">
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
        </section>

        {/* ---------- Terbaru ---------- */}
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
            <EventGrid events={latest.items} />
          ) : (
            <p className="text-sm text-ink-muted">Belum ada kegiatan yang tayang.</p>
          )}
        </section>
      </div>
    </>
  );
}

function HeroMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-soft">{value}</dd>
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
