import Link from 'next/link';
import { ChevronDown, LogIn, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { signOutAction } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';
import { getSessionUser } from '@/lib/auth';

/**
 * Menu akun di navbar.
 *
 * Memakai <details>, bukan dropdown berbasis state klien: navbar ada di
 * setiap halaman, jadi setiap kilobyte JavaScript di sini dibayar berkali-
 * kali — sementara yang dibutuhkan cuma "buka daftar, klik tautan". Sama
 * seperti panel filter di /events, ini tetap berfungsi tanpa JavaScript.
 *
 * Konsekuensi yang diterima: menu tidak menutup sendiri saat klik di luar.
 * Untuk menu dengan tiga baris tautan, itu bukan harga yang mahal.
 */
function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export async function AccountMenu() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <Button asChild variant="secondary" size="sm" className="ml-1">
        <Link href="/login">
          <LogIn aria-hidden />
          <span className="hidden xs:inline">Masuk</span>
          <span className="sr-only xs:hidden">Masuk</span>
        </Link>
      </Button>
    );
  }

  const firstName = user.fullName.split(' ')[0] ?? user.fullName;

  return (
    <details className="relative ml-1">
      <summary
        className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-card px-1.5 text-sm font-medium text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink sm:px-2"
        aria-label={`Menu akun untuk ${user.fullName}`}
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-xs font-semibold text-brand-text"
        >
          {initialsOf(user.fullName)}
        </span>
        <span className="hidden max-w-24 truncate sm:inline">{firstName}</span>
        <ChevronDown aria-hidden className="size-4" />
      </summary>

      <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-card border border-line bg-panel p-2 shadow-overlay">
        <div className="border-b border-line px-3 pb-2 pt-1">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="truncate text-xs text-ink-muted">{user.email}</p>
        </div>

        <Link
          href="/profile"
          className="mt-1 flex min-h-11 items-center gap-2 rounded-sm px-3 text-sm text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
        >
          <UserRound aria-hidden className="size-4" />
          Akun saya
        </Link>

        {user.role === 'ADMIN' && (
          <Link
            href="/admin"
            className="flex min-h-11 items-center gap-2 rounded-sm px-3 text-sm text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
          >
            <ShieldCheck aria-hidden className="size-4" />
            Antrean moderasi
          </Link>
        )}

        {/* Keluar WAJIB lewat POST (Server Action), bukan tautan biasa.
            Dengan <a href="/logout">, prefetch peramban atau sebuah <img>
            di situs lain sudah cukup untuk mengeluarkan orang dari akunnya. */}
        <form action={signOutAction} className="border-t border-line pt-1">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-sm text-ink-soft transition-colors duration-150 ease-snap hover:bg-panel-nested hover:text-ink"
          >
            <LogOut aria-hidden className="size-4" />
            Keluar
          </button>
        </form>
      </div>
    </details>
  );
}
