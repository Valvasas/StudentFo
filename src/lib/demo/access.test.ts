import { describe, expect, it } from 'vitest';
import { hostnameOf, isDemoAdminAllowed, isDemoHostAllowed, parseHostList } from './access';

describe('parseHostList / hostnameOf', () => {
  it('menormalkan huruf, spasi, dan port', () => {
    expect(parseHostList(' Demo.Contoh.id:443 , preview.contoh.id ,, ')).toEqual(['demo.contoh.id', 'preview.contoh.id']);
  });

  it('kosong atau tidak diisi = tidak ada host', () => {
    expect(parseHostList(undefined)).toEqual([]);
    expect(parseHostList('  ,  ')).toEqual([]);
  });

  it('IPv6 bertanda kurung tidak terpotong di titik dua pertama', () => {
    expect(hostnameOf('[::1]:3000')).toBe('[::1]');
  });
});

describe('isDemoHostAllowed', () => {
  const allowedHosts = ['demo.contoh.id'];

  it('di luar produksi selalu diizinkan, daftar host tidak dibutuhkan', () => {
    expect(isDemoHostAllowed({ isProduction: false, allowedHosts: [], host: 'localhost:3000' })).toBe(true);
  });

  it('di produksi hanya host yang terdaftar (port diabaikan, huruf besar sama)', () => {
    expect(isDemoHostAllowed({ isProduction: true, allowedHosts, host: 'demo.contoh.id' })).toBe(true);
    expect(isDemoHostAllowed({ isProduction: true, allowedHosts, host: 'DEMO.contoh.id:8443' })).toBe(true);
    expect(isDemoHostAllowed({ isProduction: true, allowedHosts, host: 'studentfo.id' })).toBe(false);
  });

  it('subdomain atau akhiran yang mirip tidak lolos', () => {
    expect(isDemoHostAllowed({ isProduction: true, allowedHosts, host: 'evil-demo.contoh.id' })).toBe(false);
    expect(isDemoHostAllowed({ isProduction: true, allowedHosts, host: 'demo.contoh.id.evil.test' })).toBe(false);
  });

  it('gagal tertutup: produksi tanpa daftar host atau tanpa header Host menolak', () => {
    expect(isDemoHostAllowed({ isProduction: true, allowedHosts: [], host: 'demo.contoh.id' })).toBe(false);
    expect(isDemoHostAllowed({ isProduction: true, allowedHosts, host: null })).toBe(false);
    expect(isDemoHostAllowed({ isProduction: true, allowedHosts, host: '' })).toBe(false);
  });
});

describe('isDemoAdminAllowed', () => {
  const configuredKey = 'kunci-rahasia-panjang-1234';

  it('dengan kunci terpasang: hanya kunci yang tepat', () => {
    expect(isDemoAdminAllowed({ isProduction: true, configuredKey, presentedKey: configuredKey })).toBe(true);
    expect(isDemoAdminAllowed({ isProduction: true, configuredKey, presentedKey: 'salah' })).toBe(false);
    expect(isDemoAdminAllowed({ isProduction: true, configuredKey, presentedKey: undefined })).toBe(false);
    expect(isDemoAdminAllowed({ isProduction: true, configuredKey, presentedKey: '' })).toBe(false);
  });

  it('kunci yang hanya awalannya cocok ditolak', () => {
    expect(isDemoAdminAllowed({ isProduction: true, configuredKey, presentedKey: configuredKey.slice(0, -1) })).toBe(false);
    expect(isDemoAdminAllowed({ isProduction: true, configuredKey, presentedKey: `${configuredKey}x` })).toBe(false);
  });

  it('kunci tetap berlaku di luar produksi bila diisi', () => {
    expect(isDemoAdminAllowed({ isProduction: false, configuredKey, presentedKey: undefined })).toBe(false);
  });

  it('tanpa kunci: terbuka saat pengembangan, tertutup di produksi', () => {
    expect(isDemoAdminAllowed({ isProduction: false, configuredKey: undefined, presentedKey: undefined })).toBe(true);
    expect(isDemoAdminAllowed({ isProduction: true, configuredKey: undefined, presentedKey: undefined })).toBe(false);
    expect(isDemoAdminAllowed({ isProduction: true, configuredKey: undefined, presentedKey: 'apa-saja' })).toBe(false);
  });
});
