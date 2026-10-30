import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Dokumen hukum & hak atas data (ADR-060). Tanpa env pemilik (identitas,
 * kontak, tanggal berlaku) semua dokumen WAJIB berlabel draf — kode tidak
 * pernah menyatakan dokumen hukum berlaku atas nama pemilik.
 */
const DOCUMENTS = [
  { path: '/privacy-policy', title: 'Kebijakan privasi' },
  { path: '/cookie-policy', title: 'Kebijakan cookie' },
  { path: '/terms', title: 'Syarat & Ketentuan' },
] as const;

for (const doc of DOCUMENTS) {
  test(`${doc.title}: berlabel draf, daftar isi menunjuk bab yang ada, dokumen terkait lengkap`, async ({ page }) => {
    await page.goto(doc.path);
    await expect(page.getByRole('heading', { level: 1, name: doc.title })).toBeVisible();
    await expect(page.getByText('DOKUMEN · DRAF')).toBeVisible();
    await expect(page.getByText(/Draf ini belum mencantumkan identitas resmi pengelola/)).toBeVisible();

    const anchors = await page.locator('main nav a[href^="#"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')!));
    expect(anchors.length).toBeGreaterThan(4);
    for (const anchor of new Set(anchors)) {
      await expect(page.locator(`${anchor} > h2`), anchor).toHaveCount(1);
    }

    const related = page.getByRole('navigation', { name: 'DOKUMEN TERKAIT' });
    for (const other of DOCUMENTS) await expect(related.locator(`a[href="${other.path}"]`)).toHaveCount(1);
    await expect(related.locator('a[aria-current="page"]')).toHaveAttribute('href', doc.path);
  });
}

test('footer di setiap halaman menautkan ketiga dokumen hukum', async ({ page }) => {
  await page.goto('/events');
  const legal = page.getByRole('navigation', { name: 'Dokumen hukum' });
  for (const doc of DOCUMENTS) await expect(legal.getByRole('link', { name: doc.title })).toHaveAttribute('href', doc.path);
});

test('tautan "Hapus akun & hak lain" dari Privasi & data menunjuk bab Hak kamu', async ({ page }) => {
  await page.goto('/privacy-policy#kp-9');
  await expect(page.locator('#kp-9 > h2')).toHaveText('9. Hak kamu');
});

test('Kebijakan cookie menyebut cookie yang benar-benar dipasang aplikasi', async ({ page }) => {
  await page.goto('/cookie-policy');
  const main = page.locator('main');
  for (const name of ['sb-…-auth-token', 'sf_sidebar', 'sf-theme', 'sf-motion', 'sf-deck-view', 'sf-deck-hinted']) {
    await expect(main.locator('code', { hasText: name }).first()).toBeVisible();
  }
  // Situs uji berjalan di mode demo: cookie sesi demo wajib disebut juga.
  await expect(main.locator('code', { hasText: 'sf_demo_session' })).toBeVisible();
});

test('sitemap memuat ketiga dokumen hukum', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'respons HTTP; cukup satu proyek');
  const xml = await (await request.get('/sitemap.xml')).text();
  for (const doc of DOCUMENTS) expect(xml).toContain(`${doc.path}</loc>`);
});

test.describe('ponsel', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'ponsel', 'tata letak ponsel');
  });

  test('daftar isi terlipat supaya isi dokumen tampil lebih dulu, dan bisa dibuka', async ({ page }) => {
    await page.goto('/terms');
    const toc = page.locator('main details:has(nav[aria-label="Daftar isi"])');
    await expect(toc).toBeVisible();
    await expect(toc.getByRole('link').first()).toBeHidden();
    await toc.locator('summary').click();
    await expect(toc.getByRole('link').first()).toBeVisible();
  });
});

test('Privasi & data mengikuti pilihan visibilitas yang sebenarnya, bukan kalimat tetap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'satu proyek cukup');
  // Setiap masuk demo = identitas baru yang terisolasi, bawaannya tersembunyi (opt-in).
  await signInAsDemo(page, 'Mahasiswa', '/profile/privacy');
  const main = page.locator('main');
  await expect(main.getByText('Tidak ada — profilmu tersembunyi dan kartu pemainmu tertutup')).toBeVisible();

  await page.goto('/connections?tab=pengaturan');
  await page.getByRole('switch', { name: /Tampilkan aku di Cari Koneksi/ }).check();
  await page.getByRole('button', { name: 'Simpan pengaturan' }).click();
  await expect(page).toHaveURL(/notice=network_profile_saved/);

  await page.goto('/profile/privacy');
  await expect(main.getByText(/Profil publikmu tanpa email .* karena profilmu terlihat di Koneksi/)).toBeVisible();
  for (const name of ['Atur visibilitas Koneksi', 'Atur kartu pemain']) {
    expect((await main.getByRole('link', { name }).boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
  }
});

test('Privasi & data: unduhan JSON memuat data akun, lewat tautan biasa', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'satu proyek cukup');
  await signInAsDemo(page, 'Mahasiswa', '/profile/privacy');
  const main = page.locator('main');

  const [download] = await Promise.all([page.waitForEvent('download'), main.getByRole('link', { name: 'Unduh salinan dataku' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^studentfo-data-saya-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(data.format).toBe('studentfo-account-export/1');
  expect(data.account.email).toMatch(/@/);
  for (const key of ['savedEvents', 'applicationBoard', 'registrations', 'teams', 'network', 'playerCard', 'submissions', 'notifications']) {
    expect(data, key).toHaveProperty(key);
  }
});

test('ekspor data tanpa sesi dialihkan ke halaman masuk', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'satu proyek cukup');
  await page.goto('/profile/privacy/ekspor');
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Fprivacy/);
});
