import { expect, test } from '@playwright/test';

/**
 * Halaman akun di mode seed: pilihan jenis akun di /register dipetakan ke
 * persona demo yang setara, dan pesan hanya berasal dari kode tertutup.
 * Jalur Supabase (daftar sungguhan, CAPTCHA, kirim ulang) diuji di unit test
 * skema/pesan karena butuh project Supabase.
 */
test('pintu penyelenggara: daftar → persona penyelenggara di studio', async ({ page }) => {
  await page.goto('/penyelenggara/daftar');
  await expect(page.getByRole('heading', { level: 1, name: 'Daftarkan lembagamu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Daftar sebagai peserta' })).toHaveAttribute('href', '/register');
  await page.getByRole('button', { name: 'Coba dengan akun demo penyelenggara' }).click();
  await expect(page).toHaveURL(/\/penyelenggara$/);
});

test('daftar peserta mempertahankan tujuan `next`, tanpa pilihan jenis akun', async ({ page }) => {
  await page.goto('/register?next=%2Fevents');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Daftar sebagai penyelenggara' })).toHaveAttribute('href', '/penyelenggara/daftar');
  await page.getByRole('button', { name: 'Coba dengan akun demo' }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test('tautan lama ?type=organizer pindah ke pintu penyelenggara; kode pesan asing diabaikan', async ({ page }) => {
  await page.goto('/register?type=organizer&error=Akun%20diblokir%2C%20hubungi%20wa.me%2F123');
  await expect(page).toHaveURL(/\/penyelenggara\/daftar\?error=/);
  await expect(page.getByText(/Akun diblokir/)).toHaveCount(0);
});

test('tamu di /penyelenggara melihat pengenalan studio, bukan dilempar ke halaman masuk', async ({ page }) => {
  await page.goto('/penyelenggara');
  await expect(page).toHaveURL(/\/penyelenggara$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('tanpa spreadsheet');
  await expect(page.getByRole('main').getByRole('link', { name: /Daftarkan lembagamu/ }).first()).toHaveAttribute('href', '/penyelenggara/daftar');
  // Navbar tamu di halaman studio menuju pintu penyelenggara.
  await expect(page.getByRole('banner').getByRole('link', { name: 'Masuk', exact: true })).toHaveAttribute('href', '/penyelenggara/masuk');
});

test('halaman studio yang butuh akun mengarah ke pintu masuk penyelenggara', async ({ page }) => {
  await page.goto('/penyelenggara/acara/e1000000-0000-4000-8000-000000000004');
  await expect(page).toHaveURL(/\/penyelenggara\/masuk\?next=%2Fpenyelenggara%2Facara%2F/);
  await expect(page.getByRole('heading', { level: 1, name: 'Masuk ke Studio' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Masuk sebagai peserta' })).toHaveAttribute('href', '/login');
});

test('lupa sandi & cek email jujur soal mode demo, tanpa form palsu', async ({ page }) => {
  for (const path of ['/forgot-password', '/verify-email?email=dinda%40kampus.ac.id']) {
    await page.goto(path);
    await expect(page.getByText(/^Mode demo —/)).toBeVisible();
    await expect(page.locator('main input[type="email"]')).toHaveCount(0);
  }
});
