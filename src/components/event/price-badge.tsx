import { Megaphone, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { priceLabel } from '@/lib/currency';
import type { EventSummary } from '@/types/domain';

/**
 * Lencana biaya. "Gratis" memakai pasangan warna sukses (emerald) — satu-
 * satunya sinyal hijau di kartu, jadi terbaca sebagai kabar baik tanpa
 * bersaing dengan warna urgensi tenggat. Berbayar sengaja netral: harga
 * adalah fakta, bukan peringatan, dan merah/oranye di sini akan membuatnya
 * terbaca "bahaya". Biaya yang belum diketahui tidak menampilkan apa pun.
 */
export function PriceBadge({
  event,
  className,
}: {
  event: Pick<EventSummary, 'isFree' | 'priceAmount'>;
  className?: string;
}) {
  const price = priceLabel(event);
  if (price.kind === 'unknown') return null;
  return (
    <Badge variant={price.kind === 'free' ? 'success' : 'neutral'} className={className}>
      <Ticket aria-hidden className="size-3.5" />
      <span className="sr-only">Biaya pendaftaran: </span>
      {price.text}
    </Badge>
  );
}

/**
 * Penanda promosi berbayar. Netral (garis tipis, tanpa warna aksen) supaya
 * tidak terlihat seperti rekomendasi editorial — tapi SELALU tampil dan
 * berteks, bukan hanya ikon: iklan yang tidak terbaca sebagai iklan merusak
 * kepercayaan pada seluruh daftar.
 */
export function PromotedBadge() {
  return (
    <Badge variant="outline" title="Ditampilkan di atas karena kemitraan berbayar. Isinya tetap ditinjau moderator.">
      <Megaphone aria-hidden className="size-3.5" />
      Promosi
      <span className="sr-only"> — ditampilkan di atas karena kemitraan berbayar</span>
    </Badge>
  );
}
