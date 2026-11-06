'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { returnsTo, visitLog } from '@/lib/nav-history';
import { cn } from '@/lib/utils';

/**
 * Tautan yang kembali ke halaman asal bila asalnya memang tujuan `href`
 * (saringan & posisi gulir ikut pulih), selain itu tautan biasa. Tanpa
 * JavaScript = tautan biasa. Lihat `lib/nav-history.ts` (ADR-067).
 */
export function HistoryLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!returnsTo(visitLog.previous(), href)) return;
        event.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}

export interface BackTarget {
  readonly href: string;
  readonly label: string;
}

/**
 * Tombol "kembali" di kepala halaman dalam — supaya orang di ponsel tidak
 * harus mencari tombol kembali perangkatnya. Selalu hierarkis (label = nama
 * halaman induk), jadi tetap benar saat halaman dibuka dari tautan luar.
 *
 * `via` = induk lain yang juga menautkan ke halaman ini (mis. Data diri
 * dibuka dari Profil ATAU Pengaturan). Bila orang datang dari salah satunya,
 * tombol berganti menunjuk ke sana dan tetap begitu selama ia berada di
 * halaman ini (termasuk setelah menyimpan form). HTML server selalu memakai
 * induk utama, jadi tanpa JS tetap ada tujuan yang benar.
 */
export function BackLink({ href, label, via, className }: BackTarget & { via?: readonly BackTarget[]; className?: string }) {
  const [target, setTarget] = useState<BackTarget>({ href, label });

  useEffect(() => {
    if (!via?.length) return;
    // Ditunda satu tick: pencatat kunjungan (`NavigationProgress`) berada di
    // luar halaman, dan urutan efek antar-cabang pohon tidak dijamin.
    const timer = window.setTimeout(() => {
      const previous = visitLog.previous();
      const match = via.find((option) => returnsTo(previous, option.href));
      if (match) setTarget(match);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [via]);

  return (
    <HistoryLink
      href={target.href}
      className={cn(
        'group -ml-1 flex min-h-11 w-fit items-center gap-1.5 rounded-sm px-1 text-[13.5px] font-medium text-ink-muted transition-colors duration-150 ease-snap hover:text-ink',
        className,
      )}
    >
      <ArrowLeft aria-hidden className="size-4 transition-transform duration-150 ease-snap group-hover:-translate-x-0.5" />
      <span className="sr-only">Kembali ke </span>
      {target.label}
    </HistoryLink>
  );
}
