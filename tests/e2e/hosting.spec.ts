import { expect, test } from '@playwright/test';

/** Hal yang dilihat hosting, monitor, dan layar utama ponsel — bukan tampilan halaman. */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'respons HTTP, bukan tampilan; cukup satu proyek');
});

test('/favicon.ico dilayani dari ikon merek, bukan 404', async ({ request }) => {
  const response = await request.get('/favicon.ico');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
});

test('/api/health: 200, tidak di-cache, melaporkan mode data', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'ok', dataMode: 'seed' });
});

test('layar utama: manifest bernama pendek, semua ikon bisa diambil, tanpa mode layar penuh', async ({ page, request }) => {
  await page.goto('/');
  // Mode layar penuh = tanpa tombol kembali di iOS (lihat manifest.ts).
  await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]')).toHaveCount(0);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'StudentFo');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(manifestHref!)).json();
  expect(manifest).toMatchObject({ short_name: 'StudentFo', display: 'browser', start_url: '/' });

  const iconHrefs = [
    ...manifest.icons.map((icon: { src: string }) => icon.src),
    ...(await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')!))),
  ];
  expect(iconHrefs.length).toBeGreaterThanOrEqual(5);
  for (const href of iconHrefs) {
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
    expect(response.headers()['content-type'], href).toBe('image/png');
  }
});
