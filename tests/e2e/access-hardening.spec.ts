import { expect, test } from '@playwright/test';
import { DEMO_ADMIN_TEST_KEY } from './demo-keys';
import { signInAsDemo } from './helpers';

/**
 * ADR-057: situs yang dilihat orang tidak boleh mengumumkan panel admin atau
 * menawarkan "masuk sebagai Admin" di halaman masuknya.
 */
const ADMIN_PATHS = ['/admin', '/admin/riwayat', '/admin/kalibrasi', '/admin/promosi', '/admin/penyelenggara'];

test.describe('panel admin tidak membocorkan dirinya', () => {
  for (const path of ADMIN_PATHS) {
    test(`tamu: ${path} = 404 asli, judul netral, tanpa petunjuk`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle(/^Halaman tidak ditemukan/);
      await expect(page.getByRole('heading', { name: 'Halaman ini tidak ada' })).toBeVisible();
      await expect(page.locator('main')).not.toContainText(/admin|moderasi|akses terbatas/i);
    });

    test(`peserta biasa: ${path} = 404 yang sama`, async ({ page }) => {
      await signInAsDemo(page, 'Mahasiswa');
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle(/^Halaman tidak ditemukan/);
      await expect(page.locator('main')).not.toContainText(/admin|moderasi|akses terbatas/i);
    });
  }

  test('admin sungguhan tetap masuk dan judul aslinya tampil', async ({ page }) => {
    await signInAsDemo(page, 'Admin moderator', '/admin');
    await expect(page).toHaveTitle(/^Antrean moderasi/);
    await expect(page.getByRole('heading', { name: 'Antrean moderasi', level: 1 })).toBeVisible();
  });

  test('robots.txt tidak menyebut /admin', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).not.toMatch(/admin/i);
  });

  test('alamat yang tidak ada punya judul sendiri, bukan judul beranda', async ({ page }) => {
    const response = await page.goto('/halaman-yang-tidak-ada');
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle(/^Halaman tidak ditemukan/);
  });
});

test.describe('akun demo tidak ditawarkan di halaman masuk', () => {
  test('/login = form email & kata sandi, tanpa kartu persona', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Kata sandi')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Masuk sebagai/ })).toHaveCount(0);
    await expect(page.getByText(/Admin moderator/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Lihat pratinjau dengan akun demo' })).toBeVisible();
  });

  test('/demo menawarkan tiga persona, TANPA Admin', async ({ page }) => {
    await page.goto('/demo');
    for (const persona of ['Mahasiswa', 'Siswa baru', 'Penyelenggara']) {
      await expect(page.getByRole('button', { name: new RegExp(`^Masuk sebagai ${persona}:`) })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /^Masuk sebagai Admin moderator:/ })).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('Tinjau dan setujui');
  });

  test('kunci salah atau kosong tidak membuka persona Admin', async ({ page }) => {
    for (const query of ['?akses=salah', '?akses=', `?akses=${DEMO_ADMIN_TEST_KEY.slice(0, -1)}`]) {
      await page.goto(`/demo${query}`);
      await expect(page.getByRole('button', { name: /^Masuk sebagai Admin moderator:/ })).toHaveCount(0);
    }
  });

  test('kunci yang benar membuka persona Admin', async ({ page }) => {
    await page.goto(`/demo?akses=${DEMO_ADMIN_TEST_KEY}`);
    await expect(page.getByRole('button', { name: /^Masuk sebagai Admin moderator:/ })).toBeVisible();
  });

  test('host yang tidak terdaftar: /demo = 404 (flag demo di deploy yang salah)', async ({ page, baseURL }) => {
    const otherHost = new URL(baseURL!).origin.replace('localhost', '127.0.0.1');
    const response = await page.goto(`${otherHost}/demo`);
    expect(response?.status()).toBe(404);
  });
});
