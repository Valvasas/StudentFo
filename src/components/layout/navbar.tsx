import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { AccountMenu } from '@/components/layout/account-menu';
import { NavLinks, type NavItem } from '@/components/layout/nav-links';
import { NotificationMenu } from '@/components/layout/notification-menu';
import { ThemeToggle } from '@/components/layout/theme-toggle';

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
const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Beranda', locked: false },
  { href: '/events', label: 'Jelajahi', locked: false },
  { href: '/teams', label: 'Tim', locked: false },
  { href: '/tracker', label: 'Tracker', locked: true },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-sm">
      {/* Di bawah `md` tab pindah ke baris kedua. Satu baris berisi logo +
          4 tab + lonceng + tema + tombol akun butuh ±570px — di ponsel 412px
          seluruh halaman jadi bisa digeser ke samping (ditangkap
          tests/a11y). Urutan DOM tetap logo → tab → aksi supaya urutan fokus
          keyboard sama di semua lebar; hanya `order` visual yang berubah. */}
      <div className="container-page flex flex-wrap items-center gap-x-4 md:h-16 md:flex-nowrap">
        {/* Di bawah 360px kata "StudentFo" disembunyikan dan menyisakan
            lambangnya saja supaya baris pertama tetap muat. */}
        <Link
          href="/"
          className="order-1 flex h-14 shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-tight md:h-auto"
        >
          <GraduationCap aria-hidden className="size-7 shrink-0 text-brand" />
          <span className="hidden xs:inline">
            Student<span className="text-brand-text">Fo</span>
          </span>
          <span className="sr-only xs:hidden">StudentFo</span>
        </Link>

        <nav
          aria-label="Navigasi utama"
          className="order-3 -mx-2 flex w-full items-center gap-0.5 md:order-2 md:mx-0 md:ml-auto md:w-auto md:gap-1"
        >
          <NavLinks items={NAV_ITEMS} />
        </nav>

        <div className="order-2 ml-auto flex items-center gap-0.5 sm:gap-1 md:order-3 md:ml-0">
          <NotificationMenu />
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
