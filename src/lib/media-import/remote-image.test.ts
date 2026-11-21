import { describe, expect, it } from 'vitest';
import { extractPageImage, fetchRemoteImage, isPrivateAddress, type RemoteImageDeps } from './remote-image';

/** PNG 400×500 minimal yang lolos `inspectImage` (IHDR + IEND). */
function png(width = 400, height = 500): Uint8Array {
  const bytes = new Uint8Array(8 + 25 + 12);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  view.setUint32(33, 0);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes;
}

type Route = { status?: number; type?: string; body?: Uint8Array | string; location?: string };

function deps(routes: Record<string, Route>, dns: Record<string, string[]> = {}): RemoteImageDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    userAgent: 'StudentFoBot/uji',
    resolve: async (host) => dns[host] ?? ['93.184.216.34'],
    fetch: (async (input: URL | string) => {
      const url = String(input);
      calls.push(url);
      const route = routes[url];
      if (!route) return new Response(null, { status: 404 });
      const headers = new Headers();
      if (route.type) headers.set('content-type', route.type);
      if (route.location) headers.set('location', route.location);
      return new Response(route.body ?? null, { status: route.status ?? 200, headers });
    }) as typeof fetch,
  };
}

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.9', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '64:ff9b::a00:1', 'bukan-ip'])(
    '%s ditolak',
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(['93.184.216.34', '8.8.8.8', '2606:4700::6810:84e5'])('%s publik', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe('extractPageImage', () => {
  it('og:image dulu, urutan atribut bebas, entitas & alamat relatif dirapikan', () => {
    const html = `<head><meta name="twitter:image" content="https://cdn.example/tw.jpg">
      <meta content="/poster.jpg?a=1&amp;b=2" property="og:image" /></head>`;
    expect(extractPageImage(html, 'https://lomba.example/info')).toBe('https://lomba.example/poster.jpg?a=1&b=2');
  });
  it('gambar non-https diabaikan, lanjut ke kunci berikutnya', () => {
    const html = `<meta property="og:image" content="http://lama.example/a.jpg"><meta name="twitter:image" content="https://cdn.example/b.png">`;
    expect(extractPageImage(html, 'https://lomba.example/')).toBe('https://cdn.example/b.png');
  });
  it('tanpa gambar pratinjau = null', () => {
    expect(extractPageImage('<meta property="og:title" content="Lomba">', 'https://lomba.example/')).toBeNull();
  });
});

describe('fetchRemoteImage', () => {
  it('tautan gambar langsung → gambar bersih + ukurannya', async () => {
    const d = deps({ 'https://cdn.example/p.png': { type: 'image/png', body: png() } });
    const result = await fetchRemoteImage('https://cdn.example/p.png', d);
    expect(result).toMatchObject({ ok: true, image: { type: 'image/png', width: 400, height: 500 }, from: 'https://cdn.example/p.png' });
  });

  it('halaman HTML → gambar og:image-nya', async () => {
    const d = deps({
      'https://lomba.example/info': { type: 'text/html; charset=utf-8', body: '<meta property="og:image" content="https://cdn.example/poster.png">' },
      'https://cdn.example/poster.png': { type: 'image/png', body: png(1080, 1350) },
    });
    const result = await fetchRemoteImage('https://lomba.example/info', d);
    expect(result).toMatchObject({ ok: true, image: { width: 1080, height: 1350 }, from: 'https://cdn.example/poster.png' });
  });

  it('halaman tanpa og:image → no_page_image', async () => {
    const d = deps({ 'https://lomba.example/': { type: 'text/html', body: '<html><title>x</title></html>' } });
    expect(await fetchRemoteImage('https://lomba.example/', d)).toEqual({ ok: false, error: 'no_page_image' });
  });

  it('http, port lain, kredensial, dan localhost ditolak tanpa satu permintaan pun', async () => {
    const d = deps({});
    for (const url of ['http://cdn.example/a.png', 'https://cdn.example:8443/a.png', 'https://u:p@cdn.example/a.png', 'https://localhost/a.png', 'https://10.0.0.5/a.png']) {
      expect(await fetchRemoteImage(url, d)).toEqual({ ok: false, error: 'url_blocked' });
    }
    expect(d.calls).toEqual([]);
  });

  it('nama host yang mengarah ke alamat privat ditolak (SSRF lewat DNS)', async () => {
    const d = deps({}, { 'internal.example': ['93.184.216.34', '10.0.0.1'] });
    expect(await fetchRemoteImage('https://internal.example/a.png', d)).toEqual({ ok: false, error: 'url_blocked' });
    expect(d.calls).toEqual([]);
  });

  it('redirect ke alamat metadata cloud diperiksa ulang dan ditolak', async () => {
    const d = deps({ 'https://cdn.example/a.png': { status: 302, location: 'https://169.254.169.254/latest/meta-data' } });
    expect(await fetchRemoteImage('https://cdn.example/a.png', d)).toEqual({ ok: false, error: 'url_blocked' });
    expect(d.calls).toEqual(['https://cdn.example/a.png']);
  });

  it('og:image yang menunjuk host privat juga ditolak', async () => {
    const d = deps({ 'https://lomba.example/': { type: 'text/html', body: '<meta property="og:image" content="https://127.0.0.1/x.png">' } });
    expect(await fetchRemoteImage('https://lomba.example/', d)).toEqual({ ok: false, error: 'url_blocked' });
  });

  it('404 = not_found, bukan gambar = not_image, > 5 MB = too_large', async () => {
    expect(await fetchRemoteImage('https://cdn.example/hilang.png', deps({}))).toEqual({ ok: false, error: 'not_found' });
    const text = deps({ 'https://cdn.example/a.png': { type: 'image/png', body: 'bukan gambar' } });
    expect(await fetchRemoteImage('https://cdn.example/a.png', text)).toEqual({ ok: false, error: 'not_image' });
    const huge = deps({ 'https://cdn.example/a.png': { type: 'image/png', body: new Uint8Array(5 * 1024 * 1024 + 1) } });
    expect(await fetchRemoteImage('https://cdn.example/a.png', huge)).toEqual({ ok: false, error: 'too_large' });
  });
});
