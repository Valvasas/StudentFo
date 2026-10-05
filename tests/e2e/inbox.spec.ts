import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Kotak masuk demo (ADR-054): posisi di Ruang diskusi hidup di URL lewat
 * history.pushState, jadi tombol kembali peramban berperilaku seperti
 * halaman — dan layar HARUS ikut URL. Regresi yang pernah terjadi: setelah
 * "Kirim utas" URL sudah `?utas=…` tetapi layar masih menampilkan form
 * kosong, karena replaceState membawa state internal Next (`__NA`).
 */

test('diskusi: utas, kembali, menulis, dan kanal semuanya berbentuk URL', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/discussions');
  const compose = page.getByRole('button', { name: /Mulai diskusi/ });
  await expect(compose).toBeEnabled();

  await page.getByRole('button', { name: 'Apakah satu tim boleh lintas kampus?', exact: true }).click();
  await expect(page).toHaveURL(/utas=kipln-2/);
  await expect(page.getByRole('heading', { name: 'Apakah satu tim boleh lintas kampus?' })).toBeFocused();
  await page.goBack();
  await expect(compose).toBeVisible();

  await compose.click();
  await expect(page).toHaveURL(/tulis=1/);
  await expect(page.getByLabel('Judul')).toBeFocused();
  await page.getByLabel('Judul').fill('Oke');
  await page.getByRole('button', { name: 'Kirim utas' }).click();
  await expect(page.locator('#utas-error')).toHaveText('Judul minimal 5 karakter.');
  await page.getByLabel('Judul').fill('Boleh pakai template sendiri untuk proposal?');
  await expect(page.locator('#utas-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Kirim utas' }).click();
  await expect(page).toHaveURL(/utas=u-/);
  await expect(page.getByRole('heading', { name: 'Boleh pakai template sendiri untuk proposal?' })).toBeVisible();
  // Utas baru MENGGANTI entri "menulis": kembali = daftar, bukan form kosong.
  await page.getByRole('button', { name: 'Semua utas' }).click();
  await expect(compose).toBeVisible();
  await expect(page.getByLabel('Judul')).toHaveCount(0);

  await page.getByRole('button', { name: /^Tanya panitia/ }).click();
  await expect(page).toHaveURL(/kanal=tanya/);
  await expect(page.getByRole('button', { name: /^Tanya panitia/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Template proposal dan panduan penilaian sudah tersedia', exact: true })).toHaveCount(0);
});

test('diskusi: tautan langsung ke utas, lalu "Semua utas" tetap di grup itu', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/discussions?grup=g-beasiswa&utas=bea-1');
  await expect(page.getByRole('heading', { name: 'Sertifikat lomba tingkat kampus bisa dipakai?' })).toBeVisible();
  await page.getByRole('button', { name: 'Semua utas' }).click();
  await expect(page).toHaveURL(/\/discussions\?grup=g-beasiswa$/);
  await expect(page.getByRole('button', { name: /Mulai diskusi/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Beasiswa Unggulan Bakti Pendidikan 2026' })).toBeVisible();
});

test('pesan: info percakapan adalah dialog — fokus masuk, Esc menutup, fokus kembali', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/messages');
  // Di ponsel daftar percakapan tampil lebih dulu; tombol info ada di layar obrolan.
  await page.getByRole('button', { name: /^Tim hackathon/ }).click();
  const trigger = page.getByRole('button', { name: 'Info percakapan' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Info percakapan' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Tutup info' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
