'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { EVENT_TYPE_NAV, eventTypeHref, eventTypeNavFor } from '@/lib/event-type-nav';
import type { EventType } from '@/types/domain';
import { cn } from '@/lib/utils';

const LANDING_LINKS = [
  { href: '/#cara-kerja', label: 'Cara pakai' },
  { href: '/#fitur', label: 'Fitur' },
] as const;

/**
 * Tab kategori navbar.
 *
 * Satu-satunya bagian navbar yang jadi Client Component, dan hanya karena
 * penanda "halaman aktif" butuh `usePathname()` + query `type`. Di beranda
 * ada dua tautan jangkar tambahan (Cara pakai, Fitur) seperti kanvas desain.
 *
 * Penanda aktif = garis bawah + warna + `aria-current`, bukan warna saja.
 */
export function NavLinks() {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = pathname === '/events' ? eventTypeNavFor(params.getAll('type') as EventType[]) : null;

  return <NavLinkList pathname={pathname} activeKey={active?.key ?? null} />;
}

/** Versi tanpa hook, untuk fallback Suspense saat prerender. */
export function NavLinkList({ pathname, activeKey }: { pathname: string | null; activeKey: EventType | null }) {
  return (
    <>
      {pathname === '/' &&
        LANDING_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={linkClass(false)}>
            {link.label}
          </Link>
        ))}
      {EVENT_TYPE_NAV.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <Link
            key={item.key}
            href={eventTypeHref(item)}
            aria-current={isActive ? 'page' : undefined}
            className={linkClass(isActive)}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function linkClass(isActive: boolean): string {
  return cn(
    'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 text-sm font-medium md:h-16',
    'transition-colors duration-150 ease-snap',
    isActive ? 'text-ink shadow-[inset_0_-2px_0_var(--color-text-primary)]' : 'text-ink-muted hover:text-ink',
  );
}
