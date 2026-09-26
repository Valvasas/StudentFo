import { Suspense } from 'react';
import Link from 'next/link';
import { Bookmark, MessageCircle } from 'lucide-react';
import { DemoUnreadCount } from '@/components/demo/unread-count';
import { AccountMenu } from '@/components/layout/account-menu';
import { NavLinkList, NavLinks } from '@/components/layout/nav-links';
import { NotificationMenu } from '@/components/layout/notification-menu';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { demoFeaturesEnabled } from '@/lib/demo-features';

/**
 * Navigasi utama (kanvas desain `StudentHubNav` + nav Landing v2).
 *
 * Di bawah `md` tab kategori pindah ke baris kedua yang bisa digeser —
 * bukan disembunyikan di menu: halaman daftar adalah tujuan utama produk,
 * jadi harus tetap satu ketukan di ponsel. Urutan DOM tetap logo → tab →
 * aksi supaya urutan fokus keyboard sama di semua lebar; hanya `order`
 * visual yang berubah.
 */
export async function Navbar() {
  const user = await getSessionUser();
  const savedCount = user ? (await (await getEventRepository()).listSavedEventIds(user.id)).length : 0;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/95 backdrop-blur-sm">
      <div className="container-page flex flex-wrap items-center gap-x-6 md:h-16 md:flex-nowrap lg:gap-x-9">
        <Link
          href="/"
          className="order-1 flex h-14 shrink-0 items-center text-[17px] font-bold tracking-[-0.03em] md:h-auto"
        >
          StudentFo
        </Link>

        <nav
          aria-label="Navigasi utama"
          className="order-3 -mx-4 flex w-[calc(100%+2rem)] items-center overflow-x-auto border-t border-line px-1 [scrollbar-width:none] md:order-2 md:mx-0 md:w-auto md:border-t-0 md:px-0"
        >
          <Suspense fallback={<NavLinkList pathname={null} activeKey={null} />}>
            <NavLinks />
          </Suspense>
        </nav>

        <div className="order-2 ml-auto flex items-center gap-0.5 sm:gap-1 md:order-3">
          {user ? (
            <>
              {demoFeaturesEnabled && (
                <Link
                  href="/messages"
                  aria-label="Pesan"
                  className="relative hidden size-11 items-center justify-center rounded-sm text-ink transition-colors duration-150 ease-snap hover:bg-panel-nested sm:flex"
                >
                  <MessageCircle aria-hidden className="size-[18px]" />
                  <DemoUnreadCount
                    srSuffix="belum dibaca"
                    className="absolute right-1 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-pill border-2 border-canvas bg-brand px-1 text-[9.5px] font-bold text-on-brand"
                  />
                </Link>
              )}
              <NotificationMenu />
              <Link
                href="/profile?tab=tersimpan"
                className="hidden min-h-11 items-center gap-2 rounded-sm px-3 text-sm font-medium text-ink transition-colors duration-150 ease-snap hover:bg-panel-nested lg:flex"
              >
                <Bookmark aria-hidden className="size-4" />
                Tersimpan
                <span className="flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-panel-nested px-1.5 text-xs font-semibold">
                  {savedCount}
                </span>
              </Link>
              <ThemeToggle />
              <AccountMenu user={user} savedCount={savedCount} />
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link
                href="/login"
                className="flex min-h-11 items-center rounded-sm px-3 text-sm font-medium text-ink transition-colors duration-150 ease-snap hover:bg-panel-nested"
              >
                Masuk
              </Link>
              <Link
                href="/register"
                className="relative hidden h-9 items-center rounded-sm bg-brand px-4 text-sm font-semibold text-on-brand transition-colors duration-150 ease-snap after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-brand-hover xs:flex"
              >
                Mulai gratis
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
