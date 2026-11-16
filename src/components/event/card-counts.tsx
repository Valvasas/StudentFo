import { Heart, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventCounts } from '@/types/domain';

/**
 * Suka & komentar di kartu (ADR-092). Hanya angka di atas nol — "0 suka" di
 * kegiatan baru terbaca "tidak ada yang tertarik" (alasan yang sama dengan
 * fakta "Disimpan" di halaman detail). Angka boleh tertinggal ≤ 5 menit
 * (Data Cache); halaman detail selalu segar.
 */
export function CardCounts({ counts, className }: { counts: EventCounts | null | undefined; className?: string }) {
  if (!counts || (counts.likes <= 0 && counts.comments <= 0)) return null;
  const parts = [
    counts.likes > 0 ? `${counts.likes.toLocaleString('id-ID')} suka` : null,
    counts.comments > 0 ? `${counts.comments.toLocaleString('id-ID')} komentar` : null,
  ].filter(Boolean);
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-[12.5px] font-medium text-ink-muted tabular-nums', className)}>
      <span className="sr-only">{parts.join(', ')}</span>
      {counts.likes > 0 && (
        <span aria-hidden className="inline-flex items-center gap-1">
          <Heart className="size-3.5 text-like" />
          {counts.likes.toLocaleString('id-ID')}
        </span>
      )}
      {counts.comments > 0 && (
        <span aria-hidden className="inline-flex items-center gap-1">
          <MessageCircle className="size-3.5" />
          {counts.comments.toLocaleString('id-ID')}
        </span>
      )}
    </span>
  );
}
