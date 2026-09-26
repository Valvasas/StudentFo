import { expect, test, type Page } from '@playwright/test';

/**
 * Batas per email (Postgres, ADR-023) bisa diakali dengan mengarang email
 * baru di setiap kiriman. Batas per IP harus menahan itu.
 */
test.describe.configure({ mode: 'serial' });

async function fillAndSubmit(page: Page, n: number): Promise<void> {
  await page.goto('/submit');
  await page.getByLabel('Judul kegiatan').fill(`Lomba Uji Batas Laju ${n} ${Date.now()}`);
  await page.getByLabel('Penyelenggara').fill(`Penyelenggara Uji ${n}`);
  await page.getByLabel('Jenis kegiatan').selectOption('LOMBA');
  await page.getByLabel('Tautan pendaftaran').fill('https://contoh.example/daftar');
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Tenggat pendaftaran').fill(future);
  await page.locator('input[name="educationLevels"]').first().check();
  await page.locator('input[name="categorySlugs"]').first().check();
  // Email berbeda setiap kali — persis cara penyerang melewati batas per email.
  await page.getByLabel('Email kamu').fill(`penguji${n}.${Date.now()}@contoh.example`);
  await page.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
  await page.waitForURL(/\/submit\?/);
}

test('kiriman ke-6 dari IP yang sama ditolak walau emailnya selalu baru', async ({ browser }, testInfo) => {
  // IP unik per proyek (dan per percobaan ulang) supaya proyek Playwright
  // yang berjalan paralel tidak berbagi ember.
  const projectIndex = testInfo.config.projects.findIndex((p) => p.name === testInfo.project.name);
  const ip = `198.51.100.${10 + projectIndex * 20 + testInfo.retry}`;
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ip } });
  const page = await context.newPage();

  for (let n = 1; n <= 5; n += 1) {
    await fillAndSubmit(page, n);
    await expect(page, `kiriman ke-${n} harus diterima`).toHaveURL(/notice=submission_received/);
  }
  await fillAndSubmit(page, 6);
  await expect(page).toHaveURL(/error=submission_rate_limited/);
  await expect(page.getByText(/Terlalu banyak kiriman/)).toBeVisible();

  // IP lain tidak ikut terkunci.
  const other = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.99' } });
  const otherPage = await other.newPage();
  await fillAndSubmit(otherPage, 7);
  await expect(otherPage).toHaveURL(/notice=submission_received/);
  await context.close();
  await other.close();
});
