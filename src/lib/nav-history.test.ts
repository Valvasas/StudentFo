import { describe, expect, it } from 'vitest';
import { createVisitLog, returnsTo } from './nav-history';

describe('returnsTo', () => {
  it('cocok bila path sama walau query berbeda — saringan daftar asal dipulihkan', () => {
    expect(returnsTo('/tracker?tahap=APPLIED', '/tracker')).toBe(true);
    expect(returnsTo('/events?type=LOMBA&page=3', '/events')).toBe(true);
    expect(returnsTo('/profile/settings', '/profile/settings')).toBe(true);
  });

  it('garis miring penutup & hash tidak membedakan', () => {
    expect(returnsTo('/tracker/', '/tracker')).toBe(true);
    expect(returnsTo('/profile/settings#akun', '/profile/settings')).toBe(true);
  });

  it('path lain, halaman anak, atau tanpa riwayat = tautan biasa', () => {
    expect(returnsTo(null, '/tracker')).toBe(false);
    expect(returnsTo('/teams/abc', '/connections')).toBe(false);
    expect(returnsTo('/tracker/lomba-x', '/tracker')).toBe(false);
    expect(returnsTo('/', '/profile')).toBe(false);
  });
});

describe('createVisitLog', () => {
  it('mencatat satu langkah ke belakang', () => {
    const log = createVisitLog();
    expect(log.previous()).toBeNull();
    log.record('/events?type=LOMBA');
    expect(log.previous()).toBeNull();
    log.record('/events/lomba-a');
    expect(log.previous()).toBe('/events?type=LOMBA');
  });

  it('URL yang sama dicatat ulang (render ulang) tidak menghapus asal', () => {
    const log = createVisitLog();
    log.record('/tracker');
    log.record('/tracker/x');
    log.record('/tracker/x');
    expect(log.previous()).toBe('/tracker');
  });

  it('hasil aksi di halaman yang sama (?notice=) menjadi asal baru — tombol kembali tidak memutar ulang aksi', () => {
    const log = createVisitLog();
    log.record('/profile/settings');
    log.record('/profile/settings/keamanan');
    log.record('/profile/settings/keamanan?notice=password_updated');
    expect(returnsTo(log.previous(), '/profile/settings')).toBe(false);
  });
});
