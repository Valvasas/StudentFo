import { expect, test, type Page } from '@playwright/test';

/**
 * Form daftar sungguhan (ADR-069). Di `localhost` mode demo menggantikan form
 * dengan tombol persona; di host lain (127.0.0.1) demo tidak tersedia, jadi
 * form email tampil dan kirimannya dijawab `unavailable` oleh server mode
 * seed — cukup untuk menguji isi form, pencocokan sandi, dan pemulihan
 * isian setelah galat tanpa project Supabase.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'alur, bukan tampilan; cukup satu proyek');
});

const nonDemo = (baseURL: string | undefined, path: string) => `${new URL(baseURL!).origin.replace('localhost', '127.0.0.1')}${path}`;

async function fillPasswords(page: Page, password: string, confirm: string) {
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByLabel('Ulangi kata sandi').fill(confirm);
}

test('daftar peserta: ulangi kata sandi dicek saat mengetik dan menahan kiriman bila beda', async ({ page, baseURL }) => {
  await page.goto(nonDemo(baseURL, '/register'));
  await expect(page.getByLabel('Jabatan di lembaga')).toHaveCount(0);

  await page.getByLabel('Nama lengkap').fill('Siti Aminah');
  await page.getByLabel('Email').fill('siti@kampus.ac.id');
  await fillPasswords(page, 'rahasia123', 'rahasia124');
  await expect(page.getByText('Belum sama dengan kata sandi di atas.')).toBeVisible();
  expect(await page.getByLabel('Ulangi kata sandi').evaluate((input: HTMLInputElement) => input.validity.customError)).toBe(true);

  // Memperbaiki kolom PERTAMA juga dicek ulang.
  await page.getByLabel('Kata sandi', { exact: true }).fill('rahasia124');
  await expect(page.getByText('Sama dengan kata sandi di atas')).toBeVisible();
  expect(await page.getByLabel('Ulangi kata sandi').evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
});

test('daftar penyelenggara: form berbeda (data lembaga + penanggung jawab + wewenang)', async ({ page, baseURL }) => {
  await page.goto(nonDemo(baseURL, '/penyelenggara/daftar'));
  for (const label of ['Nama lembaga / organisasi', 'Jenis lembaga', 'Situs atau akun resmi (opsional)', 'Bukti peranmu', 'Nama lengkap', 'Jabatan di lembaga', 'Email kerja', 'Ulangi kata sandi']) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('checkbox', { name: /berwenang mewakili lembaga/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Daftarkan lembaga' })).toBeVisible();
});

test('daftar penyelenggara: galat server tidak menghapus isian panjang (sandi tidak pernah disimpan)', async ({ page, baseURL }) => {
  await page.goto(nonDemo(baseURL, '/penyelenggara/daftar'));
  const evidence = 'Saya ketua himpunan periode 2026, lihat https://himpunan.example/pengurus';
  await page.getByLabel('Nama lembaga / organisasi').fill('Himpunan Mahasiswa Uji');
  await page.getByLabel('Jenis lembaga').selectOption('ORMAWA');
  await page.getByLabel('Bukti peranmu').fill(evidence);
  await page.getByLabel('Nama lengkap').fill('Siti Aminah');
  await page.getByLabel('Jabatan di lembaga').fill('Ketua Himpunan');
  await page.getByLabel('Email kerja').fill('siti@himpunan.ac.id');
  await fillPasswords(page, 'rahasia123', 'rahasia123');
  for (const name of [/berwenang mewakili/, /berusia 18 tahun/, /menyetujui/]) await page.getByRole('checkbox', { name }).check();

  await page.getByRole('button', { name: 'Daftarkan lembaga' }).click();
  await expect(page).toHaveURL(/\/penyelenggara\/daftar\?error=unavailable/);
  await expect(page.getByRole('alert')).toBeVisible();

  await expect(page.getByLabel('Nama lembaga / organisasi')).toHaveValue('Himpunan Mahasiswa Uji');
  await expect(page.getByLabel('Jenis lembaga')).toHaveValue('ORMAWA');
  await expect(page.getByLabel('Bukti peranmu')).toHaveValue(evidence);
  await expect(page.getByLabel('Jabatan di lembaga')).toHaveValue('Ketua Himpunan');
  await expect(page.getByLabel('Email kerja')).toHaveValue('siti@himpunan.ac.id');
  await expect(page.getByLabel('Kata sandi', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => sessionStorage.getItem('sf_form:daftar-penyelenggara'))).not.toMatch(/rahasia123/);
});

test('email sudah terdaftar: pesan terang + jalan keluar ke pintu masuk yang benar', async ({ page }) => {
  await page.goto('/penyelenggara/daftar?error=email_taken&email=siti%40himpunan.ac.id');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Email ini sudah terdaftar');
  await expect(alert.getByRole('link', { name: 'Masuk' })).toHaveAttribute('href', '/penyelenggara/masuk?email=siti%40himpunan.ac.id');
  await expect(alert.getByRole('link', { name: 'Lupa kata sandi' })).toHaveAttribute('href', '/forgot-password?email=siti%40himpunan.ac.id');

  // `?email=` bisa diisi siapa saja: yang bukan email tidak diteruskan ke tautan.
  await page.goto('/register?error=email_taken&email=hubungi%20wa.me%2F123');
  await expect(page.getByRole('alert').getByRole('link', { name: 'Masuk' })).toHaveAttribute('href', '/login');
});
