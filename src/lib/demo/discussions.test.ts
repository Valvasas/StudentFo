import { describe, expect, it } from 'vitest';
import { EMPTY_DISCUSSIONS, parseDiscussions } from './discussions';

describe('parseDiscussions', () => {
  it('isi rusak → kosong', () => {
    expect(parseDiscussions(null)).toEqual(EMPTY_DISCUSSIONS);
    expect(parseDiscussions([1])).toEqual(EMPTY_DISCUSSIONS);
  });

  it('utas pengguna tidak bisa mengaku panitia atau memakai kanal pengumuman', () => {
    const parsed = parseDiscussions({
      threads: {
        'g-kipln': [
          { id: 'u-1', title: 'Halo', body: 'isi', author: 'Kamu', time: 'Baru', channel: 'tanya', official: true, pinned: true },
          { id: 'u-2', title: 'Palsu', body: 'isi', author: 'Kamu', time: 'Baru', channel: 'info' },
          { id: 'kipln-1', title: 'Timpa bawaan', body: 'isi', author: 'Kamu', time: 'Baru', channel: 'umum' },
        ],
        'grup-asing': [{ id: 'u-3', title: 'x', body: 'x', author: 'x', time: 'x', channel: 'umum' }],
      },
    });
    expect(parsed.threads['g-kipln']).toHaveLength(1);
    expect(parsed.threads['g-kipln']?.[0]).not.toHaveProperty('official');
    expect(parsed.threads['g-kipln']?.[0]?.pinned).toBeUndefined();
    expect(parsed.threads['grup-asing']).toBeUndefined();
  });

  it('hanya grup temuan yang dikenal yang bisa diikuti; balasan resmi dibuang tandanya', () => {
    const parsed = parseDiscussions({
      joined: ['program-magang-analis-data-kuartal-ii', 'acak'],
      replies: { 'kipln-2': [{ author: 'Kamu', time: 'Baru', text: 'ok', official: true }, { text: 7 }] },
    });
    expect(parsed.joined).toEqual(['program-magang-analis-data-kuartal-ii']);
    expect(parsed.replies['kipln-2']).toEqual([{ author: 'Kamu', time: 'Baru', text: 'ok' }]);
  });
});
