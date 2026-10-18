import { describe, expect, it } from 'vitest';
import { photoAlt, photoSrc } from './event-photo';

describe('photoAlt', () => {
  it('keterangan bersama satu unggahan tetap dibedakan nomor fotonya', () => {
    expect(photoAlt({ caption: 'Final' }, 2, 'Acara')).toBe('Final (foto 2)');
  });

  it('tanpa keterangan (null atau kosong) memakai nomor & judul acara', () => {
    expect(photoAlt({ caption: null }, 3, 'Acara')).toBe('Foto 3 dari Acara');
    expect(photoAlt({ caption: '' }, 1, 'Acara')).toBe('Foto 1 dari Acara');
  });
});

describe('photoSrc', () => {
  it('id di-encode supaya tidak bisa keluar dari /media/foto/', () => {
    expect(photoSrc('a/b')).toBe('/media/foto/a%2Fb');
  });
});
