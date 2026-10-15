import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * `/` bercabang menurut sesi & peran (ADR-053, ADR-056): tamu melihat halaman
 * pemasaran; yang masuk melihat beranda sesuai tujuan utamanya — peserta
 * (tenggat & tagihan), penyelenggara (acara & pendaftar), admin (antrean).
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
  // Studio bukan tujuan peserta — ada di menu akun, tidak di beranda.
  await expect(main.getByRole('link', { name: 'Buka studio penyelenggara' })).toHaveCount(0);
  const shortcuts = main.getByRole('navigation', { name: 'Akses cepat' });
  await expect(shortcuts.getByRole('link', { name: /Pembayaran/ })).toHaveAttribute('href', '/pembayaran');
  await expect(shortcuts.getByRole('link', { name: /Pendaftaran/ })).toHaveAttribute('href', '/tracker');
  // Kotak cari memakai URL yang sama dengan /events — tetap jalan tanpa JS.
  await main.getByRole('searchbox', { name: 'Kata kunci pencarian' }).fill('beasiswa');
  await main.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(page).toHaveURL(/\/events\?q=beasiswa/);
});

test('profil belum lengkap: diarahkan memilih minat & jenjang', async ({ page }) => {
  await signInAsDemo(page, 'Siswa baru');
  await expect(page.locator('main').getByRole('link', { name: /Pilih minat & jenjangmu/ })).toHaveAttribute('href', '/profile/interests');
});

test('admin: beranda = jumlah antrean + keputusan terakhir', async ({ page }) => {
  await signInAsDemo(page, 'Admin moderator', '/admin');
  await page.goto('/');
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: 'Buka antrean moderasi' })).toHaveAttribute('href', '/admin');
  await expect(main.getByRole('link', { name: /Pengajuan penyelenggara/ })).toHaveAttribute('href', '/admin/penyelenggara');
  await expect(main.getByRole('heading', { name: 'Keputusan terakhir' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Sesuai minatmu' })).toHaveCount(0);
});

test('penyelenggara: beranda = ringkasan acara + tindakan, studio selangkah', async ({ page }) => {
  await signInAsDemo(page, 'Penyelenggara', '/penyelenggara');
  await page.goto('/');
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: 'Kirim acara baru' })).toHaveAttribute('href', '/submit');
  await expect(main.getByRole('link', { name: 'Buka studio penyelenggara' })).toHaveAttribute('href', '/penyelenggara');
  await expect(main.getByRole('heading', { name: 'Perlu tindakan' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Acara aktif' })).toBeVisible();
  // Persona punya acara berbayar dengan bukti bayar contoh yang menunggu diperiksa.
  await expect(main.getByRole('link', { name: /Periksa \d+ bukti bayar/ }).first()).toHaveAttribute('href', /\/pendaftar\?status=diperiksa$/);
});

test('404 tetap berstatus 404 dan memberi jalan pulang', async ({ page }) => {
  const response = await page.goto('/events/kegiatan-yang-tidak-pernah-ada');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Halaman ini tidak ada' })).toBeVisible();
  await expect(page.locator('main').getByRole('search')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Jenis kegiatan' }).getByRole('link', { name: 'Beasiswa' })).toBeVisible();
});
