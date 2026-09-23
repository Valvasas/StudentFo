'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  locked: boolean;
}

/**
 * Tautan navigasi utama.
 *
 * Ini satu-satunya bagian navbar yang jadi Client Component, dan hanya
 * karena penanda "halaman aktif" butuh `usePathname()`. Sisa navbar
 * (menu akun, pengalih tema) tetap dirender di server.
 *
 * Penanda aktif memakai garis bawah + warna + `aria-current`, bukan warna
 * saja: pengguna dengan defisiensi penglihatan warna tidak menerima
 * informasi "yang biru itu halaman sekarang".
 */
export function NavLinks({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 border-b-2 px-2 text-sm font-medium sm:px-3',
              'transition-colors duration-150 ease-snap',
              isActive
                ? 'border-brand text-brand-text'
                : 'border-transparent text-ink-soft hover:text-ink',
            )}
          >
            {item.label}
            {item.locked && (
              <>
                <Lock aria-hidden className="size-3 text-ink-faint" />
                <span className="sr-only">(perlu masuk)</span>
              </>
            )}
          </Link>
        );
      })}
    </>
  );
}
