import { expect, test, type Browser } from '@playwright/test';
import { signInAsDemo } from './helpers';

const HUMAN_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

async function personalSignalCount(browser: Browser): Promise<number> {
  const admin = await browser.newContext();
  const page = await admin.newPage();
  await signInAsDemo(page, 'Admin moderator', '/admin/kalibrasi');
  const text = await page.getByRole('region', { name: 'Profil lengkap (personal)', exact: true }).textContent();
  await admin.close();
  return Number(/([\d.]+) sinyal/.exec(text ?? '')?.[1]?.replace(/\./g, '') ?? NaN);
}

/**
 * Rantai penuh ADR-032 di mode demo: simpan oleh pengguna berprofil lengkap
 * → sinyal tercatat dengan profilnya → muncul di laporan kalibrasi admin.
 * Satu proyek saja: data demo dibagi proyek yang berjalan paralel.
 */
test('simpan dari browser sungguhan tercatat; dari agen bot/pratinjau tautan tidak', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  const before = await personalSignalCount(browser);

  for (const [userAgent, expectedTotal] of [
    [HUMAN_UA, before + 1],
    // Pratinjau tautan WhatsApp mengikuti tautan yang dibagikan di grup — bukan niat pengguna.
    ['WhatsApp/2.23.20.0 A', before + 1],
  ] as const) {
    const context = await browser.newContext({ userAgent });
    const page = await context.newPage();
    await signInAsDemo(page, 'Mahasiswa');
    await page.goto('/events');
    const href = await page.locator('main a[href^="/events/"]').first().getAttribute('href');
    await page.goto(href!);
    await page.getByRole('button', { name: 'Simpan ke Tracker' }).click();
    await expect(page.getByRole('button', { name: 'Tersimpan di Tracker' })).toBeVisible();
    await context.close();

    expect(await personalSignalCount(browser)).toBe(expectedTotal);
  }
});
