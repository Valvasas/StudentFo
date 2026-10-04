import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import {
  Hash,
  Heart,
  IdCard,
  Lock,
  LogOut,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Ticket,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { signOutAction } from '@/app/auth/actions';
import { toggleAccountSidebarAction } from '@/app/profile/actions';
import { ACCOUNT_SIDEBAR_COOKIE, isSidebarCollapsed } from '@/lib/account-sidebar';
import { REQUEST_PATH_HEADER } from '@/lib/security-headers';
import { DemoUnreadCount } from '@/components/demo/unread-count';
import type { AuthUser } from '@/lib/auth';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { initialsOf } from '@/lib/initials';
import { profileCompleteness } from '@/lib/profile-completeness';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVEL_LABEL } from '@/types/domain';

export type AccountSection = 'profil' | 'data' | 'minat' | 'pesan' | 'diskusi' | 'daftar' | 'koneksi' | 'pengaturan' | 'privasi';

interface Item {
  readonly key: AccountSection;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly unread?: boolean;
}

/**
 * Kerangka halaman akun (kanvas desain `StudentHubSidebar`): kolom menu
 * 212px yang menempel di kiri, konten di kanan. Di bawah 960px kolom menu
 * disembunyikan — isinya sama persis dengan menu akun di navbar, jadi
 * tidak ada tujuan yang hilang, dan konten tidak terjepit di layar sempit.
 *
 * Bisa dilipat jadi rel ikon 56px (ADR-052) supaya ruang kerja (pesan,
 * pendaftaran, koneksi) lega. Sakelarnya <form> + cookie: keadaan terlipat
 * dirender server sejak awal (tanpa kedip) dan bekerja tanpa JavaScript.
 */
export async function AccountShell({ user, active, children }: { user: AuthUser; active: AccountSection; children: ReactNode }) {
  const { percent } = profileCompleteness(user);
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const collapsed = isSidebarCollapsed(cookieStore.get(ACCOUNT_SIDEBAR_COOKIE)?.value);
  const returnTo = requestHeaders.get(REQUEST_PATH_HEADER) ?? '/profile';
  const groups: readonly { title: string; items: readonly Item[] }[] = [
    {
      title: 'AKUN',
      items: [
        { key: 'profil', label: 'Profil', href: '/profile', icon: UserRound },
        { key: 'data', label: 'Data diri', href: '/profile/details', icon: IdCard },
        { key: 'minat', label: 'Peminatan', href: '/profile/interests', icon: Heart },
      ],
    },
    {
      title: 'AKTIVITAS',
      items: [
        ...(demoFeaturesEnabled
          ? [
              { key: 'pesan' as const, label: 'Pesan', href: '/messages', icon: MessageCircle, unread: true },
              { key: 'diskusi' as const, label: 'Ruang diskusi', href: '/discussions', icon: Hash },
            ]
          : []),
        { key: 'daftar', label: 'Pendaftaran', href: '/tracker', icon: Ticket },
        { key: 'koneksi', label: 'Koneksi', href: '/connections', icon: Users },
      ],
    },
    {
      title: 'LAINNYA',
      items: [
        { key: 'pengaturan', label: 'Pengaturan', href: '/profile/settings', icon: Settings },
        { key: 'privasi', label: 'Privasi & data', href: '/profile/privacy', icon: Lock },
      ],
    },
  ];

  return (
    <div className={cn('container-page flex items-start pb-16 pt-8', collapsed ? 'gap-6' : 'gap-10')}>
      <nav
        aria-label="Menu akun"
        className={cn(
          'sticky top-[92px] hidden flex-none flex-col gap-6 transition-[width] duration-200 ease-snap min-[960px]:flex',
          collapsed ? 'w-14 items-center' : 'w-[212px]',
        )}
      >
        <form action={toggleAccountSidebarAction} className={cn('flex', collapsed ? 'justify-center' : 'justify-end')}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Lebarkan menu akun' : 'Ciutkan menu akun'}
            title={collapsed ? 'Lebarkan menu' : 'Ciutkan menu'}
            className="flex size-11 items-center justify-center rounded-card text-ink-muted transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
          >
            {collapsed ? <PanelLeftOpen aria-hidden className="size-[18px]" /> : <PanelLeftClose aria-hidden className="size-[18px]" />}
          </button>
        </form>

        <Link
          href="/profile"
          aria-label={collapsed ? `Profil ${user.fullName}` : undefined}
          className={cn(
            'flex flex-col gap-3 rounded-[16px] bg-panel-nested transition-colors duration-200 ease-snap hover:bg-brand-soft',
            collapsed ? 'p-1.5' : 'p-3.5',
          )}
        >
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="flex size-[38px] shrink-0 items-center justify-center rounded-pill bg-brand text-[13px] font-semibold text-on-brand">
              {initialsOf(user.fullName)}
            </span>
            {!collapsed && (
              <span className="flex min-w-0 flex-col gap-px">
                <span className="truncate text-sm font-semibold">{user.fullName}</span>
                <span className="text-xs text-ink-muted">{user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : 'Jenjang belum diisi'}</span>
              </span>
            )}
          </span>
          {!collapsed && percent < 100 && (
            <span className="flex flex-col gap-1.5">
              <span className="flex justify-between text-xs">
                <span className="text-ink-muted">Kelengkapan profil</span>
                <span className="font-semibold">{percent}%</span>
              </span>
              <span aria-hidden className="h-1 overflow-hidden rounded-[2px] bg-line">
                <span className="block h-full rounded-[2px] bg-brand transition-[width] duration-700 ease-enter" style={{ width: `${percent}%` }} />
              </span>
            </span>
          )}
        </Link>

        {groups.map((group) => (
          <div key={group.title} className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
            {collapsed ? (
              <span aria-hidden className="mb-1 h-px w-6 bg-line" />
            ) : (
              <span className="hand px-2.5 pb-1 text-[17px] text-ink-muted">{group.title.toLowerCase()}</span>
            )}
            {group.items.map((item) => {
              const on = item.key === active;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'relative flex min-h-11 items-center gap-2.5 rounded-[10px] text-sm transition-colors duration-200 ease-snap hover:bg-panel-nested hover:text-ink',
                    collapsed ? 'size-11 justify-center' : 'px-2.5',
                    on ? 'bg-panel-nested font-semibold text-ink' : 'font-medium text-ink-soft',
                  )}
                >
                  <item.icon aria-hidden className="size-[17px] shrink-0" />
                  <span className={collapsed ? 'sr-only' : 'flex-1'}>{item.label}</span>
                  {item.unread && (
                    <DemoUnreadCount
                      srSuffix="belum dibaca"
                      className={cn(
                        'flex items-center justify-center bg-brand font-semibold text-on-brand',
                        collapsed
                          ? 'absolute right-0.5 top-0.5 h-4 min-w-4 rounded-pill px-1 text-[9.5px]'
                          : 'h-5 min-w-5 rounded-[10px] px-1.5 text-[11.5px]',
                      )}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        <form action={signOutAction} className={cn('-mt-2 border-t border-line pt-1', collapsed && 'w-11')}>
          <button
            type="submit"
            title={collapsed ? 'Keluar' : undefined}
            className={cn(
              'flex min-h-11 w-full items-center gap-2.5 rounded-[10px] text-sm font-medium text-ink-muted transition-colors duration-200 ease-snap hover:bg-panel-nested hover:text-ink',
              collapsed ? 'justify-center' : 'px-2.5',
            )}
          >
            <LogOut aria-hidden className="size-[17px]" />
            <span className={collapsed ? 'sr-only' : undefined}>Keluar</span>
          </button>
        </form>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
    </div>
  );
}
