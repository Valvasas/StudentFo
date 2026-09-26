import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInAsDemo, type PersonaLabel } from '../e2e/helpers';

/**
 * Setiap halaman publik diaudit axe-core dengan aturan WCAG 2.2 A/AA, di
 * tiga proyek (terang, gelap, ponsel — lihat playwright.config.ts).
 * `check-contrast.mjs` sudah memeriksa pasangan token warna; di sini yang
 * diuji adalah hasil render sungguhan: label form, landmark, nama tombol,
 * kontras di atas latar yang benar-benar dipakai, dan ukuran target sentuh.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const STATIC_ROUTES = [
  '/',
  '/events',
  '/events?type=LOMBA&sort=deadline',
  '/teams',
  '/submit',
  '/submit?error=invalid_submission&fields=title,email',
  '/login',
  '/register',
  '/forgot-password',
  '/tracker',
  '/profile',
  '/halaman-yang-tidak-ada',
];

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
        .map((n) => `${n.target.join(' ')} — ${n.any[0]?.message ?? n.failureSummary ?? ''}`)
        .join('\n  ')}`,
  );
  expect(summary, summary.join('\n\n')).toEqual([]);
}

for (const route of STATIC_ROUTES) {
  test(`tanpa pelanggaran WCAG: ${route}`, async ({ page }) => {
    await page.goto(route);
    await expectNoViolations(page);
  });
}

// Id tim dibuat ulang tiap proses (UUID) dan slug bisa berubah bersama data
// contoh, jadi halaman detail dicapai lewat tautan pertama di daftarnya.
for (const [listing, linkPrefix] of [
  ['/events', '/events/'],
  ['/teams', '/teams/'],
] as const) {
  test(`tanpa pelanggaran WCAG: detail pertama dari ${listing}`, async ({ page }) => {
    await page.goto(listing);
    const href = await page.locator(`main a[href^="${linkPrefix}"]`).first().getAttribute('href');
    expect(href).toBeTruthy();
    await page.goto(href!);
    await expectNoViolations(page);
  });
}

test('tautan lompat-ke-konten adalah fokus pertama dan membawa ke <main>', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Lompat ke konten utama' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page).toHaveURL(/#konten$/);
});

test('halaman tidak menggulir ke samping', async ({ page }) => {
  for (const route of ['/', '/events', '/submit', '/teams']) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} melebar ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

// Halaman di balik login demo — tidak pernah teraudit karena audit di atas
// hanya melihat tampilan tamu (mis. /admin hanya "Akses terbatas").
const SIGNED_IN_ROUTES: readonly (readonly [PersonaLabel, string])[] = [
  ['Admin moderator', '/admin'],
  ['Admin moderator', '/admin/riwayat'],
  ['Admin moderator', '/admin/kalibrasi'],
  ['Mahasiswa', '/'],
  ['Mahasiswa', '/tracker'],
  ['Mahasiswa', '/profile'],
  ['Mahasiswa', '/teams'],
  ['Siswa baru', '/profile'],
];

for (const [persona, route] of SIGNED_IN_ROUTES) {
  test(`tanpa pelanggaran WCAG (${persona}): ${route}`, async ({ page }) => {
    await signInAsDemo(page, persona, route);
    await expectNoViolations(page);
  });
}

test('menu akun & lonceng notifikasi terbuka tanpa pelanggaran WCAG', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa');
  await page.locator('summary[aria-label^="Menu akun"]').click();
  await expectNoViolations(page);
});
