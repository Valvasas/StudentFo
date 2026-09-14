import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildEventHref, type ParsedEventQuery } from '@/lib/search-params';
import { cn } from '@/lib/utils';

/**
 * Paginasi berbasis tautan.
 *
 * Dipilih daripada infinite scroll secara sadar: konten ini sering dibuka
 * dari hasil pencarian dan dibagikan ulang. Infinite scroll merusak tombol
 * back, tidak punya URL per halaman, dan menyembunyikan footer — tiga hal
 * yang merugikan produk yang hidup dari pencarian organik.
 */
export function Pagination({ query, totalPages }: { query: ParsedEventQuery; totalPages: number }) {
  if (totalPages <= 1) return null;

  const current = Math.min(query.page, totalPages);
  // Jendela geser: selalu tampilkan maksimum 5 nomor di sekitar halaman aktif.
  const start = Math.max(1, Math.min(current - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);

  return (
    <nav aria-label="Navigasi halaman" className="flex items-center justify-center gap-1.5 pt-2">
      <PageLink
        href={buildEventHref(query, { page: current - 1 })}
        disabled={current === 1}
        label="Halaman sebelumnya"
      >
        <ChevronLeft aria-hidden className="size-4" />
      </PageLink>

      {pages.map((page) => (
        <PageLink
          key={page}
          href={buildEventHref(query, { page })}
          active={page === current}
          label={`Halaman ${page}`}
        >
          {page}
        </PageLink>
      ))}

      <PageLink
        href={buildEventHref(query, { page: current + 1 })}
        disabled={current === totalPages}
        label="Halaman berikutnya"
      >
        <ChevronRight aria-hidden className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
  active = false,
  disabled = false,
  label,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const className = cn(
    'inline-flex size-11 items-center justify-center rounded-card border text-sm tabular-nums transition-colors duration-150 ease-snap',
    active
      ? 'border-brand bg-brand text-on-brand font-semibold'
      : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink',
  );

  if (disabled) {
    return (
      <span aria-hidden className={cn(className, 'cursor-not-allowed opacity-40')}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}
