import { describe, expect, it } from 'vitest';
import { resolveDataMode, type DataModeInput } from './env';

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
