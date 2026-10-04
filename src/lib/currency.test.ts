import { describe, expect, it } from 'vitest';
import { formatRupiah, priceLabel } from './currency';

describe('formatRupiah', () => {
  it('format Indonesia tanpa sen, spasi biasa', () => {
    expect(formatRupiah(150000)).toBe('Rp 150.000');
    expect(formatRupiah(1_250_000)).toBe('Rp 1.250.000');
  });
});

describe('priceLabel', () => {
  it('gratis / berbayar dengan nominal / berbayar tanpa nominal', () => {
    expect(priceLabel({ isFree: true, priceAmount: null })).toEqual({ kind: 'free', text: 'Gratis' });
    expect(priceLabel({ isFree: false, priceAmount: 75000 })).toEqual({ kind: 'paid', text: 'Rp 75.000' });
    expect(priceLabel({ isFree: false, priceAmount: null })).toEqual({ kind: 'paid', text: 'Berbayar' });
  });

  it('biaya belum diketahui tidak pernah ditebak "Gratis"', () => {
    expect(priceLabel({ isFree: null, priceAmount: null })).toEqual({ kind: 'unknown' });
  });
});
