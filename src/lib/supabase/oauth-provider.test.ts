import { describe, expect, it, vi } from 'vitest';
import { isOAuthProviderEnabled, providerEnabledIn } from './oauth-provider';

const input = { supabaseUrl: 'https://abc.supabase.co', anonKey: 'k'.repeat(40) };

function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe('providerEnabledIn', () => {
  it('false hanya kalau provider eksplisit false', () => {
    expect(providerEnabledIn({ external: { google: false } }, 'google')).toBe(false);
    expect(providerEnabledIn({ external: { google: true } }, 'google')).toBe(true);
  });

  it('bentuk tak dikenal dianggap hidup (gagal terbuka)', () => {
    expect(providerEnabledIn(null, 'google')).toBe(true);
    expect(providerEnabledIn('x', 'google')).toBe(true);
    expect(providerEnabledIn({}, 'google')).toBe(true);
    expect(providerEnabledIn({ external: {} }, 'google')).toBe(true);
    expect(providerEnabledIn({ external: { google: 'no' } }, 'google')).toBe(true);
  });
});

describe('isOAuthProviderEnabled', () => {
  it('false saat Supabase melaporkan Google mati', async () => {
    const fetchImpl = respond({ external: { google: false, email: true } });
    await expect(isOAuthProviderEnabled('google', { ...input, fetchImpl })).resolves.toBe(false);
  });

  it('true saat Google hidup, dan memanggil /auth/v1/settings dengan anon key', async () => {
    const fetchImpl = respond({ external: { google: true } });
    await expect(isOAuthProviderEnabled('google', { ...input, fetchImpl })).resolves.toBe(true);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://abc.supabase.co/auth/v1/settings');
    expect((init.headers as Record<string, string>).apikey).toBe(input.anonKey);
  });

  it('true saat balasan non-2xx', async () => {
    await expect(isOAuthProviderEnabled('google', { ...input, fetchImpl: respond({}, 500) })).resolves.toBe(true);
  });

  it('true saat jaringan gagal atau balasan bukan JSON', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const html = vi.fn(async () => new Response('<html></html>', { status: 200 })) as unknown as typeof fetch;
    await expect(isOAuthProviderEnabled('google', { ...input, fetchImpl: down })).resolves.toBe(true);
    await expect(isOAuthProviderEnabled('google', { ...input, fetchImpl: html })).resolves.toBe(true);
  });
});
