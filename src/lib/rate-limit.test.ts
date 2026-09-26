import { describe, expect, it } from 'vitest';
import { clientIpFrom, MemoryRateLimiter, RATE_LIMITS, rateLimitBucket } from './rate-limit';

const headers = (entries: Record<string, string>) => new Headers(entries);

describe('clientIpFrom', () => {
  it('memakai entri PERTAMA x-forwarded-for (yang ditulis proxy terdepan)', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
  });

  it('jatuh ke x-real-ip, lalu "unknown"', () => {
    expect(clientIpFrom(headers({ 'x-real-ip': '2001:DB8::1' }))).toBe('2001:db8::1');
    expect(clientIpFrom(headers({}))).toBe('unknown');
  });

  it('isi header yang bukan IP tidak diteruskan ke kunci ember', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '<script>alert(1)</script>' }))).toBe('unknown');
    expect(clientIpFrom(headers({ 'x-forwarded-for': 'a'.repeat(500) }))).toBe('unknown');
  });
});

describe('rateLimitBucket', () => {
  it('deterministik, tanpa IP mentah, dan terpisah per aturan', async () => {
    const a = await rateLimitBucket(RATE_LIMITS.signInPerIp, 's3cret', '203.0.113.7');
    expect(a).toBe(await rateLimitBucket(RATE_LIMITS.signInPerIp, 's3cret', '203.0.113.7'));
    expect(a).not.toContain('203.0.113.7');
    expect(a).toMatch(/^signin-ip:[0-9a-f]{64}$/);
    expect(a.length).toBeLessThanOrEqual(128); // CHECK di rate_limit_hits.bucket
    expect(await rateLimitBucket(RATE_LIMITS.signUpPerIp, 's3cret', '203.0.113.7')).not.toBe(a);
  });

  it('bagian dipisah tegas: ("ab","c") ≠ ("a","bc")', async () => {
    const rule = RATE_LIMITS.signInPerIpEmail;
    expect(await rateLimitBucket(rule, 'k', 'ab', 'c')).not.toBe(await rateLimitBucket(rule, 'k', 'a', 'bc'));
  });

  it('rahasia berbeda → ember berbeda (tidak bisa ditebak tanpa rahasia)', async () => {
    const rule = RATE_LIMITS.submissionPerIp;
    expect(await rateLimitBucket(rule, 'k1', '1.1.1.1')).not.toBe(await rateLimitBucket(rule, 'k2', '1.1.1.1'));
  });
});

describe('MemoryRateLimiter', () => {
  it('lolos sampai batas, lalu menolak; ember lain bebas; jendela bergeser', () => {
    const limiter = new MemoryRateLimiter();
    const t0 = 1_000_000;
    expect([1, 2, 3].map(() => limiter.consume('a', 3, 60, t0))).toEqual([true, true, true]);
    expect(limiter.consume('a', 3, 60, t0 + 1)).toBe(false);
    expect(limiter.consume('b', 3, 60, t0 + 1)).toBe(true);
    expect(limiter.consume('a', 3, 60, t0 + 61_000)).toBe(true);
  });

  it('penolakan tidak memperpanjang hukuman', () => {
    const limiter = new MemoryRateLimiter();
    limiter.consume('a', 1, 60, 0);
    for (let t = 1; t < 60_000; t += 5_000) limiter.consume('a', 1, 60, t);
    expect(limiter.consume('a', 1, 60, 60_001)).toBe(true);
  });
});

it('setiap aturan masuk akal: batas ≥ 1, jendela ≥ 1 menit', () => {
  for (const rule of Object.values(RATE_LIMITS)) {
    expect(rule.limit).toBeGreaterThanOrEqual(1);
    expect(rule.windowSeconds).toBeGreaterThanOrEqual(60);
  }
});
