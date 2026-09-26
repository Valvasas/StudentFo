import Link from 'next/link';
import type { ReactNode } from 'react';
import { Bookmark, Search, SearchX } from 'lucide-react';
import { toggleSaveEventAction } from '@/app/tracker/actions';
import { HiddenFilters } from '@/components/event/filter-bar';
import { buildEventHref, type ParsedEventQuery } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import type { EducationLevel } from '@/types/domain';

/**
 * Primitif bersama lima papan daftar (kanvas desain Info Lomba, Beasiswa,
 * Magang, Workshop, Seminar).
 *
 * Kanvasnya memakai tombol berbasis state klien untuk setiap filter. Di
 * sini semuanya tautan + <form method="get"> (AGENTS.md #9): tampilannya
 * sama, tapi setiap kombinasi filter punya URL, tombol back bekerja, dan
 * semuanya tetap berfungsi tanpa JavaScript.
 */

export function Breadcrumb({ current, inverse = false }: { current: string; inverse?: boolean }) {
  return (
    <nav aria-label="Remah roti" className={cn('flex items-center gap-2 text-[13px]', inverse ? 'text-on-inverse-muted' : 'text-ink-muted')}>
      <Link href="/" className={cn('inline-flex min-h-11 items-center', inverse ? 'hover:text-on-inverse' : 'hover:text-ink')}>
        Beranda
      </Link>
      <span aria-hidden>/</span>
      <span aria-current="page" className={inverse ? 'text-on-inverse' : 'text-ink'}>
        {current}
      </span>
    </nav>
  );
}

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn('text-[clamp(36px,6vw,52px)] leading-none tracking-[-0.045em]', className)}>{children}</h1>
  );
}

/** Kotak cari. Label & tombol "Cari" dipertahankan (dipakai pembaca layar dan tes tanpa-JS). */
export function SearchBox({
  query,
  placeholder,
  size = 'md',
  omit,
}: {
  query: ParsedEventQuery;
  placeholder: string;
  size?: 'md' | 'lg';
  omit?: readonly string[];
}) {
  const large = size === 'lg';
  return (
    <form action="/events" method="get" role="search" className="relative flex min-w-0 flex-1 items-center">
      <HiddenFilters query={query} omit={omit} />
      <Search aria-hidden className={cn('pointer-events-none absolute text-ink-muted', large ? 'left-3.5 size-[18px]' : 'left-3 size-4')} />
      <input
        type="search"
        name="q"
        defaultValue={query.search}
        maxLength={120}
        placeholder={placeholder}
        aria-label="Kata kunci pencarian"
        className={cn(
          'w-full min-w-0 bg-transparent text-base text-ink placeholder:text-ink-faint',
          large
            ? 'h-12 rounded-sm pl-11 pr-20 focus-visible:outline-2 focus-visible:outline-focus'
            : 'h-11 rounded-sm border border-line-strong/70 bg-panel pl-9 pr-16 transition-colors duration-150 ease-snap hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
      />
      <button
        type="submit"
        className={cn(
          'absolute right-1 flex min-h-9 items-center rounded-[6px] px-3 text-[13px] font-semibold transition-colors duration-150 ease-snap after:absolute after:-inset-y-1 after:inset-x-0 after:content-[""]',
          large ? 'right-1.5 bg-brand text-on-brand hover:bg-brand-hover' : 'text-ink-muted hover:bg-panel-nested hover:text-ink',
        )}
      >
        Cari
      </button>
    </form>
  );
}

export interface SegmentItem {
  readonly label: string;
  readonly href: string;
  readonly active: boolean;
}

/** Kontrol bersegmen berbasis tautan (kanvas: jenjang, urutan, mode). */
export function SegmentLinks({
  items,
  label,
  inverse = false,
  className,
  stretch = false,
}: {
  items: readonly SegmentItem[];
  label: string;
  inverse?: boolean;
  className?: string;
  stretch?: boolean;
}) {
  return (
    <nav aria-label={label} className={cn('flex gap-0.5 rounded-sm p-[3px]', inverse ? 'bg-inverse-nested' : 'bg-panel-nested', className)}>
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          scroll={false}
          aria-current={item.active ? 'true' : undefined}
          className={cn(
            'flex min-h-11 items-center justify-center whitespace-nowrap rounded-[6px] px-3 text-[13.5px] font-medium transition-colors duration-150 ease-snap sm:min-h-9',
            'relative sm:after:absolute sm:after:inset-x-0 sm:after:-inset-y-1 sm:after:content-[""]',
            stretch && 'flex-1',
            item.active
              ? inverse
                ? 'bg-on-inverse text-inverse'
                : 'bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,.1)]'
              : inverse
                ? 'text-on-inverse-muted hover:text-on-inverse'
                : 'text-ink-muted hover:text-ink',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function ChipLink({
  href,
  active,
  children,
  inverse = false,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  inverse?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'relative inline-flex h-9 items-center gap-[7px] rounded-sm border px-3 text-[13.5px] font-medium transition-colors duration-150 ease-snap',
        'after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]',
        active
          ? inverse
            ? 'border-on-inverse bg-on-inverse text-inverse'
            : 'border-brand bg-brand text-on-brand'
          : inverse
            ? 'border-white/25 text-on-inverse hover:border-white/60'
            : 'border-line bg-panel text-ink hover:border-line-strong',
      )}
    >
      {children}
    </Link>
  );
}

/** Sakelar filter (kanvas: "Hanya yang gratis"). Tautan, jadi statusnya diumumkan lewat teks tersembunyi. */
export function ToggleLink({ href, on, children, inverse = false }: { href: string; on: boolean; children: ReactNode; inverse?: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        'flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-[13.5px] font-medium transition-colors duration-150 ease-snap',
        inverse ? 'text-on-inverse hover:bg-inverse-nested' : 'hover:bg-panel-nested',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative h-[18px] w-[30px] shrink-0 rounded-[9px] transition-colors duration-200',
          on ? (inverse ? 'bg-on-inverse' : 'bg-brand') : inverse ? 'bg-white/25' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 size-3.5 rounded-pill shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-transform duration-200',
            on ? 'translate-x-3' : '',
            inverse && on ? 'bg-inverse' : 'bg-white',
          )}
        />
      </span>
      {children}
      <span className="sr-only">{on ? '(aktif)' : '(nonaktif)'}</span>
    </Link>
  );
}

/** Tombol simpan ikon (Server Action, tetap jalan tanpa JS). Di atas tautan kartu yang direntangkan. */
export function SaveToggle({ eventId, isSaved, returnTo, className }: { eventId: string; isSaved: boolean; returnTo: string; className?: string }) {
  return (
    <form action={toggleSaveEventAction} className={cn('relative z-10', className)}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        aria-label={isSaved ? 'Hapus dari simpanan' : 'Simpan kegiatan'}
        className="flex size-11 items-center justify-center rounded-sm text-ink transition-colors duration-150 ease-snap hover:bg-panel-nested"
      >
        <Bookmark aria-hidden className={cn('size-4', isSaved && 'fill-current')} />
      </button>
    </form>
  );
}

export function ResultsEmpty({ description, resetHref, className }: { description: string; resetHref: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong/70 px-6 py-16 text-center', className)}>
      <SearchX aria-hidden className="size-7 text-ink-muted" />
      <h2 className="text-lg font-semibold tracking-[-0.02em]">Belum ada yang cocok</h2>
      <p className="max-w-[44ch] text-[14.5px] leading-relaxed text-ink-muted">{description}</p>
      <Link
        href={resetHref}
        className="mt-2 flex min-h-11 items-center rounded-sm border border-line-strong/70 px-4 text-sm font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested"
      >
        Hapus semua filter
      </Link>
    </div>
  );
}

export interface LevelOption {
  readonly label: string;
  readonly levels: readonly EducationLevel[];
}

export const STUDENT_LEVEL_OPTIONS: readonly LevelOption[] = [
  { label: 'Semua jenjang', levels: [] },
  { label: 'SMA/SMK', levels: ['SMA_SMK'] },
  { label: 'Mahasiswa', levels: ['D3', 'D4_S1', 'S2', 'S3'] },
];

const sameSet = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && [...left].sort().join() === [...right].sort().join();

/** Segmen jenjang: setiap pilihan mengganti seluruh filter `jenjang`, halaman kembali ke 1. */
export function levelSegments(query: ParsedEventQuery, options: readonly LevelOption[] = STUDENT_LEVEL_OPTIONS): SegmentItem[] {
  return options.map((option) => ({
    label: option.label,
    href: buildEventHref(query, { levels: option.levels, page: 1 }),
    active: sameSet(query.levels, option.levels),
  }));
}
