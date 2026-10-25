import { expect, test, type Page } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Standar proyek: target sentuh ≥ 44px (CONVENTIONS.md). axe hanya memeriksa
 * ambang WCAG 2.5.8 (24px), jadi 44px diukur sendiri — termasuk area yang
 * diperluas ::after (tampilan tetap ringkas, area sentuh tetap 44px).
 * Diukur lewat `expect.poll`: panel yang baru dibuka (rincian, lembar, grid)
 * bisa butuh satu-dua frame transisi — bahkan dengan reduced-motion — sebelum
 * ukuran finalnya; pelanggaran permanen tetap gagal.
 */
async function smallTargets(page: Page, scope: string): Promise<string[]> {
  return page.locator(`${scope} :is(a[href], button, summary, input[type=checkbox], select)`).evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const box = node.getBoundingClientRect();
        // checkVisibility(): isi <details> yang tertutup tetap punya kotak layout
        // di Chromium (content-visibility: hidden), padahal tidak bisa disentuh.
        // [inert] (kartu belakang tumpukan) tidak bisa disentuh sama sekali, jadi bukan target.
        return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden' && node.checkVisibility() && !node.closest('[inert]');
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
  await page.goto('/demo');
  await expect.poll(() => smallTargets(page, 'section[aria-labelledby="demo-login-title"]'), { timeout: 3000 }).toEqual([]);
});

test('/admin sebagai admin demo (panel demo, kartu tinjauan, tautan riwayat): setiap target ≥ 44px', async ({ page }) => {
  await signInAsDemo(page, 'Admin moderator', '/admin');
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
});

test('halaman tim & detail tim: setiap target ≥ 44px', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/teams');
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
  const href = await page.locator('main a[href^="/teams/"]:not([href^="/teams/baru"])').first().getAttribute('href');
  await page.goto(href!);
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
  await page.goto('/teams/baru');
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
});

test('halaman koneksi (opsi putus/blokir & konfirmasi blokir terbuka): setiap target ≥ 44px', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/connections');
  await page.locator('section[aria-labelledby="ajakan-masuk"] article summary').first().click();
  for (const scope of ['nav[aria-label="Bagian koneksi"]', 'section[aria-labelledby="ajakan-masuk"]', 'section[aria-labelledby="cari-koneksi"]']) {
    expect(await smallTargets(page, scope), scope).toEqual([]);
  }
  await page.goto('/connections?tab=koneksi');
  await page.locator('summary[aria-label="Opsi untuk Rani Prameswari"]').click();
  await expect.poll(() => smallTargets(page, 'section[aria-labelledby="koneksimu"]'), { timeout: 3000 }).toEqual([]);
  await page.goto('/connections?tab=pengaturan');
  await expect.poll(() => smallTargets(page, 'section[aria-labelledby="diblokir-title"]'), { timeout: 3000 }).toEqual([]);
});

test('halaman detail kegiatan: setiap target di <main> ≥ 44px', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/events');
  const href = await page.locator('main a[href^="/events/"]').first().getAttribute('href');
  await page.goto(href!);
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
});

test('lencana, kalender, buku panduan, dan /admin/promosi: setiap target ≥ 44px', async ({ page }) => {
  // Hanya baris penyelenggara (tombol lencana): chip filter /events (36px) dan
  // judul stretched-link adalah utang lama yang tercatat terpisah di TASKS.md.
  await page.goto('/events');
  await expect.poll(() => smallTargets(page, 'main article p'), { timeout: 3000 }).toEqual([]);
  await page.goto('/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026?tab=tahapan');
  await page.locator('main section summary').filter({ hasText: 'Tambah ke kalender' }).click();
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
  await page.goto('/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026?tab=syarat');
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
  await signInAsDemo(page, 'Admin moderator', '/admin/promosi');
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
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
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
});

test('pencocokan tim (form, hasil, saringan terbuka): setiap target ≥ 44px', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/teams/cocok');
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
  await page.locator('input[name=skills][value=web-aplikasi]').check();
  await page.getByLabel('Kota', { exact: true }).selectOption('Bandung');
  await page.getByRole('button', { name: /Simpan & mulai mencari/ }).click();
  await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeVisible();
  // Buka saringan DAN punggung kartu depan: isi <details>/muka yang tertutup tidak terukur.
  await page.getByText('Saring & atur gaya tim').click();
  await page.getByRole('button', { name: /^Balik kartu/ }).first().click();
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
  // Mode "Semua kartu": setiap kartu membawa Lewati/Balik/Ajak; lalu lembar tinjau ajakan terbuka.
  await page.getByRole('button', { name: 'Semua kartu' }).click();
  await expect(page.locator('.deck[data-mode="grid"]')).toBeVisible();
  await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000 }).toEqual([]);
  await page.getByRole('button', { name: 'Ajak jadi partner' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => smallTargets(page, 'dialog'), { timeout: 3000 }).toEqual([]);
});

/**
 * Tablet sentuh (iPad): lebar ≥ sm/lg TIDAK berarti ada mouse. Kontrol yang
 * diringkas ke 30–36px untuk desktop memakai `pointer-fine:`, bukan breakpoint
 * lebar saja — tanpa itu iPad mendapat versi mouse dengan jari. Ukuran
 * diatur sendiri, jadi cukup satu proyek.
 */
test.describe('tablet sentuh', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'terang', 'viewport diatur sendiri; cukup satu proyek');
  });

  for (const viewport of [{ width: 820, height: 1180 }, { width: 1024, height: 768 }]) {
    test.describe(`${viewport.width}px`, () => {
      test.use({ viewport, hasTouch: true });

      test('papan jenis, Kebijakan privasi: setiap target ≥ 44px', async ({ page }) => {
        // Hanya kontrol yang diringkas; tautan di dalam kalimat dikecualikan WCAG 2.5.8.
        for (const [route, scope] of [
          ['/events?type=BEASISWA', 'main nav[aria-label="Jenjang untuk cek kelayakan"]'],
          ['/events?type=MAGANG', 'main section[aria-label="Filter kegiatan"]'],
          ['/privacy-policy', 'main nav'],
        ] as const) {
          await page.goto(route);
          await expect.poll(() => smallTargets(page, scope), { timeout: 3000, message: route }).toEqual([]);
        }
      });

      test('profil, data diri, pengaturan, personalisasi, privasi, peta koneksi: setiap target ≥ 44px', async ({ page }) => {
        await signInAsDemo(page, 'Mahasiswa', '/profile/details');
        for (const route of ['/profile/details', '/profile/settings', '/profile/personalization', '/profile/privacy', '/connections?tab=peta']) {
          await page.goto(route);
          await expect.poll(() => smallTargets(page, 'main'), { timeout: 3000, message: route }).toEqual([]);
        }
      });
    });
  }
});
