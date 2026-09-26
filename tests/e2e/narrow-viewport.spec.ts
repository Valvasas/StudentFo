import { expect, test, type Page } from '@playwright/test';
import { signInAsDemo, type PersonaLabel } from './helpers';

/**
 * Layar paling sempit yang masih umum: 320px (iPhone SE generasi 1, banyak
 * Android murah dengan zoom tampilan besar) dan 375px (iPhone SE 2/3).
 * Pixel 7 di proyek "ponsel" (412px) terlalu lebar untuk menangkap kartu
 * persona demo, baris tombol admin, dan kartu tracker yang melebar.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'viewport diatur sendiri; cukup satu proyek');
});

const WIDTHS = [320, 375];

async function overflowOf(page: Page): Promise<{ page: number; offenders: string[] }> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.right > width + 1 && getComputedStyle(node).position !== 'fixed';
      })
      .filter((node) => !node.closest('[aria-hidden="true"]') && !node.closest('.skip-link'))
      .map((node) => `${node.tagName.toLowerCase()}.${String(node.getAttribute('class') ?? '').split(' ').slice(0, 3).join('.')} → ${Math.round(node.getBoundingClientRect().right - width)}px`)
      .slice(0, 5);
    return { page: document.documentElement.scrollWidth - width, offenders };
  });
}

const GUEST_ROUTES = ['/', '/events', '/login', '/register', '/submit', '/teams'];
const SIGNED_IN: readonly (readonly [PersonaLabel, string])[] = [
  ['Admin moderator', '/admin'],
  ['Admin moderator', '/admin/riwayat'],
  ['Admin moderator', '/admin/kalibrasi'],
  ['Mahasiswa', '/tracker'],
  ['Mahasiswa', '/profile'],
];

for (const width of WIDTHS) {
  test.describe(`lebar ${width}px`, () => {
    test.use({ viewport: { width, height: 700 }, hasTouch: true, isMobile: true });

    for (const route of GUEST_ROUTES) {
      test(`tanpa geser horizontal: ${route}`, async ({ page }) => {
        await page.goto(route);
        const result = await overflowOf(page);
        expect(result, JSON.stringify(result.offenders)).toMatchObject({ page: 0 });
      });
    }

    for (const [persona, route] of SIGNED_IN) {
      test(`tanpa geser horizontal (${persona}): ${route}`, async ({ page }) => {
        if (persona === 'Mahasiswa' && route === '/tracker') {
          // Tracker kosong tidak menguji kartu; isi dulu satu simpanan.
          await signInAsDemo(page, persona, '/events');
          const href = await page.locator('main a[href^="/events/"]').first().getAttribute('href');
          await page.goto(href!);
          await page.getByRole('button', { name: 'Simpan ke Tracker' }).click();
          await expect(page.getByRole('button', { name: 'Tersimpan di Tracker' })).toBeVisible();
          await page.goto(route);
        } else {
          await signInAsDemo(page, persona, route);
        }
        const result = await overflowOf(page);
        expect(result, JSON.stringify(result.offenders)).toMatchObject({ page: 0 });
      });
    }
  });
}

test('safe-area: tanpa viewport-fit=cover, konten tidak pernah masuk area notch', async ({ page }) => {
  await page.goto('/');
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  // Kalau suatu hari viewport-fit=cover ditambahkan (mis. untuk PWA), header
  // sticky & elemen fixed WAJIB diberi padding env(safe-area-inset-*) di
  // commit yang sama — test ini sengaja gagal untuk mengingatkannya.
  expect(viewport).not.toContain('viewport-fit=cover');
});
