import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Animasi hasil aksi (ADR-055). Yang dijaga: (1) "Daftar" ke formulir resmi
 * menawarkan pencatatan satu ketukan, (2) hasilnya dirayakan, (3) perayaan
 * TIDAK diputar ulang saat halaman dimuat ulang — konfeti di setiap refresh
 * mengubah kabar baik jadi gangguan.
 */
test('daftar ke formulir resmi → tandai terdaftar → dirayakan sekali, tidak diulang saat dimuat ulang', async ({ page, context }) => {
  // Formulir resmi ada di situs luar; uji ini tidak butuh isinya.
  await context.route(/^(?!http:\/\/localhost)/, (route) => route.abort());
  await signInAsDemo(page, 'Mahasiswa', '/events?type=LOMBA');
  const href = await page.locator('main a[href^="/events/"]').first().getAttribute('href');
  await page.goto(href!);

  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: /Daftar sekarang/ }).click();
  await (await popup).close();

  const card = page.getByRole('region', { name: 'Formulir resmi dibuka di tab baru' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Sudah, tandai terdaftar' }).click();

  await expect(page).toHaveURL(/notice=tracker_applied/);
  await expect(page.getByText('TERCATAT', { exact: true })).toBeVisible();
  await expect(page.getByText('Di pendaftaranmu: Sudah Daftar')).toBeVisible();
  await expect(card).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(/Dicatat sebagai "Sudah Daftar"/)).toBeVisible();
  await expect(page.getByText('TERCATAT', { exact: true })).toHaveCount(0);
});
