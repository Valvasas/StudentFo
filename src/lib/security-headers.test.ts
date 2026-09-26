import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, generateNonce, HSTS_VALUE } from './security-headers';

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((part) => {
      const [name = '', ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe('buildContentSecurityPolicy', () => {
  const prod = directives(
    buildContentSecurityPolicy({ nonce: 'abc123', isDev: false, supabaseUrl: 'https://xyz.supabase.co/' }),
  );

  it('skrip hanya lewat nonce + strict-dynamic, tanpa unsafe-inline/unsafe-eval di produksi', () => {
    const script = prod.get('script-src') ?? [];
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it('menolak framing, plugin, dan pembajakan <base>', () => {
    expect(prod.get('frame-ancestors')).toEqual(["'none'"]);
    expect(prod.get('object-src')).toEqual(["'none'"]);
    expect(prod.get('base-uri')).toEqual(["'self'"]);
  });

  it('form-action mengizinkan redirect OAuth ke origin Supabase (tanpa path) dan Google', () => {
    expect(prod.get('form-action')).toEqual([
      "'self'",
      'https://xyz.supabase.co',
      'https://accounts.google.com',
    ]);
  });

  it('upgrade-insecure-requests hanya di produksi; unsafe-eval hanya di dev', () => {
    expect(prod.has('upgrade-insecure-requests')).toBe(true);
    const dev = directives(buildContentSecurityPolicy({ nonce: 'n', isDev: true }));
    expect(dev.has('upgrade-insecure-requests')).toBe(false);
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
  });

  it('URL Supabase rusak tidak menghasilkan sumber sampah', () => {
    const csp = directives(buildContentSecurityPolicy({ nonce: 'n', isDev: false, supabaseUrl: 'bukan url' }));
    expect(csp.get('form-action')).toEqual(["'self'", 'https://accounts.google.com']);
  });
});

describe('generateNonce', () => {
  it('128 bit acak, base64, tidak berulang', () => {
    const a = generateNonce();
    expect(atob(a)).toHaveLength(16);
    expect(a).not.toEqual(generateNonce());
  });
});

it('HSTS: minimal 1 tahun + includeSubDomains + preload', () => {
  const maxAge = Number(/max-age=(\d+)/.exec(HSTS_VALUE)?.[1]);
  expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
  expect(HSTS_VALUE).toContain('includeSubDomains');
  expect(HSTS_VALUE).toContain('preload');
});
