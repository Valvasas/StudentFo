import { expect, test } from '@playwright/test';

/**
 * Tur beranda (ADR-065). Konfigurasi uji memakai `reducedMotion: 'reduce'`,
 * jadi yang dikunci di sini justru jalur aksesibelnya: tur TIDAK berjalan
 * sendiri, tombolnya maju satu langkah, dan pola tab bisa dipakai dengan
 * keyboard. Hanya fitur yang ada di produksi yang boleh dijanjikan.
 */
test('tur beranda: pola tab + keyboard, tidak berjalan sendiri saat gerak dikurangi', async ({ page }) => {
  await page.goto('/');
  const tour = page.locator('#cara-kerja');
  await tour.scrollIntoViewIfNeeded();
  const tabs = tour.getByRole('tab');
  await expect(tabs).toHaveCount(5);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(tour.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tur-tab-0');

  // Gerak dikurangi → tidak ada autoplay; tombolnya "Putar tur" dan memajukan satu langkah.
  await page.waitForTimeout(6500);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await tour.getByRole('button', { name: 'Putar tur' }).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

  await tabs.nth(1).focus();
  await page.keyboard.press('ArrowDown');
  await expect(tabs.nth(2)).toBeFocused();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
  await expect(tour.getByText(/Langkah 5 dari 5: Temukan tim/)).toBeAttached();

  // Fitur khusus mode demo tidak dijanjikan di tur.
  await expect(tour).not.toContainText(/Ruang diskusi|Pesan/);
});
