import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, BadgeCheck, Bell, CalendarClock, Search } from 'lucide-react';
import { getDeadlineState } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import { EVENT_TYPE_LABEL, type EventSummary } from '@/types/domain';

export interface LandingTypeLink {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  /** Jumlah kegiatan terbuka; null = hitungan gagal diambil (ubin tetap tampil tanpa angka). */
  readonly count: number | null;
}

/**
 * Hero beranda tamu. Pengunjung bisa langsung MENCARI dari sini — kotak cari
 * dan jenis kegiatan ada di layar pertama, karena mencari tidak butuh akun dan
 * meminta daftar sebelum orang melihat isinya adalah gesekan terbesar corong ini.
 *
 * Tumpukan kartu di kanan adalah kegiatan NYATA yang paling dekat tenggatnya
 * (bukan tangkapan antarmuka buatan — ADR-056): hidup karena isinya berubah
 * setiap hari, bukan karena hiasan. Kartunya `aria-hidden` dan bukan tautan;
 * kegiatan yang sama muncul sebagai tautan sungguhan di "Segera ditutup".
 */
export function LandingHero({ deck, types }: { deck: readonly EventSummary[]; types: readonly LandingTypeLink[] }) {
  return (
    <section className="container-page grid max-w-[1180px] items-center gap-x-14 gap-y-10 pt-[clamp(36px,6vw,80px)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
      <div className="enter flex min-w-0 flex-col items-start [animation-duration:700ms]">
        <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-ink-soft">
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inset-0 rounded-pill bg-due-warning" />
            <span className="pulse-ring absolute inset-0 rounded-pill bg-due-warning" />
          </span>
          Gratis untuk siswa SMA/SMK &amp; mahasiswa
        </span>
        <h1 className="mt-5 max-w-[16ch] text-[clamp(36px,6.2vw,62px)] leading-[1.04] tracking-[-0.04em]">
          Lomba, beasiswa, dan magang dari <span className="marker">sumber yang jelas</span>.
        </h1>
        <p className="mt-5 max-w-[50ch] text-[clamp(16px,1.9vw,18.5px)] leading-relaxed text-ink-muted">
          Satu katalog yang ditinjau manusia sebelum tayang — lengkap dengan tautan resmi, syarat, dan sisa waktu pendaftaran
          yang selalu terkini.
        </p>

        {/* GET ke /events: tanpa JavaScript tetap jalan, dan hasilnya punya URL sendiri. */}
        <form action="/events" method="get" role="search" className="mt-7 flex w-full max-w-[560px] items-center gap-2 rounded-[16px] border border-line-strong/70 bg-panel p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.05)] transition-colors duration-150 ease-snap focus-within:border-ink">
          <label htmlFor="hero-q" className="sr-only">
            Cari kegiatan
          </label>
          <Search aria-hidden className="ml-2.5 size-[18px] shrink-0 text-ink-muted" />
          <input
            id="hero-q"
            name="q"
            type="search"
            maxLength={120}
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Coba: beasiswa S1, lomba desain…"
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
          />
          <button
            type="submit"
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-[11px] bg-brand px-4 text-[15px] font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Cari
          </button>
        </form>

        <nav aria-label="Jenis kegiatan" className="mt-4 flex max-w-[560px] flex-wrap gap-2">
          {types.map((type) => (
            <Link
              key={type.key}
              href={type.href}
              className="press inline-flex min-h-11 items-center gap-2 rounded-pill border border-line bg-panel px-4 text-[14px] font-semibold transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested"
            >
              {type.label}
              {type.count !== null && type.count > 0 && (
                <span className="rounded-pill bg-highlight-soft px-1.5 font-mono text-[11.5px] font-medium tabular-nums text-ink">
                  {type.count}
                  <span className="sr-only"> terbuka</span>
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/events"
            className="flex h-12 items-center justify-center gap-2 rounded-sm bg-brand px-[22px] text-[15px] font-semibold text-on-brand transition-colors duration-200 ease-snap hover:bg-brand-hover"
          >
            Jelajahi semua kegiatan
            <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link
            href="#cara-kerja"
            className="press flex h-12 items-center justify-center rounded-sm border border-line-strong/70 px-5 text-[15px] font-semibold transition-colors duration-200 ease-snap hover:bg-panel-nested"
          >
            Lihat cara kerjanya
          </Link>
        </div>
      </div>

      {deck.length > 0 && <HeroDeck events={deck} />}
    </section>
  );
}

const TILT = ['-5deg', '2.5deg', '-1deg'] as const;

/** Tiga kegiatan tenggat terdekat, ditumpuk melayang. Hanya di layar lebar: di ponsel layar pertama milik kotak cari. */
function HeroDeck({ events }: { events: readonly EventSummary[] }) {
  const cards = events.slice(0, 3);
  return (
    <div aria-hidden className="relative hidden h-[470px] select-none lg:block">
      <div className="absolute inset-6 rounded-[28px] bg-panel-nested [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px]" />
      {cards.map((event, index) => {
        const deadline = getDeadlineState(event.primaryDeadlineAt);
        const urgent = deadline.urgency === 'urgent' || deadline.urgency === 'warning';
        return (
          <div
            key={event.id}
            className="drift absolute flex w-[300px] flex-col gap-3 rounded-[18px] border border-line bg-panel p-5 shadow-[0_18px_40px_rgba(0,0,0,.08)]"
            style={
              {
                left: `${[6, 24, 12][index]}%`,
                top: `${[7, 36, 65][index]}%`,
                // Kartu bawah di atas: yang tertutup hanya baris penyelenggara, label jenis & tenggat tiap kartu tetap terbaca.
                zIndex: index + 1,
                '--r0': TILT[index],
                '--r1': `calc(${TILT[index]} + 0.6deg)`,
                '--d': `${index * -1800}ms`,
              } as CSSProperties
            }
          >
            <span className="flex items-center justify-between gap-3 text-[12.5px]">
              <span className="font-semibold text-ink-soft">{EVENT_TYPE_LABEL[event.eventType]}</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 font-mono text-[11.5px] font-medium',
                  urgent ? 'bg-brand text-on-brand' : 'bg-panel-nested text-ink-soft',
                )}
              >
                <CalendarClock className="size-3" />
                {deadline.shortLabel}
              </span>
            </span>
            <span className="line-clamp-2 text-[16px] font-bold leading-snug tracking-[-0.015em]">{event.title}</span>
            <span className="truncate text-[13px] text-ink-muted">{event.organizer}</span>
          </div>
        );
      })}
      <span className="drift absolute right-[2%] top-[4%] z-10 inline-flex items-center gap-1.5 rounded-pill border border-line bg-panel px-3 py-1.5 text-[12.5px] font-semibold shadow-[0_8px_20px_rgba(0,0,0,.06)] [--d:-900ms] [--r0:3deg] [--r1:2deg]">
        <BadgeCheck className="size-3.5" /> Ditinjau moderator
      </span>
      <span className="drift absolute bottom-[6%] right-[6%] z-10 inline-flex items-center gap-1.5 rounded-pill bg-highlight px-3 py-1.5 text-[12.5px] font-semibold text-on-highlight shadow-[0_8px_20px_rgba(0,0,0,.08)] [--d:-2700ms] [--r0:-2deg] [--r1:-3deg]">
        <Bell className="size-3.5" /> Pengingat H-3 &amp; H-1
      </span>
    </div>
  );
}
