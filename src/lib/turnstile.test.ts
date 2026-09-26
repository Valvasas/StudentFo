import { describe, expect, it } from 'vitest';
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from './turnstile';

function fakeFetch(reply: () => Response | Promise<Response>) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as URLSearchParams });
    return reply();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('verifyTurnstile', () => {
  it('lolos hanya kalau siteverify menjawab success: true', async () => {
    const { impl, calls } = fakeFetch(() => json({ success: true }));
    await expect(verifyTurnstile({ token: 'tok', secret: 'sec', remoteIp: '1.2.3.4', fetchImpl: impl })).resolves.toBe(true);
    expect(calls[0]?.url).toBe(TURNSTILE_VERIFY_URL);
    expect(calls[0]?.body.get('secret')).toBe('sec');
    expect(calls[0]?.body.get('response')).toBe('tok');
    expect(calls[0]?.body.get('remoteip')).toBe('1.2.3.4');
  });

  it('success selain boolean true (mis. "true") ditolak', async () => {
    const { impl } = fakeFetch(() => json({ success: 'true' }));
    await expect(verifyTurnstile({ token: 'tok', secret: 'sec', fetchImpl: impl })).resolves.toBe(false);
  });

  it('fail closed: HTTP error, JSON rusak, dan kegagalan jaringan = gagal', async () => {
    for (const reply of [
      () => json({ success: true }, 500),
      () => new Response('bukan json'),
      () => Promise.reject(new Error('ECONNRESET')),
    ]) {
      const { impl } = fakeFetch(reply);
      await expect(verifyTurnstile({ token: 'tok', secret: 'sec', fetchImpl: impl })).resolves.toBe(false);
    }
  });

  it('token kosong atau terlalu panjang ditolak tanpa memanggil Cloudflare', async () => {
    const { impl, calls } = fakeFetch(() => json({ success: true }));
    await expect(verifyTurnstile({ token: '', secret: 'sec', fetchImpl: impl })).resolves.toBe(false);
    await expect(verifyTurnstile({ token: 'x'.repeat(2049), secret: 'sec', fetchImpl: impl })).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('IP "unknown" tidak dikirim sebagai remoteip', async () => {
    const { impl, calls } = fakeFetch(() => json({ success: true }));
    await verifyTurnstile({ token: 'tok', secret: 'sec', remoteIp: 'unknown', fetchImpl: impl });
    expect(calls[0]?.body.has('remoteip')).toBe(false);
  });
});
