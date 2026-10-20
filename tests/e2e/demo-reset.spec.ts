import { expect, test } from '@playwright/test';

/**
 * Satu penanda demo (banner) yang jujur soal data fiktif dan siklus reset;
 * menjelang reset ia berubah jadi peringatan berjam absolut, supaya simpanan
 * yang hilang di tengah sesi tidak terasa seperti bug.
 */
test('banner demo: satu penanda yang menyebut data fiktif dan siklus reset di setiap halaman', async ({ page }) => {
  for (const route of ['/', '/events', '/login']) {
    await page.goto(route);
    const banner = page.getByRole('note').first();
    await expect(banner).toContainText('Mode demo');
    const reset = banner.getByTestId('demo-reset');
    // Menjelang reset (≤ 30 menit) nadanya peringatan dengan jam absolut WIB; selain itu interval tetap.
    await expect(reset).toContainText(/diatur ulang tiap 6 jam|diatur ulang dalam .+ \(pukul \d{2}\.\d{2} WIB\)/);
    if ((await reset.locator('time').count()) > 0) {
      const iso = await reset.locator('time').first().getAttribute('datetime');
      const minutesAhead = (new Date(iso!).getTime() - Date.now()) / 60_000;
      expect(minutesAhead).toBeGreaterThan(-1);
      expect(minutesAhead).toBeLessThanOrEqual(6 * 60);
    }
  }
});
