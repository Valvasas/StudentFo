import Link from 'next/link';
import type { ReactNode } from 'react';
import { Hash, Heart, IdCard, Lock, LogOut, MessageCircle, Settings, Ticket, UserRound, Users, type LucideIcon } from 'lucide-react';
import { signOutAction } from '@/app/auth/actions';
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
 */
export function AccountShell({ user, active, children }: { user: AuthUser; active: AccountSection; children: ReactNode }) {
  const { percent } = profileCompleteness(user);
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
    <div className="container-page flex items-start gap-8 pb-10 pt-8">
      <nav aria-label="Menu akun" className="sticky top-[92px] hidden w-[212px] flex-none flex-col gap-6 min-[960px]:flex">
        <Link href="/profile" className="flex flex-col gap-3 rounded-[14px] bg-panel-nested p-3.5 transition-colors duration-200 ease-snap hover:bg-brand-soft">
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="flex size-[38px] shrink-0 items-center justify-center rounded-pill bg-brand text-[13px] font-semibold text-on-brand">
              {initialsOf(user.fullName)}
            </span>
            <span className="flex min-w-0 flex-col gap-px">
              <span className="truncate text-sm font-semibold">{user.fullName}</span>
              <span className="text-xs text-ink-muted">{user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : 'Jenjang belum diisi'}</span>
            </span>
          </span>
          <span className="flex flex-col gap-1.5">
            <span className="flex justify-between text-xs">
              <span className="text-ink-muted">Kelengkapan profil</span>
              <span className="font-semibold">{percent}%</span>
            </span>
            <span aria-hidden className="h-1 overflow-hidden rounded-[2px] bg-line">
              <span className="block h-full rounded-[2px] bg-brand transition-[width] duration-700 ease-enter" style={{ width: `${percent}%` }} />
            </span>
          </span>
        </Link>

        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1.5 font-mono text-[11px] tracking-[.08em] text-ink-muted">{group.title}</span>
            {group.items.map((item) => {
              const on = item.key === active;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-2.5 rounded-[9px] px-2.5 text-sm transition-colors duration-200 ease-snap hover:bg-panel-nested hover:text-ink',
                    on ? 'bg-panel-nested font-semibold text-ink' : 'font-medium text-ink-soft',
                  )}
                >
                  <item.icon aria-hidden className="size-[17px]" />
                  <span className="flex-1">{item.label}</span>
                  {item.unread && (
                    <DemoUnreadCount
                      srSuffix="belum dibaca"
                      className="flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-brand px-1.5 text-[11.5px] font-semibold text-on-brand"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        <form action={signOutAction} className="-mt-2 border-t border-line pt-1">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-sm font-medium text-ink-muted transition-colors duration-200 ease-snap hover:bg-panel-nested hover:text-ink"
          >
            <LogOut aria-hidden className="size-[17px]" />
            Keluar
          </button>
        </form>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
    </div>
  );
}
