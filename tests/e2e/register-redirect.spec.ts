import { expect, test } from '@playwright/test';

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

/**
 * "Daftar sekarang" keluar lewat /events/<slug>/daftar supaya klik tercatat
 * (ADR-032). Yang wajib dijaga: tujuannya selalu tautan pendaftaran event
 * itu sendiri (bukan open redirect), dan slug tak dikenal tidak pernah
 * mengalihkan ke luar situs.
 */
test('tombol Daftar menunjuk pengalih internal yang mengarah ke tautan pendaftaran event', async ({ page, request }) => {
  // Acara contoh tanpa formulir StudentFo (ADR-056): yang berformulir menautkan /formulir, bukan /daftar.
  const href = '/events/program-relawan-literasi-desa-angkatan-7';
  await page.goto(href);

  const register = page.getByRole('link', { name: /Daftar sekarang/ });
  await expect(register).toHaveAttribute('href', `${href}/daftar`);
  await expect(register).toHaveAttribute('rel', /noopener/);

  const response = await request.get(`${href}/daftar`, { maxRedirects: 0, headers: { 'user-agent': BROWSER_UA } });
  expect(response.status()).toBe(303);
  expect(response.headers()['location']).toMatch(/^https?:\/\//);
  expect(new URL(response.headers()['location']!).host).not.toBe(new URL(page.url()).host);
});

test('slug tak dikenal & parameter tujuan palsu tidak pernah mengalihkan ke luar situs', async ({ request, baseURL }) => {
  for (const path of ['/events/tidak-ada/daftar', '/events/tidak-ada/daftar?to=https://evil.example', '/events/%2F%2Fevil.example/daftar']) {
    const response = await request.get(path, { maxRedirects: 0, headers: { 'user-agent': BROWSER_UA } });
    expect([303, 404]).toContain(response.status());
    const location = response.headers()['location'];
    if (location) expect(new URL(location, baseURL).host).toBe(new URL(baseURL!).host);
  }
});

test('robots.txt melarang crawler mengikuti pengalih', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /events/*/daftar');
});
