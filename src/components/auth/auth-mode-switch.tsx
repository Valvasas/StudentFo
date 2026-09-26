import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Pengalih Masuk | Daftar (kanvas desain Login). Dua halaman terpisah
 * dengan tautan biasa, bukan tab berbasis state: setiap mode punya URL
 * sendiri (dibagikan sebagai "daftar di sini") dan tetap jalan tanpa JS.
 */
export function AuthModeSwitch({ mode, next }: { mode: 'login' | 'register'; next: string }) {
  const suffix = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;
  const items = [
    { key: 'login', label: 'Masuk', href: `/login${suffix}` },
    { key: 'register', label: 'Daftar', href: `/register${suffix}` },
  ] as const;

  return (
    <nav aria-label="Masuk atau daftar" className="flex gap-0.5 rounded-sm bg-panel-nested p-[3px]">
      {items.map((item) => {
        const active = item.key === mode;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center rounded-[6px] text-sm font-medium transition-colors duration-150 ease-snap',
              active ? 'bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,.1)]' : 'text-ink-muted hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
