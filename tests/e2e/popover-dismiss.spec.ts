import { expect, test, type Page } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Menu `<details data-popover>` (lonceng, menu akun, Urutkan): utuh di layar
 * ponsel dan tertutup seperti yang diharapkan orang — ketuk di luar, Escape,
 * membuka menu lain, memilih item. Tanpa JavaScript tetap buka-tutup lewat
 * ringkasannya. Panel Saring (disclosure biasa) sengaja TIDAK ikut tertutup.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'perilaku & viewport diatur sendiri; cukup satu proyek');
});

const BELL = 'summary[aria-label^="Notifikasi"]';
const ACCOUNT = 'summary[aria-label^="Menu akun"]';

const isOpen = (page: Page, summary: string) =>
  page.evaluate((selector) => document.querySelector(selector)?.closest('details')?.open ?? null, summary);

/** Titik di header yang bukan elemen interaktif & di luar menu mana pun — tempat aman "mengetuk di luar". */
async function blankPoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const header = document.querySelector('header')!.getBoundingClientRect();
    for (let y = header.top + 6; y < header.bottom - 4; y += 6) {
      for (let x = header.left + 6; x < header.right - 6; x += 12) {
        const hit = document.elementFromPoint(x, y);
        if (hit && !hit.closest('a, button, summary, details, input, select, textarea, [role="button"]')) return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error('tidak ada titik kosong di header');
  return point;
}

async function panelBox(page: Page, summary: string) {
  return page.evaluate((selector) => {
    const panel = document.querySelector(selector)?.closest('details')?.querySelector(':scope > :not(summary)');
    const box = panel!.getBoundingClientRect();
    return { left: box.left, right: box.right, bottom: box.bottom, width: document.documentElement.clientWidth, height: window.innerHeight };
  }, summary);
}

for (const width of [320, 375]) {
  test(`${width}px: panel notifikasi & menu akun utuh di dalam layar, "Keluar" terjangkau`, async ({ browser }) => {
    // 568 = tinggi iPhone SE; spanduk demo di atas header ikut memakan ruang.
    const context = await browser.newContext({ viewport: { width, height: 568 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await signInAsDemo(page, 'Mahasiswa', '/');

    for (const summary of [BELL, ACCOUNT]) {
      await page.locator(summary).first().click();
      await expect.poll(() => isOpen(page, summary)).toBe(true);
      // Tinggi panel dihitung saat event `toggle` (asinkron) — tunggu sampai stabil.
      await expect.poll(async () => (await panelBox(page, summary)).bottom, { message: `${summary} bawah` }).toBeLessThanOrEqual(568);
      const box = await panelBox(page, summary);
      expect(box.left, summary).toBeGreaterThanOrEqual(0);
      expect(box.right, summary).toBeLessThanOrEqual(box.width);
      if (summary === ACCOUNT) {
        // Dulu ujung panel sendiri di luar layar: menggulir isinya pun tidak membawa "Keluar" masuk layar.
        const signOut = page.getByRole('button', { name: 'Keluar', exact: true });
        await signOut.scrollIntoViewIfNeeded();
        await expect(signOut).toBeInViewport();
      }
      // Ketuk di luar panel menutupnya (dulu tetap terbuka).
      const point = await blankPoint(page);
      await page.touchscreen.tap(point.x, point.y);
      await expect.poll(() => isOpen(page, summary)).toBe(false);
    }
    await context.close();
  });
}

test('Escape menutup & mengembalikan fokus; membuka menu lain menutup yang pertama', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/');
  const bell = page.locator(BELL).first();
  await bell.click();
  await expect.poll(() => isOpen(page, BELL)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => isOpen(page, BELL)).toBe(false);
  await expect(bell).toBeFocused();

  await bell.click();
  await page.locator(ACCOUNT).first().click();
  await expect.poll(() => isOpen(page, ACCOUNT)).toBe(true);
  await expect.poll(() => isOpen(page, BELL)).toBe(false);
});

test('memilih item menu menutupnya — juga bila tujuannya halaman yang sama (Urutkan)', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/');
  await page.locator(ACCOUNT).first().click();
  await page.getByRole('link', { name: 'Lencana' }).click();
  await expect(page).toHaveURL(/tab=lencana/);
  await expect.poll(() => isOpen(page, ACCOUNT)).toBe(false);

  await page.goto('/events');
  const sortMenu = page.locator('details[data-popover]').filter({ has: page.locator('summary', { hasText: 'Urutkan' }) });
  await sortMenu.locator('summary').click();
  await expect(sortMenu).toHaveAttribute('open', '');
  await page.getByRole('link', { name: 'Tenggat terdekat' }).click();
  await expect(page).toHaveURL(/sort=deadline/);
  // Pathname sama (/events) — tanpa penutupan saat memilih item, menu tetap terbuka.
  await expect(sortMenu).not.toHaveAttribute('open', '');
});

test('dialog konfirmasi "Keluar" di dalam menu akun: Batal & Escape tidak ikut menutup menu', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/');
  await page.locator(ACCOUNT).first().click();
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Batal' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => isOpen(page, ACCOUNT)).toBe(true);

  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => isOpen(page, ACCOUNT)).toBe(true);
});

test('ponsel 360px: tab aktif di ujung baris (Seminar) tergeser masuk layar', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/events?type=KONFERENSI');
  const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
  await expect(nav.getByRole('link', { name: 'Seminar' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Seminar' })).toBeInViewport({ ratio: 1 });
  await context.close();
});

test('panel Saring bukan popover: tetap terbuka saat mengetuk di luar', async ({ page }) => {
  await page.goto('/events');
  const filters = page.locator('details:not([data-popover])').filter({ has: page.locator('summary', { hasText: 'Saring' }) }).first();
  await filters.locator('summary').click();
  await expect(filters).toHaveAttribute('open', '');
  await page.locator('footer').click({ position: { x: 4, y: 4 } });
  await expect(filters).toHaveAttribute('open', '');
});

test('tanpa JavaScript: menu tetap bisa dibuka dari ringkasannya', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/events');
  await page.locator('summary', { hasText: 'Urutkan' }).click();
  await expect(page.getByRole('link', { name: 'Tenggat terdekat' })).toBeVisible();
  await context.close();
});
