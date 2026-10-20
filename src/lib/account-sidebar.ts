import {
  BadgeCheck,
  Bookmark,
  Hash,
  Heart,
  IdCard,
  Lock,
  MessageCircle,
  Palette,
  Radar,
  ReceiptText,
  Settings,
  ShieldCheck,
  Ticket,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { OrganizerStatus } from '@/types/domain';

/**
 * Preferensi sidebar akun (ADR-052): dilipat jadi rel ikon atau terbuka.
 *
 * Disimpan di cookie, bukan localStorage: server yang merender sidebar sudah
 * dalam keadaan yang benar, jadi tidak ada kedip "terbuka lalu menutup" saat
 * halaman dimuat, dan sakelarnya bisa berupa <form> biasa yang tetap bekerja
 * tanpa JavaScript.
 */
export const ACCOUNT_SIDEBAR_COOKIE = 'sf_sidebar';
export const ACCOUNT_SIDEBAR_MAX_AGE = 60 * 60 * 24 * 365;

export function isSidebarCollapsed(value: string | undefined): boolean {
  return value === 'collapsed';
}

/**
 * Peran tampilan (ADR-056) — menentukan beranda, tautan navbar, dan urutan
 * menu akun. Bukan hak akses: setiap halaman & aksi tetap memeriksa haknya
 * sendiri. Penyelenggara yang masih PENDING ikut dihitung penyelenggara
 * supaya ia melihat status pengajuannya di beranda; REJECTED/REVOKED kembali
 * ke tampilan peserta karena tidak ada lagi yang bisa ia kelola.
 */
export type AccountRole = 'participant' | 'organizer' | 'admin';

export function accountRoleOf(role: 'USER' | 'ADMIN', organizerStatus: OrganizerStatus | null): AccountRole {
  if (role === 'ADMIN') return 'admin';
  return organizerStatus === 'VERIFIED' || organizerStatus === 'PENDING' ? 'organizer' : 'participant';
}

export type AccountSection =
  | 'studio'
  | 'moderasi'
  | 'profil'
  | 'data'
  | 'minat'
  | 'pesan'
  | 'diskusi'
  | 'daftar'
  | 'pembayaran'
  | 'koneksi'
  | 'cocok'
  | 'tersimpan'
  | 'personalisasi'
  | 'pengaturan'
  | 'privasi';

/** Angka di samping item; nilainya dimuat pemanggil (navbar & menu samping). */
export type AccountBadge = 'unread' | 'saved' | 'payment';

export interface AccountMenuItem {
  readonly key: AccountSection;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly badge?: AccountBadge;
}

export interface AccountMenuGroup {
  readonly key: 'kerja' | 'akun' | 'aktivitas' | 'lainnya';
  readonly title: string;
  readonly items: readonly AccountMenuItem[];
}

/**
 * Isi menu akun — SATU definisi untuk dropdown navbar dan menu samping
 * `AccountShell` (ADR-055): orang yang pindah dari ponsel ke laptop menemukan
 * tujuan di tempat yang sama.
 *
 * Grup pertama = tujuan utama peran: Aktivitas (pendaftaran & pembayaran)
 * bagi peserta, Ruang kerja bagi penyelenggara & admin. Di ponsel menu ini
 * satu-satunya jalan ke sana, jadi posisi teratas = dua ketukan. Item peserta
 * tetap ada untuk semua — penyelenggara juga mendaftar acara orang lain.
 */
export function accountMenuGroups(role: AccountRole, options: { readonly demoFeatures: boolean }): readonly AccountMenuGroup[] {
  const studio: AccountMenuItem = { key: 'studio', label: 'Studio penyelenggara', href: '/penyelenggara', icon: BadgeCheck };
  // Peserta bukan penyelenggara: grup "Ruang kerja" yang menampilkan studio
  // untuk semua orang menyiratkan mereka punya sesuatu di sana. Pintu
  // mengajukan diri tetap ada, tetapi bernama apa adanya dan di "Lainnya".
  const becomeOrganizer: AccountMenuItem = { ...studio, label: 'Jadi penyelenggara' };
  const moderation: AccountMenuItem = { key: 'moderasi', label: 'Antrean moderasi', href: '/admin', icon: ShieldCheck };

  const workspace: AccountMenuGroup = {
    key: 'kerja',
    title: 'Ruang kerja',
    items: role === 'admin' ? [moderation, studio] : [studio],
  };
  const account: AccountMenuGroup = {
    key: 'akun',
    title: 'Akun',
    items: [
      { key: 'profil', label: 'Profil saya', href: '/profile', icon: UserRound },
      { key: 'data', label: 'Data diri', href: '/profile/details', icon: IdCard },
      { key: 'minat', label: 'Peminatan', href: '/profile/interests', icon: Heart },
    ],
  };
  const activity: AccountMenuGroup = {
    key: 'aktivitas',
    title: 'Aktivitas',
    items: [
      { key: 'daftar', label: 'Papan lamaran', href: '/tracker', icon: Ticket },
      { key: 'pembayaran', label: 'Pendaftaran & pembayaran', href: '/pembayaran', icon: ReceiptText, badge: 'payment' },
      { key: 'tersimpan', label: 'Tersimpan', href: '/profile?tab=tersimpan', icon: Bookmark, badge: 'saved' },
      ...(options.demoFeatures
        ? [
            { key: 'pesan', label: 'Pesan', href: '/messages', icon: MessageCircle, badge: 'unread' } as const,
            { key: 'diskusi', label: 'Ruang diskusi', href: '/discussions', icon: Hash } as const,
          ]
        : []),
      { key: 'koneksi', label: 'Koneksi', href: '/connections', icon: Users },
      { key: 'cocok', label: 'Cocokkan tim', href: '/teams/cocok', icon: Radar },
    ],
  };
  const other: AccountMenuGroup = {
    key: 'lainnya',
    title: 'Lainnya',
    items: [
      { key: 'personalisasi', label: 'Personalisasi', href: '/profile/personalization', icon: Palette },
      { key: 'pengaturan', label: 'Pengaturan', href: '/profile/settings', icon: Settings },
      { key: 'privasi', label: 'Privasi & data', href: '/profile/privacy', icon: Lock },
      ...(role === 'participant' ? [becomeOrganizer] : []),
    ],
  };

  return role === 'participant' ? [activity, account, other] : [workspace, activity, account, other];
}
