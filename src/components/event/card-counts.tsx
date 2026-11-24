import { Heart, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventCounts } from '@/types/domain';

/**
 * Suka & komentar di kartu (ADR-092). Hanya angka di atas nol — "0 suka" di
 * kegiatan baru terbaca "tidak ada yang tertarik" (alasan yang sama dengan
 * fakta "Disimpan" di halaman detail). Angka boleh tertinggal ≤ 5 menit
 * (Data Cache); halaman detail selalu segar.
 *
 * Angka yang terlihat = angka yang dibacakan; `sr-only` hanya menambah
 * satuannya. Dulu kalimat lengkap di `sr-only` + angka `aria-hidden` terbaca
 * "2 suka2" oleh apa pun yang membaca teks halaman tanpa CSS (cuplikan mesin
 * pencari, mode baca, salin-tempel).
 */
export function CardCounts({ counts, className }: { counts: EventCounts | null | undefined; className?: string }) {
  if (!counts || (counts.likes <= 0 && counts.comments <= 0)) return null;
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-[12.5px] font-medium text-ink-muted tabular-nums', className)}>
      {counts.likes > 0 && (
        <span className="inline-flex items-center gap-1">
          <Heart aria-hidden className="size-3.5 text-like" />
          {counts.likes.toLocaleString('id-ID')}
          <span className="sr-only"> suka</span>
        </span>
      )}{' '}
      {counts.comments > 0 && (
        <span className="inline-flex items-center gap-1">
          <MessageCircle aria-hidden className="size-3.5" />
          {counts.comments.toLocaleString('id-ID')}
          <span className="sr-only"> komentar</span>
        </span>
      )}
    </span>
  );
}
