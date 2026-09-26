import Link from 'next/link';
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  Hash,
  Heart,
  IdCard,
  Lock,
  LogOut,
  MessageCircle,
  Settings,
  ShieldCheck,
  Ticket,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { signOutAction } from '@/app/auth/actions';
import { DemoUnreadCount } from '@/components/demo/unread-count';
import type { AuthUser } from '@/lib/auth';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { initialsOf } from '@/lib/initials';
import { profileCompleteness } from '@/lib/profile-completeness';

interface MenuItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly badge?: 'saved' | 'unread';
}

/**
 * Menu akun (kanvas desain: dropdown profil).
 *
 * Tetap <details>, bukan dropdown berbasis state klien: navbar ada di setiap
 * halaman, jadi setiap kilobyte JavaScript di sini dibayar berkali-kali, dan
 * menu ini harus tetap bisa dipakai tanpa JavaScript. Konsekuensi yang
 * diterima: menu tidak menutup sendiri saat klik di luar.
 */
export function AccountMenu({ user, savedCount }: { user: AuthUser; savedCount: number }) {
  const { percent } = profileCompleteness(user);

  const groups: readonly (readonly MenuItem[])[] = [
    [
      { href: '/profile', label: 'Profil saya', icon: UserRound },
      { href: '/profile/details', label: 'Data diri', icon: IdCard },
      { href: '/profile/interests', label: 'Peminatan', icon: Heart },
    ],
    [
      { href: '/tracker', label: 'Pendaftaran saya', icon: Ticket },
      { href: '/profile?tab=tersimpan', label: 'Tersimpan', icon: Bookmark, badge: 'saved' },
      ...(demoFeaturesEnabled
        ? [
            { href: '/messages', label: 'Pesan', icon: MessageCircle, badge: 'unread' as const },
            { href: '/discussions', label: 'Ruang diskusi', icon: Hash },
          ]
        : []),
    ],
    [
      { href: '/profile/settings', label: 'Pengaturan', icon: Settings },
      { href: '/profile/privacy', label: 'Privasi & data', icon: Lock },
      ...(user.role === 'ADMIN' ? [{ href: '/admin', label: 'Antrean moderasi', icon: ShieldCheck }] : []),
    ],
  ];

  return (
    <details className="group relative ml-1">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-pill pl-1 pr-1.5 transition-colors duration-150 ease-snap hover:bg-panel-nested group-open:bg-panel-nested [&::-webkit-details-marker]:hidden"
        aria-label={`Menu akun untuk ${user.fullName}`}
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand text-xs font-semibold text-on-brand"
        >
          {initialsOf(user.fullName)}
        </span>
        <ChevronDown aria-hidden className="size-3.5 text-ink-muted transition-transform duration-200 ease-snap group-open:rotate-180" />
      </summary>

      <div className="pop absolute right-0 top-[calc(100%+10px)] z-50 flex max-h-[calc(100dvh-80px)] w-72 max-w-[calc(100vw-32px)] flex-col overflow-y-auto overscroll-contain rounded-modal border border-line bg-panel shadow-overlay">
        <Link href="/profile" className="flex items-center gap-3 p-4 transition-colors duration-150 ease-snap hover:bg-panel-nested">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-brand text-[13px] font-semibold text-on-brand"
          >
            {initialsOf(user.fullName)}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[14.5px] font-semibold">{user.fullName}</span>
            <span className="truncate text-[12.5px] text-ink-muted">{user.major ?? user.email}</span>
          </span>
        </Link>

        {percent < 100 && (
          <Link
            href="/profile/details"
            className="mx-3 mb-2 flex flex-col gap-2 rounded-card bg-panel-nested p-3 transition-colors duration-150 ease-snap hover:bg-brand-soft"
          >
            <span className="flex justify-between gap-2 text-[12.5px]">
              <span className="text-ink-soft">Profil {percent}% lengkap</span>
              <span className="flex items-center gap-1 font-semibold">
                Lengkapi <ArrowRight aria-hidden className="size-3" />
              </span>
            </span>
            <span aria-hidden className="block h-1 overflow-hidden rounded-pill bg-line">
              <span className="block h-full rounded-pill bg-brand" style={{ width: `${percent}%` }} />
            </span>
          </Link>
        )}

        {groups.map((items, index) => (
          <div key={index} className="flex flex-col border-t border-line p-1.5">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-11 items-center gap-2.5 rounded-sm px-2.5 text-sm font-medium transition-colors duration-150 ease-snap hover:bg-panel-nested"
              >
                <item.icon aria-hidden className="size-[17px]" />
                <span className="flex-1">{item.label}</span>
                {item.badge === 'saved' && savedCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-panel-nested px-1.5 text-[11.5px] font-semibold text-ink-soft">
                    {savedCount}
                  </span>
                )}
                {item.badge === 'unread' && (
                  <DemoUnreadCount
                    srSuffix="belum dibaca"
                    className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-brand px-1.5 text-[11.5px] font-semibold text-on-brand"
                  />
                )}
              </Link>
            ))}
          </div>
        ))}

        {/* Keluar WAJIB lewat POST (Server Action), bukan tautan biasa.
            Dengan <a href="/logout">, prefetch peramban atau sebuah <img>
            di situs lain sudah cukup untuk mengeluarkan orang dari akunnya. */}
        <form action={signOutAction} className="border-t border-line p-1.5">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm font-medium text-ink-muted transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
          >
            <LogOut aria-hidden className="size-[17px]" />
            Keluar
          </button>
        </form>
      </div>
    </details>
  );
}
