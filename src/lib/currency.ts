import type { EventSummary } from '@/types/domain';

const RUPIAH = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** 150000 → "Rp 150.000" (spasi biasa, bukan NBSP Intl — teksnya juga dipakai di .ics dan payload bot). */
export function formatRupiah(amount: number): string {
  return RUPIAH.format(amount).replace(/\s/g, ' ');
}

export type PriceLabel =
  | { readonly kind: 'free'; readonly text: string }
  | { readonly kind: 'paid'; readonly text: string }
  | { readonly kind: 'unknown' };

/**
 * Label biaya untuk kartu & detail. `unknown` = jangan tampilkan apa pun:
 * menebak "Gratis" untuk data yang tidak menyebut biaya adalah kebohongan
 * yang paling merugikan pengguna yang sensitif biaya (ADR-049).
 */
export function priceLabel(event: Pick<EventSummary, 'isFree' | 'priceAmount'>): PriceLabel {
  if (event.isFree === true) return { kind: 'free', text: 'Gratis' };
  if (event.isFree === false) {
    return { kind: 'paid', text: event.priceAmount ? formatRupiah(event.priceAmount) : 'Berbayar' };
  }
  return { kind: 'unknown' };
}
