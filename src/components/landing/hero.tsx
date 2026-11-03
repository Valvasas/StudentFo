import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { SearchShortcutHint } from '@/components/ui/search-shortcut';

export interface HeroLink {
  readonly label: string;
  readonly href: string;
  /** Jumlah yang masih buka; `null` = tidak diketahui (gagal dimuat) atau nol — angkanya tidak ditampilkan. */
  readonly count?: number | null;
}

/**
 * Hero beranda tamu, berpusat pada pencarian (ADR-061). Halaman ini adalah
 * katalog, jadi layar pertama harus sudah bisa DIPAKAI: kotak cari, jenis
 * kegiatan beserta jumlah yang masih buka, dan jalan pintas untuk pertanyaan
 * pertama pelajar ("untuk jenjangku?", "gratis?"). Sebelumnya layar pertama
 * berisi judul + dua tombol — kerangka template pemasaran yang menunda isi
 * satu ketukan lagi. Semuanya `<form method="get">` + tautan: jalan tanpa JS.
 */
export function LandingHero({ types, shortcuts }: { types: readonly HeroLink[]; shortcuts: readonly HeroLink[] }) {
  return (
    <section aria-labelledby="hero-title" className="container-page max-w-[1120px] pt-[clamp(40px,7vw,92px)]">
      <div className="enter flex max-w-[860px] flex-col [animation-duration:700ms]">
        <h1 id="hero-title" className="max-w-[19ch] text-[clamp(36px,5.8vw,62px)] leading-[1.04] tracking-[-0.042em]">
          Cari lomba, beasiswa, dan magang yang <span className="marker">masih buka</span>.
        </h1>
        <p className="mt-5 max-w-[56ch] text-[clamp(16px,1.9vw,18.5px)] leading-relaxed text-ink-muted">
          Satu katalog untuk siswa SMA/SMK dan mahasiswa. Setiap kegiatan dicek ke sumber resminya sebelum tayang, lengkap
          dengan sisa waktu pendaftarannya.
        </p>

        <form action="/events" method="get" role="search" className="mt-8 flex w-full flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              name="q"
              maxLength={120}
              placeholder="Coba “lomba debat”"
              aria-label="Kata kunci pencarian"
              aria-keyshortcuts="/"
              data-search-shortcut=""
              className="field-control peer h-14 w-full rounded-card border border-line-strong/70 bg-panel pl-12 pr-4 text-[17px] text-ink shadow-card transition-colors duration-150 ease-snap placeholder:text-ink-faint hover:border-line-strong pointer-fine:pr-14"
            />
            <SearchShortcutHint className="absolute right-4 top-1/2 -translate-y-1/2" />
          </div>
          <button
            type="submit"
            className="flex h-14 items-center justify-center rounded-card bg-brand px-8 text-base font-semibold text-on-brand transition-colors duration-150 ease-snap hover:bg-brand-hover"
          >
            Cari
          </button>
        </form>

        <nav aria-label="Jelajahi per jenis" className="mt-5 flex flex-wrap items-center gap-2">
          {types.map((type, index) => (
            <Link
              key={type.href}
              href={type.href}
              style={{ '--i': index } as CSSProperties}
              className="rise inline-flex min-h-11 items-center gap-2 rounded-pill border border-line bg-panel px-4 text-[14.5px] font-medium transition-colors duration-150 ease-snap hover:border-line-strong hover:bg-panel-nested"
            >
              {type.label}
              {type.count ? (
                <span className="tabular-nums text-ink-muted">
                  {type.count.toLocaleString('id-ID')}
                  <span className="sr-only"> masih buka</span>
                </span>
              ) : null}
            </Link>
          ))}
          <Link
            href="/events"
            className="group inline-flex min-h-11 items-center gap-1.5 px-2 text-[14.5px] font-semibold text-ink-soft transition-colors duration-150 ease-snap hover:text-ink"
          >
            Jelajahi kegiatan
            <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
          </Link>
        </nav>

        <p className="mt-2 flex flex-wrap items-center gap-x-4 text-[14px] text-ink-muted">
          <span>Langsung ke</span>
          {shortcuts.map((shortcut) => (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className="inline-flex min-h-11 items-center font-medium text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors duration-150 ease-snap hover:text-ink hover:decoration-current"
            >
              {shortcut.label}
            </Link>
          ))}
        </p>
      </div>
    </section>
  );
}
