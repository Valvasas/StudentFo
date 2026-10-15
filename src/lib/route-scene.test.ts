import { describe, expect, it } from 'vitest';
import { routeSceneFor } from './route-scene';

describe('routeSceneFor', () => {
  it('membedakan daftar, detail, persiapan, dan keluar ke formulir resmi', () => {
    expect(routeSceneFor('/events').key).toBe('catalog');
    expect(routeSceneFor('/events/lomba-ui-ux-2026').key).toBe('event');
    expect(routeSceneFor('/events/lomba-ui-ux-2026/persiapan')).toEqual({ key: 'event', label: 'Memuat daftar berkas…' });
    expect(routeSceneFor('/events/lomba-ui-ux-2026/daftar').key).toBe('register');
    expect(routeSceneFor('/events/lomba-ui-ux-2026/formulir').label).toBe('Memuat formulir pendaftaran…');
  });

  it('pembayaran & ruang kerja acara punya kalimat sendiri', () => {
    expect(routeSceneFor('/pembayaran/abc').label).toBe('Memuat pembayaran…');
    expect(routeSceneFor('/penyelenggara/acara/abc/pendaftar').label).toBe('Memuat ruang kerja acara…');
    expect(routeSceneFor('/penyelenggara').label).toBe('Memuat studio penyelenggara…');
  });

  it('memetakan ruang kerja tiap peran', () => {
    expect(routeSceneFor('/tracker/lomba-x').key).toBe('tracker');
    expect(routeSceneFor('/admin/riwayat').key).toBe('admin');
    expect(routeSceneFor('/penyelenggara/acara/abc').key).toBe('studio');
    expect(routeSceneFor('/orang/123').key).toBe('network');
    expect(routeSceneFor('/discussions').key).toBe('inbox');
  });

  it('pengaturan & personalisasi didahulukan dari profil umum', () => {
    expect(routeSceneFor('/profile/settings').key).toBe('settings');
    expect(routeSceneFor('/profile/personalization').key).toBe('settings');
    expect(routeSceneFor('/profile/details').key).toBe('profile');
  });

  it('menormalkan garis miring penutup & kapital, mencocokkan per segmen, dan jatuh ke adegan generik', () => {
    expect(routeSceneFor('/Tracker/').key).toBe('tracker');
    expect(routeSceneFor('/').key).toBe('home');
    expect(routeSceneFor('/about')).toEqual({ key: 'page', label: 'Memuat halaman…' });
    expect(routeSceneFor('/teams-lama').key).toBe('page');
  });
});
