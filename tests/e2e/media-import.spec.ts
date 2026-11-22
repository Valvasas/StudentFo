import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Impor media otomatis ke antrean moderasi (ADR-095), mode seed: admin
 * mengantrekan gambar untuk kegiatan PENDING, memprosesnya, lalu melihat
 * poster & slide ringkasan di kartu antrean SEBELUM menyetujui — gambarnya
 * benar-benar terbaca (rute foto melayani staf untuk kegiatan belum tayang).
 */
test('admin menyiapkan poster & slide otomatis untuk kegiatan di antrean', async ({ page, playwright }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama; cukup satu proyek');
  test.setTimeout(120_000);
  await signInAsDemo(page, 'Admin moderator', '/admin');

  const card = page.locator('#antrean-acara ~ ul > li').filter({ has: page.getByRole('button', { name: 'Siapkan gambar otomatis' }) }).first();
  await expect(card).toBeVisible();
  const title = (await card.getByRole('heading', { level: 2 }).textContent())?.trim() ?? '';

  await card.getByRole('button', { name: 'Siapkan gambar otomatis' }).click();
  await expect(page.getByText(/Gambar otomatis diantrekan/)).toBeVisible();

  await page.getByRole('button', { name: 'Siapkan gambar sekarang' }).click();
  await expect(page.getByText(/Gambar otomatis diproses/)).toBeVisible({ timeout: 60_000 });

  // Gambar resmi dari laman sumber contoh tidak terjangkau di sini; empat gambar buatan tetap jadi,
  // dan poster ringkasan mengisi slot poster karena belum ada poster.
  const done = page.locator('#antrean-acara ~ ul > li').filter({ has: page.getByRole('heading', { level: 2, name: title }) });
  const poster = done.getByRole('img', { name: `Poster ${title}` });
  await expect(poster).toBeVisible();
  expect(await poster.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1080);
  await expect(done.getByRole('img')).toHaveCount(4);
  await expect(done.getByRole('link', { name: 'Kelola poster & slide' })).toBeVisible();

  // Berkas kegiatan belum tayang: staf dapat salinan privat, tamu 404.
  const src = await poster.getAttribute('src');
  expect(src).toMatch(/^\/media\/foto\//);
  const asStaff = await page.request.get(src!);
  expect(asStaff.status()).toBe(200);
  expect(asStaff.headers()['cache-control']).toBe('private, no-store');
  const guest = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  expect((await guest.get(src!)).status()).toBe(404);
  await guest.dispose();

  // Halaman media admin membuka kegiatan yang BELUM tayang lewat id-nya.
  await done.getByRole('link', { name: 'Kelola poster & slide' }).click();
  await expect(page.getByRole('heading', { name: 'Poster & video' })).toBeVisible();
  await expect(page.getByText(/Belum tayang — gambar di sini ikut tampil/)).toBeVisible();
});
