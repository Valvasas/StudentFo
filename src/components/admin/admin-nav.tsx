import Link from 'next/link';
import { BadgeCheck, History, Megaphone, Scale, ShieldCheck, type LucideIcon } from 'lucide-react';
import { ScrollRail } from '@/components/ui/scroll-rail';
import { cn } from '@/lib/utils';

export type AdminSection = 'antrean' | 'penyelenggara' | 'riwayat' | 'kalibrasi' | 'promosi';

const ITEMS: readonly { key: AdminSection; label: string; href: string; icon: LucideIcon }[] = [
  { key: 'antrean', label: 'Antrean moderasi', href: '/admin', icon: ShieldCheck },
  { key: 'penyelenggara', label: 'Penyelenggara', href: '/admin/penyelenggara', icon: BadgeCheck },
  { key: 'riwayat', label: 'Riwayat moderasi', href: '/admin/riwayat', icon: History },
  { key: 'kalibrasi', label: 'Kalibrasi rekomendasi', href: '/admin/kalibrasi', icon: Scale },
  { key: 'promosi', label: 'Lencana & promosi', href: '/admin/promosi', icon: Megaphone },
];

/**
 * Navigasi ruang kerja moderator (ADR-055) — satu baris yang sama di setiap
 * halaman /admin, pengganti tautan "Kembali ke antrean" yang membuat
 * perpindahan antar-alat selalu lewat halaman antrean dulu.
 *
 * Di ponsel menggulir horizontal; wadahnya `relative` supaya teks `sr-only`
 * di badge tidak lolos dari kliping dan melebarkan halaman 320px (ADR-054).
 */
export function AdminNav({ active, trustWaiting = 0 }: { active: AdminSection; trustWaiting?: number }) {
  return (
    <ScrollRail
      aria-label="Ruang kerja moderator"
      className="relative -mx-5 mb-6 overflow-x-auto px-5 pb-1 [scrollbar-width:none] max-sm:pr-12 max-sm:[mask-image:linear-gradient(90deg,#000_calc(100%-44px),transparent)] sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max gap-1 rounded-pill border border-line bg-panel p-1">
        {ITEMS.map((item) => {
          const on = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-2 whitespace-nowrap rounded-pill px-4 text-[13.5px] transition-colors duration-200 ease-snap',
                  on ? 'bg-brand font-semibold text-on-brand' : 'font-medium text-ink-muted hover:bg-panel-nested hover:text-ink',
                )}
              >
                <item.icon aria-hidden className="size-4" />
                {item.label}
                {item.key === 'penyelenggara' && trustWaiting > 0 && (
                  <span
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center rounded-pill px-1.5 text-[11px] font-semibold',
                      on ? 'bg-on-brand text-brand' : 'bg-highlight text-on-highlight',
                    )}
                  >
                    {trustWaiting}
                    <span className="sr-only"> menunggu</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </ScrollRail>
  );
}
