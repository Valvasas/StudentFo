import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Penjaga isian belum disimpan (ADR-067): berpindah lewat tautan internal saat
 * form sudah diubah = dialog; mengembalikan isian ke semula = tanpa dialog;
 * "Tinggalkan" benar-benar berpindah; mengirim form tidak pernah ditahan.
 */
test('form yang diubah menahan tautan internal sampai dipastikan', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/details?ubah=identitas');
  const name = page.getByLabel('Nama lengkap');
  const original = await name.inputValue();
  const leave = page.getByRole('alertdialog', { name: 'Tinggalkan tanpa menyimpan?' });
  const away = page.getByRole('link', { name: 'Kembali ke Profil' });

  // Diketik lalu dikembalikan persis = tidak ada yang hilang, tidak ada dialog.
  await name.fill(`${original} X`);
  await name.fill(original);
  await away.click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.goto('/profile/details?ubah=identitas');
  await page.getByLabel('Nama lengkap').fill(`${original} Uji`);
  await away.click();
  await expect(leave).toBeVisible();
  await leave.getByRole('button', { name: 'Lanjut mengisi' }).click();
  await expect(leave).toBeHidden();
  await expect(page).toHaveURL(/ubah=identitas/);
  await expect(page.getByLabel('Nama lengkap')).toHaveValue(`${original} Uji`);

  await away.click();
  await leave.getByRole('button', { name: 'Tinggalkan', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { level: 1, name: original })).toBeVisible();
});

test('isian yang diketik SEBELUM skrip selesai dimuat tetap dijaga', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile');
  // Ponsel lambat: HTML sudah tampil dan bisa diketik, skrip halaman belum datang.
  let release!: () => void;
  const scriptsHeld = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/_next/static/chunks/**', async (route) => {
    await scriptsHeld;
    await route.continue();
  });
  await page.goto('/profile/details?ubah=identitas', { waitUntil: 'domcontentloaded' });
  const name = page.getByLabel('Nama lengkap');
  const original = await name.inputValue();
  await name.fill(`${original} Sebelum Skrip`);

  release();
  await page.waitForFunction(() => {
    const field = document.getElementById('fullName');
    return Boolean(field && Object.keys(field).some((key) => key.startsWith('__reactFiber')));
  });
  // Efek penjaga berjalan sesudah hidrasi di-commit — satu bingkai kemudian.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));

  await page.getByRole('link', { name: 'Kembali ke Profil' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Tinggalkan tanpa menyimpan?' })).toBeVisible();
  await expect(name).toHaveValue(`${original} Sebelum Skrip`);
});
