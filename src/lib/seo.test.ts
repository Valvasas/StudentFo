import { describe, expect, it } from 'vitest';
import { canonicalEventsPath, META_DESCRIPTION_MAX, metaDescription } from './seo';

describe('canonicalEventsPath', () => {
  it('jenis yang cocok dengan satu tab → halaman kategori bersih', () => {
    expect(canonicalEventsPath(['LOMBA'])).toBe('/events?type=LOMBA');
    // Tab Workshop memuat dua jenis; urutan di URL tidak memengaruhi canonical.
    expect(canonicalEventsPath(['PELATIHAN', 'WORKSHOP'])).toBe('/events?type=WORKSHOP&type=PELATIHAN');
  });

  it('tanpa jenis atau campuran → /events', () => {
    expect(canonicalEventsPath([])).toBe('/events');
    expect(canonicalEventsPath(['LOMBA', 'MAGANG'])).toBe('/events');
    expect(canonicalEventsPath(['VOLUNTEER'])).toBe('/events');
  });
});

describe('metaDescription', () => {
  it('kosong → null; baris baru diratakan', () => {
    expect(metaDescription(null)).toBeNull();
    expect(metaDescription('  ')).toBeNull();
    expect(metaDescription('Lomba\n\nesai   nasional')).toBe('Lomba esai nasional');
  });

  it('memotong di batas kata, tidak melewati batas, tanpa tanda baca menggantung', () => {
    const text =
      'Magang bersertifikat enam bulan di tim data platform. Kandidat akan menangani pipeline ETL, membangun dasbor internal, dan menulis laporan analisis untuk tim produk.';
    const result = metaDescription(text)!;
    expect(Array.from(result).length).toBeLessThanOrEqual(META_DESCRIPTION_MAX + 1);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toMatch(/ untuk t…$/);
    expect(text.startsWith(result.slice(0, -1))).toBe(true);
  });
});
