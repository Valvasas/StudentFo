import { expect, test } from '@playwright/test';

/**
 * Halaman akun di mode seed: pilihan jenis akun di /register dipetakan ke
 * persona demo yang setara, dan pesan hanya berasal dari kode tertutup.
 * Jalur Supabase (daftar sungguhan, CAPTCHA, kirim ulang) diuji di unit test
 * skema/pesan karena butuh project Supabase.
 */
test('daftar sebagai Penyelenggara → persona penyelenggara di studio', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('radio', { name: /Penyelenggara/ }).check();
  await page.getByRole('button', { name: 'Coba dengan akun demo' }).click();
  await expect(page).toHaveURL(/\/penyelenggara$/);
});

test('daftar sebagai Peserta mempertahankan tujuan `next`', async ({ page }) => {
  await page.goto('/register?next=%2Fevents');
  await expect(page.getByRole('radio', { name: /Peserta/ })).toBeChecked();
  await page.getByRole('button', { name: 'Coba dengan akun demo' }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test('?type=organizer memilih kartu Penyelenggara; kode pesan asing diabaikan', async ({ page }) => {
  await page.goto('/register?type=organizer&error=Akun%20diblokir%2C%20hubungi%20wa.me%2F123');
  await expect(page.getByRole('radio', { name: /Penyelenggara/ })).toBeChecked();
  await expect(page.getByText(/Akun diblokir/)).toHaveCount(0);
});

test('lupa sandi & cek email jujur soal mode demo, tanpa form palsu', async ({ page }) => {
  for (const path of ['/forgot-password', '/verify-email?email=dinda%40kampus.ac.id']) {
    await page.goto(path);
    await expect(page.getByText(/^Mode demo —/)).toBeVisible();
    await expect(page.locator('main input[type="email"]')).toHaveCount(0);
  }
});
