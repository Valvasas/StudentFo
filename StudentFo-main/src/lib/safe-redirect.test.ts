import { describe, expect, it } from 'vitest';
import { loginHref, safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it('meloloskan path internal apa adanya', () => {
    expect(safeNextPath('/events')).toBe('/events');
    expect(safeNextPath('/events?kategori=teknologi&page=2')).toBe('/events?kategori=teknologi&page=2');
    expect(safeNextPath('/events/lomba-esai-nasional')).toBe('/events/lomba-esai-nasional');
  });

  it('menolak URL absolut ke domain lain', () => {
    expect(safeNextPath('https://situs-palsu.example/login')).toBe('/');
    expect(safeNextPath('http://situs-palsu.example')).toBe('/');
  });

  it('menolak URL protocol-relative', () => {
    // `//evil.example` dibaca peramban sebagai host lain, bukan path.
    expect(safeNextPath('//situs-palsu.example')).toBe('/');
    expect(safeNextPath('/\\situs-palsu.example')).toBe('/');
  });

  it('menolak skema yang diselipkan di tengah path', () => {
    expect(safeNextPath('/redirect?to=javascript://alert(1)')).toBe('/');
  });

  it('menolak karakter yang bisa memecah header Location', () => {
    expect(safeNextPath('/events\r\nSet-Cookie: a=b')).toBe('/');
    expect(safeNextPath('/events\tx')).toBe('/');
  });

  it('menolak nilai yang terlalu panjang', () => {
    expect(safeNextPath(`/${'a'.repeat(600)}`)).toBe('/');
  });

  it('memakai nilai pertama kalau parameter dikirim berkali-kali', () => {
    expect(safeNextPath(['/profile', 'https://situs-palsu.example'])).toBe('/profile');
  });

  it('jatuh ke fallback untuk nilai kosong', () => {
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath('')).toBe('/');
    expect(safeNextPath('bukan-path')).toBe('/');
  });

  it('menghormati fallback yang diberikan', () => {
    expect(safeNextPath('https://situs-palsu.example', '/profile')).toBe('/profile');
  });
});

describe('loginHref', () => {
  it('tidak menambahkan ?next untuk tujuan beranda', () => {
    expect(loginHref('/')).toBe('/login');
    expect(loginHref(undefined)).toBe('/login');
  });

  it('menyandikan tujuan supaya query string tidak pecah', () => {
    expect(loginHref('/events?kategori=teknologi')).toBe(
      '/login?next=%2Fevents%3Fkategori%3Dteknologi',
    );
  });

  it('membuang tujuan yang tidak aman, bukan meneruskannya', () => {
    expect(loginHref('https://situs-palsu.example')).toBe('/login');
  });
});
