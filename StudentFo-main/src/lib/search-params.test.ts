import { describe, expect, it } from 'vitest';
import { buildEventHref, hasActiveFilters, parseEventQuery, toggleFilterHref } from './search-params';

describe('parseEventQuery', () => {
  it('membuang nilai yang tidak dikenal alih-alih melempar error', () => {
    const query = parseEventQuery({ type: 'LOMBA,HANTU', jenjang: 'S9', sort: 'random' });
    expect(query.types).toEqual(['LOMBA']);
    expect(query.levels).toEqual([]);
    expect(query.sort).toBe('relevance');
  });

  it('menghapus duplikat filter', () => {
    expect(parseEventQuery({ type: ['LOMBA', 'LOMBA', 'MAGANG'] }).types).toEqual(['LOMBA', 'MAGANG']);
  });

  it('menolak slug kategori yang bentuknya mencurigakan', () => {
    const query = parseEventQuery({ kategori: "teknologi,<script>,bisnis" });
    expect(query.categories).toEqual(['teknologi', 'bisnis']);
  });

  it('membatasi panjang kata kunci pencarian', () => {
    expect(parseEventQuery({ q: 'a'.repeat(500) }).search).toHaveLength(120);
  });

  it('jatuh ke halaman 1 untuk nilai page yang tidak masuk akal', () => {
    expect(parseEventQuery({ page: '-3' }).page).toBe(1);
    expect(parseEventQuery({ page: 'abc' }).page).toBe(1);
    expect(parseEventQuery({ page: '4' }).page).toBe(4);
  });
});

describe('buildEventHref', () => {
  it('menghasilkan URL bersih saat tidak ada filter', () => {
    expect(buildEventHref(parseEventQuery({}))).toBe('/events');
  });

  it('mempertahankan filter dan mengabaikan default', () => {
    const query = parseEventQuery({ q: 'data', type: 'MAGANG', sort: 'relevance' });
    expect(buildEventHref(query)).toBe('/events?q=data&type=MAGANG');
  });
});

describe('toggleFilterHref', () => {
  it('menambah lalu menghapus nilai yang sama', () => {
    const query = parseEventQuery({});
    const added = toggleFilterHref(query, 'types', 'LOMBA');
    expect(added).toBe('/events?type=LOMBA');

    const withFilter = parseEventQuery({ type: 'LOMBA' });
    expect(toggleFilterHref(withFilter, 'types', 'LOMBA')).toBe('/events');
  });

  it('mereset halaman saat filter berubah', () => {
    const query = parseEventQuery({ page: '5' });
    expect(toggleFilterHref(query, 'types', 'LOMBA')).not.toContain('page=');
  });
});

describe('hasActiveFilters', () => {
  it('false untuk query kosong', () => {
    expect(hasActiveFilters(parseEventQuery({}))).toBe(false);
  });
  it('true begitu ada satu filter', () => {
    expect(hasActiveFilters(parseEventQuery({ jenjang: 'S2' }))).toBe(true);
  });
});
