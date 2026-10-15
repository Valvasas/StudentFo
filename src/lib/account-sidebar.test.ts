import { describe, expect, it } from 'vitest';
import { accountMenuGroups, accountRoleOf, isSidebarCollapsed } from './account-sidebar';

const keysOf = (role: Parameters<typeof accountMenuGroups>[0], demoFeatures = false) =>
  accountMenuGroups(role, { demoFeatures }).flatMap((group) => group.items.map((item) => item.key));

describe('accountRoleOf', () => {
  it('ADMIN selalu admin, apa pun status penyelenggaranya', () => {
    expect(accountRoleOf('ADMIN', null)).toBe('admin');
    expect(accountRoleOf('ADMIN', 'VERIFIED')).toBe('admin');
  });

  it('penyelenggara terverifikasi & yang menunggu verifikasi', () => {
    expect(accountRoleOf('USER', 'VERIFIED')).toBe('organizer');
    expect(accountRoleOf('USER', 'PENDING')).toBe('organizer');
  });

  it('ditolak, dicabut, atau belum mengajukan = peserta', () => {
    expect(accountRoleOf('USER', 'REJECTED')).toBe('participant');
    expect(accountRoleOf('USER', 'REVOKED')).toBe('participant');
    expect(accountRoleOf('USER', null)).toBe('participant');
  });
});

describe('accountMenuGroups', () => {
  it('peserta: pendaftaran & pembayaran paling atas, studio tetap ada sebagai tempat mengajukan diri', () => {
    const keys = keysOf('participant', true);
    expect(keys.slice(0, 2)).toEqual(['daftar', 'pembayaran']);
    expect(keys).toContain('studio');
    expect(keys).not.toContain('moderasi');
    expect(keys.indexOf('pembayaran')).toBe(keys.indexOf('daftar') + 1);
  });

  it('penyelenggara: studio paling atas, item peserta tetap ada', () => {
    const keys = keysOf('organizer');
    expect(keys.slice(0, 3)).toEqual(['studio', 'daftar', 'pembayaran']);
    expect(keys).toEqual(expect.arrayContaining(['daftar', 'pembayaran', 'tersimpan']));
    expect(keys).not.toContain('moderasi');
  });

  it('admin: antrean moderasi paling atas, lalu studio', () => {
    expect(keysOf('admin').slice(0, 2)).toEqual(['moderasi', 'studio']);
  });

  it('pesan & diskusi hanya bila fitur demo aktif', () => {
    expect(keysOf('participant')).not.toContain('pesan');
    expect(keysOf('participant', true)).toEqual(expect.arrayContaining(['pesan', 'diskusi']));
  });

  it('setiap tujuan muncul sekali — dropdown & menu samping tidak boleh berbeda isi', () => {
    for (const role of ['participant', 'organizer', 'admin'] as const) {
      const keys = keysOf(role, true);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('isSidebarCollapsed', () => {
  it('hanya nilai persis "collapsed"', () => {
    expect(isSidebarCollapsed('collapsed')).toBe(true);
    expect(isSidebarCollapsed(undefined)).toBe(false);
    expect(isSidebarCollapsed('open')).toBe(false);
  });
});
