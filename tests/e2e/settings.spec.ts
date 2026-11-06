import { expect, test } from '@playwright/test';
import { confirmDialog, signInAsDemo } from './helpers';

/**
 * Pengaturan per konteks (ADR-067): hub → halaman anak → tombol kembali
 * hierarkis, saklar pengingat yang dihormati server (mematikan dikonfirmasi,
 * menyalakan tidak), dan keluar dari semua perangkat di balik konfirmasi.
 */
test('hub Pengaturan: buka halaman anak lalu kembali tanpa tombol kembali perangkat', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Pengaturan' })).toBeVisible();
  for (const [row, heading] of [
    ['Akun & keamanan', 'Akun & keamanan'],
    ['Notifikasi', 'Notifikasi'],
    ['Privasi & data', 'Privasi & data'],
    ['Tampilan & rekomendasi', 'Tampilan & rekomendasi'],
  ] as const) {
    await page.getByRole('link', { name: new RegExp(`^${row.replace('&', '\\&')}`) }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await page.getByRole('link', { name: 'Kembali ke Pengaturan' }).click();
    await expect(page).toHaveURL(/\/profile\/settings$/);
  }
});

test('saklar pengingat tenggat: mematikan dikonfirmasi & tercermin di hub, menyalakan langsung', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/settings/notifikasi');
  const toggle = page.getByRole('switch', { name: /Ingatkan aku sebelum tenggat/ });
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Matikan pengingat tenggat?' })).toBeVisible();
  await confirmDialog(page, 'Ya, matikan');
  await expect(page).toHaveURL(/notice=reminders_off/);
  await expect(page.getByRole('switch', { name: /Ingatkan aku sebelum tenggat/ })).not.toBeChecked();

  await page.goto('/profile/settings');
  await expect(page.getByText('Pengingat mati', { exact: true })).toBeVisible();

  await page.goto('/profile/settings/notifikasi');
  await page.getByRole('switch', { name: /Ingatkan aku sebelum tenggat/ }).check();
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page).toHaveURL(/notice=reminders_on/);
});

test('keluar dari semua perangkat: Batal tidak mengubah apa pun, Ya mengeluarkan', async ({ page }) => {
  await signInAsDemo(page, 'Siswa baru', '/profile/settings/keamanan');
  await page.getByRole('button', { name: 'Keluar dari semua' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Keluar dari semua perangkat?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Batal' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/profile\/settings\/keamanan$/);

  await page.getByRole('button', { name: 'Keluar dari semua' }).click();
  await confirmDialog(page, 'Ya, keluarkan semua');
  await expect(page).toHaveURL(/\/login\?notice=signed_out_everywhere/);
  await expect(page.locator('summary[aria-label^="Menu akun"]')).toHaveCount(0);
});
