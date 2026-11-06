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
