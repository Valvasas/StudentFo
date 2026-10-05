import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * `/` bercabang menurut sesi (ADR-053): tamu melihat halaman pemasaran,
 * pengguna yang masuk melihat ringkasan pribadinya — bukan ajakan "buat akun"
 * untuk produk yang sudah ia pakai.
 */
test('tamu melihat halaman pemasaran, bukan ringkasan pribadi', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Jelajahi kegiatan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Perlu tindakan' })).toHaveCount(0);
});

test('pengguna masuk melihat ringkasan pribadi tanpa ajakan mendaftar', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 1, name: /Selamat (pagi|siang|sore|malam), Dinda/ })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Perlu tindakan' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Sesuai minatmu' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Minggu ini' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Mulai gratis' })).toHaveCount(0);
  // Kotak cari memakai URL yang sama dengan /events — tetap jalan tanpa JS.
  await main.getByRole('searchbox', { name: 'Kata kunci pencarian' }).fill('beasiswa');
  await main.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(page).toHaveURL(/\/events\?q=beasiswa/);
});

test('profil belum lengkap: diarahkan memilih minat & jenjang', async ({ page }) => {
  await signInAsDemo(page, 'Siswa baru');
  await expect(page.locator('main').getByRole('link', { name: /Pilih minat & jenjangmu/ })).toHaveAttribute('href', '/profile/interests');
});

test('pintasan peran: moderator melihat tombol ke antrean moderasi', async ({ page }) => {
  await signInAsDemo(page, 'Admin moderator', '/admin');
  await page.goto('/');
  await expect(page.locator('main').getByRole('link', { name: 'Buka antrean moderasi' })).toHaveAttribute('href', '/admin');
});

test('404 tetap berstatus 404 dan memberi jalan pulang', async ({ page }) => {
  const response = await page.goto('/events/kegiatan-yang-tidak-pernah-ada');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Halaman ini tidak ada' })).toBeVisible();
  await expect(page.locator('main').getByRole('search')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Jenis kegiatan' }).getByRole('link', { name: 'Beasiswa' })).toBeVisible();
});
