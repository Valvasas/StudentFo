import { describe, expect, it } from 'vitest';
import { parseSkipStore, presentIn, restoreAll, serializeSkipStore, SKIP_STORE_MAX, skip, undo, visibleSlides } from './deck-state';

const slides = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

describe('visibleSlides', () => {
  it('membuang yang dilewati dan menjaga urutan peringkat', () => {
    expect(visibleSlides(slides, ['c', 'a']).map((slide) => slide.id)).toEqual(['b', 'd']);
  });

  it('tanpa riwayat mengembalikan daftar yang sama', () => {
    expect(visibleSlides(slides, [])).toBe(slides);
  });

  it('id asing di riwayat diabaikan', () => {
    expect(visibleSlides(slides, ['zzz']).map((slide) => slide.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('skip / undo / restoreAll', () => {
  const all = new Set(['a', 'b', 'c', 'd']);

  it('riwayat berurutan dan undo mengembalikan yang terakhir', () => {
    let history = skip(skip(skip([], 'a'), 'c'), 'b');
    expect(history).toEqual(['a', 'c', 'b']);
    const first = undo(history, all);
    expect(first.restored).toBe('b');
    history = first.history;
    expect(history).toEqual(['a', 'c']);
    expect(undo(history, all).restored).toBe('c');
  });

  it('melewati dua kali tidak menggandakan', () => {
    expect(skip(['a'], 'a')).toEqual(['a']);
  });

  it('undo pada riwayat kosong aman', () => {
    expect(undo([], all)).toEqual({ history: [], restored: null });
  });

  it('tidak memutasi masukan', () => {
    const history = Object.freeze(['a', 'b']);
    skip(history, 'c');
    undo(history, all);
    restoreAll(history, all);
    expect(history).toEqual(['a', 'b']);
  });

  it('orang di luar tampilan ini tetap tersimpan, tidak dihitung, dan tidak dipulihkan', () => {
    const shown = new Set(['a', 'b']);
    const history = ['a', 'zzz', 'b', 'yyy'];
    expect(presentIn(history, shown)).toEqual(['a', 'b']);
    expect(undo(history, shown)).toEqual({ history: ['a', 'zzz', 'yyy'], restored: 'b' });
    expect(undo(['zzz'], shown)).toEqual({ history: ['zzz'], restored: null });
    expect(restoreAll(history, shown)).toEqual(['zzz', 'yyy']);
  });
});

describe('parseSkipStore', () => {
  it('null, kosong, atau JSON rusak = kosong', () => {
    expect(parseSkipStore(null)).toEqual([]);
    expect(parseSkipStore('')).toEqual([]);
    expect(parseSkipStore('{oops')).toEqual([]);
  });

  it('bentuk selain larik string ditolak', () => {
    expect(parseSkipStore('{"a":1}')).toEqual([]);
    expect(parseSkipStore('"a"')).toEqual([]);
    expect(parseSkipStore('[1,null,{"x":1},"a"]')).toEqual(['a']);
  });

  it('duplikat, string kosong, dan string kepanjangan dibuang; id di luar tampilan dipertahankan', () => {
    expect(parseSkipStore(JSON.stringify(['b', 'zzz', 'b', '', 'x'.repeat(65), 'a']))).toEqual(['b', 'zzz', 'a']);
  });

  it('dibatasi 48, yang terbaru dipertahankan', () => {
    const ids = Array.from({ length: 60 }, (_, index) => `id-${index}`);
    const parsed = parseSkipStore(JSON.stringify(ids));
    expect(parsed).toHaveLength(SKIP_STORE_MAX);
    expect(parsed[0]).toBe('id-12');
    expect(parsed.at(-1)).toBe('id-59');
  });

  it('serialize lalu parse kembali sama', () => {
    expect(parseSkipStore(serializeSkipStore(['c', 'a']))).toEqual(['c', 'a']);
  });
});
