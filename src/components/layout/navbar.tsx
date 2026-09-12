import Link from 'next/link';
import { Compass, LayoutDashboard, ListChecks, Lock } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { cn } from '@/lib/utils';

/**
 * Navigasi utama.
 *
 * Keputusan produk soal tab "Tracker" (Blueprint §8): tab-nya TAMPIL sejak
 * Phase 1, tapi mengarah ke halaman terkunci, bukan disembunyikan. Nav yang
 * berubah-ubah isinya antar fase membuat user harus belajar ulang letak
 * menu; tab terkunci sekaligus jadi kail konversi ke pendaftaran.
 *
 * Kalau nanti diputuskan sebaliknya, ganti satu baris: `phase2: true`.
 */
const NAV_ITEMS = [
  { href: '/', label: 'Beranda', icon: Compass, locked: false },
  { href: '/events', label: 'Jelajahi', icon: LayoutDashboard, locked: false },
  { href: '/tracker', label: 'Tracker', icon: ListChecks, locked: true },
] as const;

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-sm">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        {/* Di bawah 360px kata "StudentFo" disembunyikan dan menyisakan
            lambangnya saja. Tanpa ini, logo + 3 tab + pengalih tema melebihi
            lebar layar dan seluruh halaman bisa digeser ke samping — cacat
            yang membuat teks terpotong di setiap halaman, bukan cuma di sini. */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-sm bg-brand text-sm font-bold text-on-brand"
          >
            SF
          </span>
          <span className="hidden xs:inline">StudentFo</span>
          <span className="sr-only xs:hidden">StudentFo</span>
        </Link>

        <nav aria-label="Navigasi utama" className="flex items-center gap-0.5 sm:gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-card px-2 text-sm font-medium sm:px-3',
                'text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink',
              )}
            >
              <item.icon aria-hidden className="size-4" />
              <span className="hidden sm:inline">{item.label}</span>
              {item.locked && (
                <Lock aria-hidden className="size-3 text-ink-faint" />
              )}
              {item.locked && <span className="sr-only">(perlu masuk)</span>}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
