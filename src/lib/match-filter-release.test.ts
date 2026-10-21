import { describe, expect, it } from 'vitest';
import { filterGroups, filterTokens, releaseFilter } from './match-filter-release';
import { DEFAULT_MATCH_FILTERS, parseMatchQuery, serializeMatchQuery, type MatchQuery } from './matchmaking';

const plain: MatchQuery = { filters: DEFAULT_MATCH_FILTERS, style: 'seimbang', go: false, show: 6 };
const strict: MatchQuery = parseMatchQuery({
  jarak: '25',
  daring: '0',
  keahlian: ['ui-ux', 'data-ai'],
  portofolio: 'juara',
  jenjang: 'sama',
  gaya: 'juara',
  cari: '1',
});

describe('filterTokens', () => {
  it('tanpa saringan = kosong', () => {
    expect(filterTokens(plain)).toEqual([]);
    expect(filterGroups(plain)).toEqual([]);
  });

  it('satu token per saringan dan satu per keahlian wajib', () => {
    const tokens = filterTokens(strict);
    expect(tokens.map((token) => token.key)).toEqual(['distance', 'remote', 'skills', 'skills', 'portfolio', 'level', 'style']);
    expect(tokens[0]?.label).toBe('≤ 25 km');
    expect(tokens[2]?.skill).toBe('ui-ux');
  });

  it('grup tidak memuat gaya tim dan menggabungkan keahlian', () => {
    expect(filterGroups(strict).map((group) => group.key)).toEqual(['distance', 'remote', 'skills', 'portfolio', 'level']);
  });
});

describe('releaseFilter', () => {
  it('melepas satu saringan, menjaga yang lain, dan membuang cari=1', () => {
    const next = releaseFilter(strict, 'distance');
    expect(next.go).toBe(false);
    expect(next.filters.maxDistanceKm).toBeNull();
    expect(next.filters.skills).toEqual(['ui-ux', 'data-ai']);
    expect(next.filters.portfolio).toBe('juara');
  });

  it('keahlian bisa dilepas satu per satu atau sekaligus', () => {
    expect(releaseFilter(strict, 'skills', 'ui-ux').filters.skills).toEqual(['data-ai']);
    expect(releaseFilter(strict, 'skills').filters.skills).toEqual([]);
  });

  it('semua kunci menghasilkan URL kanonik yang lebih pendek', () => {
    const full = serializeMatchQuery({ ...strict, go: false });
    for (const key of ['distance', 'remote', 'skills', 'portfolio', 'level', 'style'] as const) {
      expect(serializeMatchQuery(releaseFilter(strict, key)).length).toBeLessThan(full.length);
    }
  });

  it('melepas semuanya kembali ke bawaan', () => {
    let query = strict;
    for (const group of filterGroups(strict)) query = releaseFilter(query, group.key);
    query = releaseFilter(query, 'style');
    expect(serializeMatchQuery(query)).toBe('');
  });
});
