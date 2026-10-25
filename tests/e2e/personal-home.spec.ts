import { expect, test } from '@playwright/test';
import { registerForPaidDemoEvent, signInAsDemo, uploadDemoPaymentProof } from './helpers';

/**
 * `/` bercabang menurut sesi & peran (ADR-053, ADR-056): tamu melihat halaman
 * pemasaran; yang masuk melihat beranda sesuai tujuan utamanya — peserta
 * (tenggat & tagihan), penyelenggara (acara & pendaftar), admin (antrean).
 */
test('tamu melihat halaman pemasaran, bukan ringkasan pribadi', async ({ page }) => {
  await page.goto('/');
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: 'Jelajahi semua kegiatan' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Buat akun gratis' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Perlu tindakan' })).toHaveCount(0);
  // Jenis kegiatan di layar pertama = tautan filter yang sama dengan navbar.
  await expect(main.getByRole('navigation', { name: 'Jenis kegiatan' }).getByRole('link', { name: /^Beasiswa/ })).toHaveAttribute(
    'href',
    '/events?type=BEASISWA',
  );
  // Kotak cari hero adalah form GET biasa — hasilnya punya URL sendiri.
  await main.getByRole('searchbox', { name: 'Cari kegiatan' }).fill('desain');
  await main.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(page).toHaveURL(/\/events\?q=desain/);
});

test('tur beranda: diam saat "kurangi gerak", tetap bisa dipilih per langkah', async ({ page }) => {
  // Config menjalankan semua tes dengan reducedMotion: 'reduce' — tur tidak boleh berputar sendiri.
  await page.goto('/#cara-kerja');
  const tour = page.locator('#cara-kerja');
  await expect(tour.getByText('Tur dijeda')).toBeVisible();
  const step = tour.getByRole('button', { name: /Cari tim/ }).filter({ visible: true });
  await step.click();
  await expect(step).toHaveAttribute('aria-current', 'step');
  await expect(tour.getByText('Tur dijeda')).toBeVisible();
  await expect(tour.locator('[aria-live="polite"]')).toContainText('Langkah 5 dari 5: Cari tim');
  // Memutar adalah pilihan pengguna, jadi tetap dihormati.
  await tour.getByRole('button', { name: 'Putar tur' }).filter({ visible: true }).click();
  await expect(tour.getByText('Tur berjalan')).toBeVisible();
});

test('pengguna masuk melihat ringkasan pribadi tanpa ajakan mendaftar', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 1, name: /Selamat (pagi|siang|sore|malam), Dinda/ })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Perlu tindakan' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Sesuai minatmu' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Minggu ini' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Buat akun gratis' })).toHaveCount(0);
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

test('profil belum lengkap: diarahkan memilih minat & jenjang', async ({ page }) => {
  await signInAsDemo(page, 'Siswa baru');
  await expect(page.locator('main').getByRole('link', { name: /Pilih minat & jenjangmu/ })).toHaveAttribute('href', '/profile/interests');
});

test('akun baru: panduan "Mulai di sini" dicentang dari keadaan akun dan bisa disembunyikan', async ({ page }) => {
  await signInAsDemo(page, 'Siswa baru');
  const guide = page.getByRole('region', { name: 'Mulai di sini' });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('link', { name: /Pilih minat & jenjangmu/ })).not.toContainText('(selesai)');
  await expect(guide.getByRole('link', { name: /Buat kartu pemain/ })).toHaveAttribute('href', '/teams/cocok');

  await guide.getByRole('button', { name: /Sembunyikan/ }).click();
  await expect(page.getByRole('region', { name: 'Mulai di sini' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Mulai di sini' })).toHaveCount(0);
  // Yang mendesak tidak ikut hilang.
  await expect(page.locator('main').getByRole('heading', { name: 'Perlu tindakan' })).toBeVisible();
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
