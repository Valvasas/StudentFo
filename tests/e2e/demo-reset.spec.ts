import { expect, test } from '@playwright/test';

/**
 * Pengunjung demo harus tahu KAPAN datanya diatur ulang — bukan hanya "setiap
 * 6 jam" — supaya simpanan yang hilang di tengah sesi tidak terasa seperti bug.
 */
test('banner demo menampilkan jam reset berikutnya (absolut, WIB) di setiap halaman', async ({ page }) => {
  for (const route of ['/', '/events', '/login']) {
    await page.goto(route);
    const reset = page.getByRole('note').getByTestId('demo-reset');
    await expect(reset).toContainText(/pukul \d{2}\.\d{2} WIB/);
    const iso = await reset.locator('time').getAttribute('datetime');
    const minutesAhead = (new Date(iso!).getTime() - Date.now()) / 60_000;
    // Paling lambat 6 jam dari sekarang, dan tidak di masa lalu.
    expect(minutesAhead).toBeGreaterThan(-1);
    expect(minutesAhead).toBeLessThanOrEqual(6 * 60);
  }
});
