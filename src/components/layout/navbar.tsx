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
      <div className="container-page flex h-16 items-center justify-between gap-4">
        {/* Di bawah 360px kata "StudentFo" disembunyikan dan menyisakan
            lambangnya saja. Tanpa ini, logo + 3 tab + pengalih tema melebihi
            lebar layar dan seluruh halaman bisa digeser ke samping — cacat
            yang membuat teks terpotong di setiap halaman, bukan cuma di sini. */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-tight"
        >
          <GraduationCap aria-hidden className="size-7 shrink-0 text-brand" />
          <span className="hidden xs:inline">
            Student<span className="text-brand-text">Fo</span>
          </span>
          <span className="sr-only xs:hidden">StudentFo</span>
        </Link>

        <nav aria-label="Navigasi utama" className="flex items-center gap-0.5 sm:gap-1">
          <NavLinks items={NAV_ITEMS} />
          <NotificationMenu />
          <ThemeToggle />
          <AccountMenu />
        </nav>
      </div>
    </header>
  );
}
