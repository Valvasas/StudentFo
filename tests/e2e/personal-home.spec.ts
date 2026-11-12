import { expect, test } from '@playwright/test';
import { registerForPaidDemoEvent, signInAsDemo, uploadDemoPaymentProof } from './helpers';

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
  await expect(shortcuts.getByRole('link', { name: /Pendaftaran & pembayaran/ })).toHaveAttribute('href', '/pembayaran');
  await expect(shortcuts.getByRole('link', { name: /Papan lamaran/ })).toHaveAttribute('href', '/tracker');
  // Kotak cari memakai URL yang sama dengan /events — tetap jalan tanpa JS.
  await main.getByRole('searchbox', { name: 'Kata kunci pencarian' }).fill('beasiswa');
  await main.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(page).toHaveURL(/\/events\?q=beasiswa/);
});

test('langkah awal: dihitung dari akun, saran pertama juga di lonceng, bisa disembunyikan dari keduanya', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'alur, bukan tampilan; cukup satu proyek');
  await signInAsDemo(page, 'Siswa baru');
  const steps = page.getByRole('region', { name: 'Langkah awalmu' });
  await expect(steps).toBeVisible();
  // Profil belum lengkap → langkah pertama = minat & jenjang, ditandai "berikutnya".
  const next = steps.getByRole('link', { name: /Pilih minat & jenjang — langkah berikutnya/ });
  await expect(next).toHaveAttribute('href', '/profile/interests');
  await expect(steps.getByRole('link', { name: /Simpan kegiatan pertama/ })).toHaveAttribute('href', '/events');
  await expect(steps.getByRole('progressbar', { name: 'Kemajuan langkah awal' })).toHaveAttribute('aria-valuenow', /\d/);

  // Lonceng: titik saran (bukan angka), baris "Langkah berikutnya" yang sama.
  const bell = page.locator('summary[aria-label^="Notifikasi"]').first();
  await expect(bell).toHaveAttribute('aria-label', /saran langkah berikutnya|belum dibaca/);
  await bell.click();
  const menu = bell.locator('xpath=..');
  await expect(menu.getByRole('link', { name: /Langkah berikutnya.*Pilih minat & jenjang/ })).toHaveAttribute('href', '/profile/interests');

  // Menyelesaikan langkah = langkahnya selesai dengan sendirinya (tanpa menandai apa pun).
  await page.goto('/events');
  await page.locator('main').getByRole('button', { name: 'Simpan kegiatan' }).first().click();
  await expect(page.locator('main').getByRole('button', { name: 'Hapus dari simpanan' }).first()).toBeVisible();
  await page.goto('/');
  await expect(steps.getByText(/Simpan kegiatan pertama/)).toContainText('selesai');

  // Sembunyikan → hilang dari beranda DAN lonceng, tetap di beranda.
  await steps.getByRole('button', { name: 'Sembunyikan' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('region', { name: 'Langkah awalmu' })).toHaveCount(0);
  await page.locator('summary[aria-label^="Notifikasi"]').first().click();
  await expect(page.getByRole('link', { name: /Langkah berikutnya/ })).toHaveCount(0);
});

test('lonceng: "Jangan tampilkan lagi" kembali ke halaman yang sama', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'alur, bukan tampilan; cukup satu proyek');
  await signInAsDemo(page, 'Siswa baru', '/events?type=BEASISWA');
  const bell = page.locator('summary[aria-label^="Notifikasi"]').first();
  await bell.click();
  await bell.locator('xpath=..').getByRole('button', { name: 'Jangan tampilkan lagi' }).click();
  await expect(page).toHaveURL(/\/events\?type=BEASISWA$/);
  await expect(page.locator('summary[aria-label^="Notifikasi"]').first()).not.toHaveAttribute('aria-label', /saran/);
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

test('penyelenggara: beranda = ringkasan acara + tindakan, studio selangkah', async ({ page, browser }) => {
  // Bukti contoh bisa sudah diproses tes studio yang berjalan paralel — siapkan sendiri.
  const student = await browser.newContext();
  const studentPage = await student.newPage();
  await registerForPaidDemoEvent(studentPage);
  await uploadDemoPaymentProof(studentPage);
  await student.close();

  await signInAsDemo(page, 'Penyelenggara', '/penyelenggara');
  await page.goto('/');
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: 'Kirim acara baru' })).toHaveAttribute('href', '/submit');
  await expect(main.getByRole('link', { name: 'Buka studio penyelenggara' })).toHaveAttribute('href', '/penyelenggara');
  await expect(main.getByRole('heading', { name: 'Perlu tindakan' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Acara aktif' })).toBeVisible();
  await expect(main.getByRole('link', { name: /Periksa \d+ bukti bayar/ }).first()).toHaveAttribute('href', /\/pendaftar\?status=diperiksa$/);
});

test('404 tetap berstatus 404 dan memberi jalan pulang', async ({ page }) => {
  const response = await page.goto('/events/kegiatan-yang-tidak-pernah-ada');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Halaman ini tidak ada' })).toBeVisible();
  await expect(page.locator('main').getByRole('search')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Jenis kegiatan' }).getByRole('link', { name: 'Beasiswa' })).toBeVisible();
});
