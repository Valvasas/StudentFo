import { expect, test } from '@playwright/test';

/**
 * /events dirancang berfungsi TANPA JavaScript (AGENTS.md #9). Suspense
 * manual pernah membuat seluruh filter + hasil terkirim di dalam
 * `<div hidden>` yang hanya ditampilkan JS — tanpa JS, halaman cuma berisi
 * "Memuat daftar kegiatan". Diuji dengan dan tanpa JavaScript.
 */
test('filter /events lewat form & chip: URL kanonik, hasil tersaring, berfungsi TANPA JavaScript juga', async ({ browser }) => {
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled });
    const page = await context.newPage();
    await page.goto('/events');
    const filters = page.getByRole('region', { name: 'Filter kegiatan' });
    await filters.getByRole('link', { name: 'Beasiswa', exact: true }).click();
    await expect(page).toHaveURL(/type=BEASISWA/);
    await expect(filters.getByRole('link', { name: 'Beasiswa', exact: true })).toHaveAttribute('aria-current', 'true');

    await page.getByLabel('Kata kunci pencarian').fill('zzz-tidak-ada-kegiatan-seperti-ini');
    await page.getByRole('button', { name: 'Cari' }).click();
    await expect(page).toHaveURL(/q=zzz-tidak-ada/);
    await expect(page).toHaveURL(/type=BEASISWA/); // filter lain ikut terbawa
    await expect(page.getByRole('heading', { name: 'Belum ada yang cocok' })).toBeVisible();
    await context.close();
  }
});

test('HTML awal /events (tanpa eksekusi JS) sudah berisi filter & hasil, bukan fallback', async ({ request }) => {
  const html = await (await request.get('/events?q=lomba')).text();
  const beforeFirstHiddenSegment = html.split('<div hidden id="S:')[0]!;
  expect(beforeFirstHiddenSegment).toContain('aria-label="Filter kegiatan"');
  expect(html).not.toContain('Memuat daftar kegiatan');
});
