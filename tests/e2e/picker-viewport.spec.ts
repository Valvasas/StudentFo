import { expect, test, type Page } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Pemilih melayang (lokasi, kab/kota, prodi) harus utuh di layar ponsel —
 * dulu popover 340px ditambatkan ke tepi tombol dan meluber keluar layar
 * ketika tombolnya di tengah/kanan. Diuji di 320px (ponsel terkecil yang
 * didukung) dan 390px.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'ponsel', 'masalahnya khusus layar sempit');
});

async function expectDialogInsideViewport(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const width = page.viewportSize()!.width;
  expect(box, `popover ${name} tidak terukur`).not.toBeNull();
  expect(box!.x, `${name} keluar di kiri`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name} keluar di kanan (${box!.x + box!.width} > ${width})`).toBeLessThanOrEqual(width);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'halaman ikut melebar').toBeLessThanOrEqual(0);
}

for (const width of [320, 390]) {
  test(`filter lokasi magang utuh di ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/events?type=MAGANG');
    await page.getByRole('button', { name: /Semua lokasi/ }).click();
    await expectDialogInsideViewport(page, 'Lokasi magang');
  });

  test(`domisili & prodi di Data diri utuh di ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await signInAsDemo(page, 'Mahasiswa', '/profile/details?ubah=asal');
    await page.getByRole('button', { name: 'Domisili' }).click();
    await expectDialogInsideViewport(page, 'Kabupaten / kota');
    await page.keyboard.press('Escape');

    await page.goto('/profile/details?ubah=pendidikan');
    await page.getByRole('button', { name: /Program studi/ }).click();
    await expectDialogInsideViewport(page, 'Program studi');
  });
}
