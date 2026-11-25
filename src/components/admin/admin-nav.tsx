import Link from 'next/link';
import {
  BadgeCheck,
  BarChart3,
  FileStack,
  Flag,
  History,
  Megaphone,
  PenSquare,
  Scale,
  ShieldCheck,
  Trophy,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminSection =
  | 'antrean'
  | 'laporan'
  | 'prestasi'
  | 'penyelenggara'
  | 'riwayat'
  | 'buat'
  | 'postingan'
  | 'promosi'
  | 'pengguna'
  | 'kinerja'
  | 'kalibrasi';

interface AdminItem {
  readonly key: AdminSection;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly primary?: boolean;
}

interface AdminGroup {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly items: readonly AdminItem[];
}

/**
 * Tiga kelompok menurut PEKERJAAN, bukan sembilan tab rata (ADR-093): dulu
 * tugas harian (antrean, laporan), alat konten, dan pengaturan yang jarang
 * disentuh (kalibrasi) berjejer dalam satu rel geser, sehingga admin baru
 * tidak tahu harus mulai dari mana. Riwayat ikut Moderasi: ia catatan dari
 * keputusan yang sama.
 */
export const ADMIN_GROUPS: readonly AdminGroup[] = [
  {
    key: 'moderasi',
    label: 'Moderasi',
    hint: 'Kiriman, laporan, prestasi, dan pengajuan penyelenggara yang menunggu keputusanmu.',
    items: [
      { key: 'antrean', label: 'Antrean moderasi', href: '/admin', icon: ShieldCheck },
      { key: 'laporan', label: 'Laporan', href: '/admin/laporan', icon: Flag },
      { key: 'prestasi', label: 'Prestasi', href: '/admin/prestasi', icon: Trophy },
      { key: 'penyelenggara', label: 'Penyelenggara', href: '/admin/penyelenggara', icon: BadgeCheck },
      { key: 'riwayat', label: 'Riwayat moderasi', href: '/admin/riwayat', icon: History },
    ],
  },
  {
    key: 'postingan',
    label: 'Postingan',
    hint: 'Buat acara StudentFo sendiri, kelola postingan yang tayang, atur lencana & promosi.',
    items: [
      { key: 'buat', label: 'Buat acara StudentFo', href: '/admin/acara/baru', icon: PenSquare, primary: true },
      { key: 'postingan', label: 'Kelola postingan', href: '/admin/acara', icon: FileStack },
      { key: 'promosi', label: 'Lencana & promosi', href: '/admin/promosi', icon: Megaphone },
    ],
  },
  {
    key: 'data',
    label: 'Akun & data',
    hint: 'Akun pengguna, kinerja postingan, dan bobot rekomendasi.',
    items: [
      { key: 'pengguna', label: 'Pengguna', href: '/admin/pengguna', icon: UsersRound },
      { key: 'kinerja', label: 'Kinerja postingan', href: '/admin/kinerja', icon: BarChart3 },
      { key: 'kalibrasi', label: 'Kalibrasi rekomendasi', href: '/admin/kalibrasi', icon: Scale },
    ],
  },
];

/**
 * Navigasi ruang kerja admin, dua tingkat: kelompok (selalu tiga, muat di
 * 320px tanpa geser) lalu alat di kelompok yang aktif. Angka "menunggu"
 * tampil di alatnya DAN dijumlah di kelompok Moderasi supaya terlihat dari
 * halaman mana pun.
 */
export function AdminNav({ active, trustWaiting = 0, reportsOpen = 0 }: { active: AdminSection; trustWaiting?: number; reportsOpen?: number }) {
  const current = ADMIN_GROUPS.find((group) => group.items.some((item) => item.key === active)) ?? ADMIN_GROUPS[0]!;
  const waiting = (key: AdminSection) => (key === 'laporan' ? reportsOpen : key === 'penyelenggara' ? trustWaiting : 0);
  const groupWaiting = (group: AdminGroup) => group.items.reduce((sum, item) => sum + waiting(item.key), 0);

  return (
    <nav aria-label="Ruang kerja admin" className="mb-6 flex flex-col gap-3">
      <ul className="grid grid-cols-3 gap-1 rounded-pill border border-line bg-panel p-1 sm:inline-grid sm:w-auto sm:auto-cols-max sm:grid-flow-col sm:self-start">
        {ADMIN_GROUPS.map((group) => {
          const on = group.key === current.key;
          const count = groupWaiting(group);
          return (
            <li key={group.key} className="min-w-0">
              <Link
                href={group.items[0]!.href}
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'flex h-11 items-center justify-center gap-1.5 rounded-pill px-2 text-center text-[13px] leading-tight transition-colors duration-200 ease-snap sm:px-5 sm:text-[13.5px]',
                  on ? 'bg-brand font-semibold text-on-brand' : 'font-medium text-ink-muted hover:bg-panel-nested hover:text-ink',
                )}
              >
                <span className="min-w-0">{group.label}</span>
                {count > 0 && <CountBadge count={count} inverted={on} />}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <ul className="flex flex-wrap gap-2">
          {current.items.map((item) => {
            const on = item.key === active;
            const count = waiting(item.key);
            return (
              <li key={item.key} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-pill border px-3.5 py-2 text-[13px] transition-colors duration-200 ease-snap',
                    on
                      ? 'border-ink bg-panel font-semibold text-ink'
                      : item.primary
                        ? 'border-highlight bg-highlight-soft font-semibold text-ink hover:border-ink'
                        : 'border-line bg-panel font-medium text-ink-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  <item.icon aria-hidden className="size-4 shrink-0" />
                  <span className="min-w-0">{item.label}</span>
                  {count > 0 && <CountBadge count={count} />}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-[12.5px] text-ink-muted">{current.hint}</p>
      </div>
    </nav>
  );
}

function CountBadge({ count, inverted = false }: { count: number; inverted?: boolean }) {
  return (
    <span
      className={cn(
        'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill px-1.5 text-[11px] font-semibold',
        inverted ? 'bg-on-brand text-brand' : 'bg-highlight text-on-highlight',
      )}
    >
      {count}
      <span className="sr-only"> menunggu</span>
    </span>
  );
}
