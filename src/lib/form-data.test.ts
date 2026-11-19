import { describe, expect, it } from 'vitest';
import { FORM_LIST_MAX, formList } from './form-data';

describe('formList', () => {
  it('mengambil nilai teks saja, berkas dilewati', () => {
    const data = new FormData();
    data.append('tag', 'a');
    data.append('tag', new File(['x'], 'x.txt'));
    data.append('tag', 'b');
    expect(formList(data, 'tag')).toEqual(['a', 'b']);
  });

  it('memotong daftar raksasa sebelum sampai ke validator (GHSA-mrhx-c7xc-m3w5)', () => {
    const data = new FormData();
    for (let index = 0; index < 50_000; index += 1) data.append('recipient', `id-${index}`);
    const values = formList(data, 'recipient');
    expect(values).toHaveLength(FORM_LIST_MAX);
    // Tetap di atas batas sah terbesar (20), jadi validator pemanggil tetap menolaknya.
    expect(values.length).toBeGreaterThan(20);
  });
});
