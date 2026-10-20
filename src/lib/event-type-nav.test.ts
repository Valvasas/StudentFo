import { describe, expect, it } from 'vitest';
import { EVENT_TYPE_NAV, eventTypeHref, eventTypeNavFor, isFocusedTaskPath } from './event-type-nav';

describe('eventTypeNavFor', () => {
  it('tab Workshop mencakup pelatihan, urutan filter tidak berpengaruh', () => {
    expect(eventTypeNavFor(['PELATIHAN', 'WORKSHOP'])?.label).toBe('Workshop');
  });

  it('WORKSHOP saja bukan tab Workshop (itu filter yang lebih sempit)', () => {
    expect(eventTypeNavFor(['WORKSHOP'])).toBeNull();
  });

  it('campuran atau kosong → tata letak umum', () => {
    expect(eventTypeNavFor(['LOMBA', 'BEASISWA'])).toBeNull();
    expect(eventTypeNavFor([])).toBeNull();
    expect(eventTypeNavFor(undefined)).toBeNull();
  });

  it('href setiap tab kembali dikenali sebagai tab yang sama', () => {
    for (const item of EVENT_TYPE_NAV) {
      const types = new URLSearchParams(eventTypeHref(item).split('?')[1]).getAll('type');
      expect(eventTypeNavFor(types as never)?.key).toBe(item.key);
    }
  });
});

describe('isFocusedTaskPath', () => {
  it('halaman masuk, studio, admin, dan pengaturan akun memakai navbar ringkas', () => {
    for (const path of ['/login', '/register', '/demo', '/forgot-password', '/admin', '/admin/riwayat', '/penyelenggara', '/penyelenggara/acara/abc/pendaftar', '/profile/settings', '/profile/privacy']) {
      expect(isFocusedTaskPath(path), path).toBe(true);
    }
  });

  it('halaman jelajah dan akun utama tetap membawa kategori', () => {
    for (const path of ['/', '/events', '/events/lomba-x', '/teams', '/about', '/profile', '/tracker', '/connections', '/penyelenggaraan']) {
      expect(isFocusedTaskPath(path), path).toBe(false);
    }
  });
});
