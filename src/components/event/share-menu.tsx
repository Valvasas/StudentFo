import Link from 'next/link';
import { Mail, MessageCircle, Send, Share2, UserRoundPlus, type LucideIcon } from 'lucide-react';
import { ShareQuickActions } from '@/components/event/share-quick-actions';
import { siteUrl } from '@/lib/env';
import { cn } from '@/lib/utils';

interface ShareTarget {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
}

/**
 * Tautan bagikan per kanal (ADR-092). Hanya URL kanonis kegiatan + judul —
 * tanpa parameter pelacak, tanpa skrip pihak ketiga: tombol "share" resmi
 * platform memasang pelacak ke setiap pengunjung (alasan yang sama dengan
 * pemutar video fasad, ADR-079).
 */
export function shareTargets(title: string, url: string): readonly ShareTarget[] {
  const text = `${title} — info lengkap & daftar di StudentFo`;
  const encode = encodeURIComponent;
  return [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encode(`${text}\n${url}`)}`, icon: MessageCircle },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encode(url)}&text=${encode(text)}`, icon: Send },
    { label: 'X (Twitter)', href: `https://x.com/intent/post?text=${encode(text)}&url=${encode(url)}`, icon: Share2 },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}`, icon: Share2 },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encode(url)}`, icon: Share2 },
    { label: 'Email', href: `mailto:?subject=${encode(title)}&body=${encode(`${text}\n\n${url}`)}`, icon: Mail },
  ];
}

/**
 * Menu Bagikan (ADR-092): `<details data-popover>` (ditutup `PopoverDismiss`,
 * ADR-089) yang berfungsi penuh tanpa JavaScript. `connectHref` = "Kirim ke
 * koneksi StudentFo" untuk anggota. `align` = sisi panel menempel, supaya
 * panel di kolom kanan tidak keluar layar dan di ponsel tidak terpotong kiri.
 */
export function ShareMenu({
  title,
  path,
  connectHref,
  align = 'start',
  className,
}: {
  title: string;
  path: string;
  connectHref?: string | null;
  align?: 'start' | 'end';
  className?: string;
}) {
  const url = new URL(path, siteUrl).toString();
  return (
    <details data-popover className={cn('relative', className)}>
      <summary className="flex h-11 cursor-pointer list-none items-center justify-center gap-1.5 whitespace-nowrap rounded-pill border border-line px-3 text-sm font-medium text-ink-soft transition-colors duration-150 ease-snap hover:border-line-strong hover:text-ink sm:gap-2 sm:px-4 [&::-webkit-details-marker]:hidden">
        <Share2 aria-hidden className="size-4" />
        Bagikan
      </summary>
      <div
        className={cn(
          'pop absolute top-full z-50 mt-2 max-h-[var(--popover-max,70dvh)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-card border border-line bg-panel p-1.5 shadow-overlay',
          align === 'end' ? 'right-0' : 'left-0',
        )}
      >
        <p className="px-3 pb-1 pt-1.5 text-[12.5px] font-semibold text-ink-muted">Bagikan kegiatan ini</p>
        <ShareQuickActions title={title} url={url} />
        <ul className="flex flex-col">
          {shareTargets(title, url).map((target) => (
            <li key={target.label}>
              <a
                href={target.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-sm font-medium transition-colors duration-150 ease-snap hover:bg-panel-nested"
              >
                <target.icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
                {target.label}
                <span className="sr-only"> (tab baru)</span>
              </a>
            </li>
          ))}
        </ul>
        {connectHref && (
          <Link
            href={connectHref}
            className="mt-1 flex min-h-11 items-center gap-2.5 rounded-sm border-t border-line px-3 pt-1 text-sm font-semibold transition-colors duration-150 ease-snap hover:bg-panel-nested"
          >
            <UserRoundPlus aria-hidden className="size-4 shrink-0" />
            Kirim ke koneksi StudentFo
          </Link>
        )}
      </div>
    </details>
  );
}
