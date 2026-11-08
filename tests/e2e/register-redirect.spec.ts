import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

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

  // Tujuan LUAR melewati pendataan kinerja dulu (ADR-070) — tetap di situs ini.
  const response = await request.get(`${href}/daftar`, { maxRedirects: 0, headers: { 'user-agent': BROWSER_UA } });
  expect(response.status()).toBe(303);
  expect(new URL(response.headers()['location']!, page.url()).pathname).toBe(`${href}/sebelum-daftar`);
});

test('pendataan kinerja: sekali per acara, lalu keluar ke tautan resmi; kunjungan berikutnya langsung keluar', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'terang', 'alur, bukan tampilan');
  let external: string | null = null;
  await context.route(/^(?!http:\/\/(localhost|127\.0\.0\.1))/, (route) => {
    external = route.request().url();
    return route.abort();
  });
  const href = '/events/program-relawan-literasi-desa-angkatan-7';
  await page.goto(`${href}/sebelum-daftar`);
  await expect(page.getByText(/tidak memuat nama atau email/)).toBeVisible();
  // Bukan lomba: pertanyaan rencana tidak ditanyakan.
  await expect(page.getByRole('group', { name: /Rencanamu/ })).toHaveCount(0);

  await page.getByRole('button', { name: /Lanjut ke pendaftaran resmi/ }).click();
  // Isian wajib kosong: peramban menahan kiriman, tetap di halaman ini.
  await expect(page).toHaveURL(new RegExp(`${href}/sebelum-daftar$`));

  await page.getByRole('radio', { name: 'D4/S1' }).check();
  await page.getByRole('radio', { name: 'Instagram' }).check();
  await page.getByRole('button', { name: /Lanjut ke pendaftaran resmi/ }).click();
  await expect.poll(() => external).toMatch(/^https?:\/\//);

  const again = await page.request.get(`${href}/daftar`, { maxRedirects: 0, headers: { 'user-agent': BROWSER_UA } });
  expect(again.status()).toBe(303);
  expect(new URL(again.headers()['location']!).host).not.toBe(new URL(page.url()).host);
  // Halaman pendataan sendiri pun langsung meneruskan — tidak ditanya ulang.
  const survey = await page.request.get(`${href}/sebelum-daftar`, { maxRedirects: 0 });
  expect([303, 307]).toContain(survey.status());
});

test('pendataan lomba menanyakan rencana + menunjuk lobi; admin melihat hasilnya tanpa identitas', async ({ page, context, browser }) => {
  test.skip(test.info().project.name !== 'terang', 'alur, bukan tampilan');
  await context.route(/^(?!http:\/\/(localhost|127\.0\.0\.1))/, (route) => route.abort());
  const href = '/events/olimpiade-matematika-pelajar-tingkat-nasional';
  await page.goto(`${href}/sebelum-daftar`);
  await expect(page.getByRole('link', { name: 'Lobi lomba ini' })).toHaveAttribute('href', '/lobi/olimpiade-matematika-pelajar-tingkat-nasional');
  await page.getByRole('radio', { name: 'SMA/SMK' }).check();
  await page.getByRole('radio', { name: 'TikTok' }).check();
  await page.getByRole('radio', { name: 'Masih mencari tim atau partner' }).check();
  await page.getByLabel('Asal sekolah / kampus (opsional)').fill('SMA Rahasia Satu Orang');
  await page.getByRole('button', { name: /Lanjut ke pendaftaran resmi/ }).click();
  await expect(page).not.toHaveURL(/sebelum-daftar/);

  const admin = await (await browser.newContext()).newPage();
  await signInAsDemo(admin, 'Admin moderator', '/admin/kinerja');
  const row = admin.getByRole('row', { name: /Olimpiade Matematika Pelajar/ });
  await expect(row).toBeVisible();
  // k-anonim: asal sekolah dengan < 5 jawaban tidak disebut namanya.
  await expect(admin.getByText('SMA Rahasia Satu Orang', { exact: false })).toHaveCount(0);
  await admin.close();
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
  expect(robots).toContain('Disallow: /events/*/sebelum-daftar');
  expect(robots).toContain('Disallow: /lobi');
});
