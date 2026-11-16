import { describe, expect, it } from 'vitest';
import { resolveDataMode, resolveSiteUrl, type DataModeInput } from './env';

const base: DataModeInput = {
  supabaseUrl: undefined,
  anonKey: undefined,
  nodeEnv: 'development',
  allowDemoInProduction: false,
  nextPhase: undefined,
};

describe('resolveDataMode', () => {
  it('supabase kalau URL dan anon key dua-duanya ada', () => {
    expect(
      resolveDataMode({ ...base, supabaseUrl: 'https://x.supabase.co', anonKey: 'k'.repeat(40), nodeEnv: 'production' }),
    ).toBe('supabase');
  });

  it('seed di development walau setengah terkonfigurasi', () => {
    expect(resolveDataMode({ ...base, supabaseUrl: 'https://x.supabase.co' })).toBe('seed');
  });

  it('MELEMPAR di runtime produksi tanpa kredensial (tidak diam-diam menampilkan data fiktif)', () => {
    expect(() => resolveDataMode({ ...base, nodeEnv: 'production' })).toThrow(/ALLOW_DEMO_IN_PRODUCTION/);
  });

  it('seed di produksi hanya dengan opt-in eksplisit', () => {
    expect(resolveDataMode({ ...base, nodeEnv: 'production', allowDemoInProduction: true })).toBe('seed');
  });

  it('fase `next build` tidak butuh kredensial', () => {
    expect(
      resolveDataMode({ ...base, nodeEnv: 'production', nextPhase: 'phase-production-build' }),
    ).toBe('seed');
  });
});

describe('resolveSiteUrl', () => {
  const none = { configured: undefined, vercelEnv: undefined, vercelUrl: undefined };

  it('nilai eksplisit selalu menang, juga di preview', () => {
    expect(resolveSiteUrl({ configured: 'https://studentfo.vercel.app', vercelEnv: 'preview', vercelUrl: 'x-abc.vercel.app' })).toBe(
      'https://studentfo.vercel.app',
    );
  });

  it('preview Vercel tanpa nilai eksplisit memakai host deploy-nya, bukan localhost', () => {
    expect(resolveSiteUrl({ ...none, vercelEnv: 'preview', vercelUrl: 'studentfo-git-x.vercel.app' })).toBe(
      'https://studentfo-git-x.vercel.app',
    );
  });

  it('produksi tanpa nilai eksplisit TIDAK memakai VERCEL_URL (host per-deploy)', () => {
    expect(resolveSiteUrl({ ...none, vercelEnv: 'production', vercelUrl: 'studentfo-abc123.vercel.app' })).toBe('http://localhost:3000');
  });

  it('lokal jatuh ke localhost', () => {
    expect(resolveSiteUrl(none)).toBe('http://localhost:3000');
  });
});
