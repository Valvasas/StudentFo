import { expect, test, type Page } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Standar proyek: target sentuh ≥ 44px (CONVENTIONS.md). axe hanya memeriksa
 * ambang WCAG 2.5.8 (24px), jadi 44px diukur sendiri — termasuk area yang
 * diperluas ::after (tampilan tetap ringkas, area sentuh tetap 44px).
 */
async function smallTargets(page: Page, scope: string): Promise<string[]> {
  return page.locator(`${scope} :is(a[href], button, summary, input[type=checkbox], select)`).evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const box = node.getBoundingClientRect();
        // checkVisibility(): isi <details> yang tertutup tetap punya kotak layout
        // di Chromium (content-visibility: hidden), padahal tidak bisa disentuh.
        return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden' && node.checkVisibility();
      })
      .map((node) => {
        const box = node.getBoundingClientRect();
        const after = getComputedStyle(node, '::after');
        const extend = (value: string) => (after.position === 'absolute' ? Math.max(0, -parseFloat(value) || 0) : 0);
        const height = box.height + extend(after.top) + extend(after.bottom);
        const width = box.width + extend(after.left) + extend(after.right);
        return { label: (node.getAttribute('aria-label') ?? node.textContent ?? node.tagName).trim().slice(0, 40), height, width, tag: node.tagName };
      })
      // Kotak centang di dalam <label> memakai label sebagai targetnya.
      .filter((target) => !(target.tag === 'INPUT'))
      .filter((target) => target.height < 44 || target.width < 44)
      .map((target) => `${target.label} (${Math.round(target.width)}×${Math.round(target.height)})`),
  );
}

test('kartu persona demo: setiap target ≥ 44px', async ({ page }) => {
  await page.goto('/login');
  expect(await smallTargets(page, 'section[aria-labelledby="demo-login-title"]')).toEqual([]);
});

test('/admin sebagai admin demo (panel demo, kartu tinjauan, tautan riwayat): setiap target ≥ 44px', async ({ page }) => {
  await signInAsDemo(page, 'Admin moderator', '/admin');
  expect(await smallTargets(page, 'main')).toEqual([]);
});

test('halaman tim & detail tim: setiap target ≥ 44px', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/teams');
  expect(await smallTargets(page, 'main')).toEqual([]);
  const href = await page.locator('main a[href^="/teams/"]').first().getAttribute('href');
  await page.goto(href!);
  expect(await smallTargets(page, 'main')).toEqual([]);
});

test('halaman koneksi (opsi putus/blokir & konfirmasi blokir terbuka): setiap target ≥ 44px', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/connections');
  await page.locator('section[aria-labelledby="ajakan-masuk"] article summary').first().click();
  for (const scope of ['nav[aria-label="Bagian koneksi"]', 'section[aria-labelledby="ajakan-masuk"]', 'section[aria-labelledby="cari-koneksi"]']) {
    expect(await smallTargets(page, scope), scope).toEqual([]);
  }
  await page.goto('/connections?tab=koneksi');
  await page.locator('summary[aria-label="Opsi untuk Rani Prameswari"]').click();
  expect(await smallTargets(page, 'section[aria-labelledby="koneksimu"]')).toEqual([]);
  await page.goto('/connections?tab=pengaturan');
  expect(await smallTargets(page, 'section[aria-labelledby="diblokir-title"]')).toEqual([]);
});

test('halaman detail kegiatan: setiap target di <main> ≥ 44px', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/events');
  const href = await page.locator('main a[href^="/events/"]').first().getAttribute('href');
  await page.goto(href!);
  expect(await smallTargets(page, 'main')).toEqual([]);
});

test('lencana, kalender, buku panduan, dan /admin/promosi: setiap target ≥ 44px', async ({ page }) => {
  // Hanya baris penyelenggara (tombol lencana): chip filter /events (36px) dan
  // judul stretched-link adalah utang lama yang tercatat terpisah di TASKS.md.
  await page.goto('/events');
  expect(await smallTargets(page, 'main article p')).toEqual([]);
  await page.goto('/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026?tab=tahapan');
  await page.locator('main section summary').filter({ hasText: 'Tambah ke kalender' }).click();
  expect(await smallTargets(page, 'main')).toEqual([]);
  await page.goto('/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026?tab=syarat');
  expect(await smallTargets(page, 'main')).toEqual([]);
  await signInAsDemo(page, 'Admin moderator', '/admin/promosi');
  expect(await smallTargets(page, 'main')).toEqual([]);
});

test('kartu tracker (ubah tahap, hapus): setiap target ≥ 44px', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/events');
  const href = await page.locator('main a[href^="/events/"]').first().getAttribute('href');
  await page.goto(href!);
  await page.getByRole('button', { name: 'Simpan ke Tracker' }).click();
  await expect(page.getByRole('button', { name: 'Tersimpan di Tracker' })).toBeVisible();
  await page.goto('/tracker');
  // <select> ikut diukur di sini: pemilih tahap adalah kontrol utama kartu.
  const small = await page.locator('main select').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height).filter((height) => height < 44),
  );
  expect(small).toEqual([]);
  expect(await smallTargets(page, 'main')).toEqual([]);
});
