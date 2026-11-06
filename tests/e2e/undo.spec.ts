import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Aksi yang bisa dibalik menawarkan "Urungkan" (ADR-067, lib/undo.ts):
 * berjalan seketika, lalu satu ketukan mengembalikan keadaan sebelumnya.
 */
const BEASISWA = 'Beasiswa Talenta Digital Gelombang 1';

test('ubah tahap → Urungkan mengembalikan tahap sebelumnya', async ({ page }) => {
  // Riwayat awal persona Mahasiswa: beasiswa ini "Ditolak" (seed DEMO_STARTER_PORTFOLIO).
  await signInAsDemo(page, 'Mahasiswa', '/tracker');
  const stage = page.getByLabel(`Tahap lamaran untuk ${BEASISWA}`);
  await expect(stage).toHaveValue('REJECTED');

  await stage.selectOption('INTERVIEW');
  await stage.locator('xpath=ancestor::form').getByRole('button', { name: 'Ubah' }).click();
  const undo = page.getByRole('status').filter({ hasText: 'Urungkan untuk kembali ke “Ditolak”' });
  await expect(undo).toBeVisible();
  await expect(page.getByLabel(`Tahap lamaran untuk ${BEASISWA}`)).toHaveValue('INTERVIEW');

  await undo.getByRole('button', { name: 'Urungkan' }).click();
  await expect(page).toHaveURL(/notice=undo_done/);
  await expect(page).not.toHaveURL(/urungkan=/);
  await expect(page.getByLabel(`Tahap lamaran untuk ${BEASISWA}`)).toHaveValue('REJECTED');
});

test('hapus dari Tersimpan → Urungkan menyimpannya lagi', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/events');
  const link = page.locator('main a[href^="/events/"]').first();
  await link.click();
  await expect(page).toHaveURL(/\/events\/[^/?]+$/);
  const title = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  const save = page.getByRole('button', { name: 'Simpan ke Tracker' });
  if (await save.isVisible()) await save.click();
  await expect(page.getByRole('button', { name: 'Tersimpan di Tracker' })).toBeVisible();

  await page.goto('/profile?tab=tersimpan');
  await page.getByRole('button', { name: `Hapus ${title} dari tersimpan` }).click();
  const undo = page.getByRole('status').filter({ hasText: 'dihapus dari Tersimpan' });
  await expect(undo).toBeVisible();
  await expect(page.getByRole('button', { name: `Hapus ${title} dari tersimpan` })).toHaveCount(0);

  await undo.getByRole('button', { name: 'Urungkan' }).click();
  await expect(page).toHaveURL(/notice=undo_done/);
  await expect(page.getByRole('button', { name: `Hapus ${title} dari tersimpan` })).toBeVisible();
});
