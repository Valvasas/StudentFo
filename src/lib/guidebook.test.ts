import { describe, expect, it } from 'vitest';
import { guidebookPreview } from './guidebook';

describe('guidebookPreview', () => {
  it('PDF https disematkan; halaman web biasa hanya ditautkan', () => {
    expect(guidebookPreview('https://www.kampus.ac.id/files/Panduan%20Lomba.PDF')).toEqual({
      url: 'https://www.kampus.ac.id/files/Panduan%20Lomba.PDF',
      host: 'kampus.ac.id',
      embeddable: true,
    });
    expect(guidebookPreview('https://kampus.ac.id/lomba/panduan')?.embeddable).toBe(false);
  });

  it('".pdf" di query string bukan berkas PDF langsung', () => {
    expect(guidebookPreview('https://kampus.ac.id/unduh?file=panduan.pdf')?.embeddable).toBe(false);
  });

  it('menolak http, skema berbahaya, kredensial di URL, dan teks rusak', () => {
    expect(guidebookPreview('http://kampus.ac.id/panduan.pdf')).toBeNull();
    expect(guidebookPreview('javascript:alert(1)//.pdf')).toBeNull();
    expect(guidebookPreview('https://user:pass@kampus.ac.id/panduan.pdf')).toBeNull();
    expect(guidebookPreview('bukan url')).toBeNull();
    expect(guidebookPreview(null)).toBeNull();
  });
});
