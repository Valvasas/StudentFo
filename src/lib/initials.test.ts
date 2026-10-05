import { describe, expect, it } from 'vitest';
import { initialsOf, monogramOf } from './initials';

describe('initialsOf', () => {
  it('awal + akhir untuk nama orang', () => {
    expect(initialsOf('Rani Prameswari')).toBe('RP');
    expect(initialsOf('Dinda Ayu Pratiwi')).toBe('DP');
    expect(initialsOf('Panitia')).toBe('P');
  });
});

describe('monogramOf', () => {
  it('dua kata pertama yang diawali huruf — tahun di akhir judul tidak ikut', () => {
    expect(monogramOf('Kompetisi Inovasi Perangkat Lunak Nusantara 2026')).toBe('KI');
    expect(monogramOf('2026 Beasiswa Unggulan')).toBe('BU');
    expect(monogramOf('lomba')).toBe('L');
  });

  it('judul tanpa kata berhuruf jatuh ke initialsOf, bukan string kosong', () => {
    expect(monogramOf('2026 2027')).toBe('22');
  });
});
