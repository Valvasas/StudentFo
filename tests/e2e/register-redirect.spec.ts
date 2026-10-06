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
  // Beasiswa contoh tidak memakai pendaftaran langsung (ADR-055), jadi tombol utamanya tetap tautan luar.
  await page.goto('/events?type=BEASISWA');
  const href = await page.locator('main a[href^="/events/"]').first().getAttribute('href');
  await page.goto(href!);

  const register = page.getByRole('link', { name: /Daftar sekarang/ });
  await expect(register).toHaveAttribute('href', `${href}/daftar`);
  await expect(register).toHaveAttribute('rel', /noopener/);

  const response = await request.get(`${href}/daftar`, { maxRedirects: 0, headers: { 'user-agent': BROWSER_UA } });
  expect(response.status()).toBe(303);
  expect(response.headers()['location']).toMatch(/^https?:\/\//);
  expect(new URL(response.headers()['location']!).host).not.toBe(new URL(page.url()).host);
});

test('acara berpendaftaran langsung: tautan luar sekunder tetap lewat pengalih yang sama', async ({ page }) => {
  const href = '/events/workshop-analisis-data-dengan-python-untuk-pemula';
  await page.goto(href);
  await expect(page.getByRole('link', { name: /^Daftar (lagi )?di StudentFo/ }).first()).toHaveAttribute('href', `${href}/pendaftaran`);
  const external = page.getByRole('link', { name: /lewat situs penyelenggara/ }).first();
  await expect(external).toHaveAttribute('href', `${href}/daftar`);
  await expect(external).toHaveAttribute('rel', /noopener/);
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
