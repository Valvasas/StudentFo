import { describe, expect, it } from 'vitest';
import { GUEST_TEASER_CHARS, teaserOf } from '@/lib/event-access';

describe('teaserOf', () => {
  it('kosong → tidak ada cuplikan', () => {
    expect(teaserOf(null)).toBeNull();
    expect(teaserOf(undefined)).toBeNull();
    expect(teaserOf('   \n ')).toBeNull();
  });

  it('teks pendek tampil utuh, tidak ditandai terpotong', () => {
    expect(teaserOf('  Lomba poster tingkat nasional.  ')).toEqual({ text: 'Lomba poster tingkat nasional.', truncated: false });
  });

  it('teks panjang dipotong di batas kata dengan elipsis, tidak melebihi batas', () => {
    const text = 'Lomba desain poster digital bertema pangan lokal untuk pelajar SMA dan mahasiswa. '.repeat(10);
    const teaser = teaserOf(text);
    expect(teaser?.truncated).toBe(true);
    expect(teaser?.text.endsWith('…')).toBe(true);
    expect(Array.from(teaser!.text).length).toBeLessThanOrEqual(GUEST_TEASER_CHARS + 1);
    // Dipotong di batas kata: isinya awalan teks asli, dan karakter berikutnya di teks asli bukan huruf.
    const body = teaser!.text.slice(0, -1);
    expect(text.startsWith(body)).toBe(true);
    expect(text[body.length]).toMatch(/[\s.,]/);
  });

  it('tanda baca di ujung potongan dibuang sebelum elipsis', () => {
    const teaser = teaserOf('Satu dua tiga, empat lima enam, tujuh delapan sembilan.', 32);
    expect(teaser).toEqual({ text: 'Satu dua tiga, empat lima enam…', truncated: true });
  });

  it('satu kata raksasa (tautan) dipotong keras, bukan dikosongkan', () => {
    const url = `https://contoh.example/${'a'.repeat(400)}`;
    const teaser = teaserOf(`Daftar: ${url}`, 100);
    expect(teaser?.truncated).toBe(true);
    expect(Array.from(teaser!.text).length).toBe(101);
    expect(teaser!.text.startsWith('Daftar: https://contoh.example/')).toBe(true);
  });

  it('emoji di batas potongan tidak terbelah', () => {
    const teaser = teaserOf(`${'🏆'.repeat(10)} juara`, 5);
    expect(teaser).toEqual({ text: '🏆🏆🏆🏆🏆…', truncated: true });
    expect(teaser!.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});
