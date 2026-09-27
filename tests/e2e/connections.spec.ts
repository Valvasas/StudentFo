import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Alur Koneksi (ADR-040) di browser sungguhan: jaringan awal persona,
 * terima ajakan, kirim ajakan berpesan, dua akun demo saling terhubung,
 * dan peta yang bisa dikendalikan keyboard.
 */

test('mahasiswa: terima ajakan masuk lalu kirim ajakan berpesan', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/connections');
  const incoming = page.locator('section[aria-labelledby="ajakan-masuk"]');
  await expect(incoming.getByRole('article')).toHaveCount(2);

  await incoming.getByRole('button', { name: /Terima ajakan Rizky Hidayat/ }).click();
  await expect(page).toHaveURL(/notice=connection_accepted/);
  await expect(page.getByText('Ajakan diterima. Kalian sekarang terhubung.')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="koneksimu"]').getByText('Rizky Hidayat', { exact: true })).toBeVisible();

  const card = page.locator('#orang-seed-user-2');
  await card.getByText('+ Tambah pesan pengantar').click();
  await card.getByRole('textbox', { name: 'Pesan pengantar' }).fill('Halo Dimas, yuk satu tim!');
  await card.getByRole('button', { name: /Hubungkan dengan Dimas Arya/ }).click();
  await expect(page).toHaveURL(/notice=connection_requested/);
  await expect(page.locator('section[aria-labelledby="terkirim"]').getByText('Dimas Arya', { exact: true })).toBeVisible();
});

test('saringan minat & kata kunci berbentuk URL dan tetap jalan tanpa JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await signInAsDemo(page, 'Mahasiswa', '/connections');
  await page.getByRole('searchbox', { name: /Cari nama, jurusan/ }).fill('statistika');
  await page.getByRole('searchbox', { name: /Cari nama, jurusan/ }).press('Enter');
  await expect(page).toHaveURL(/q=statistika/);
  await expect(page.locator('section[aria-labelledby="cari-koneksi"] article')).toHaveCount(0);
  await page.goto('/connections?minat=desain');
  const cards = page.locator('section[aria-labelledby="cari-koneksi"] article');
  expect(await cards.count()).toBeGreaterThan(0);
  await context.close();
});

test('dua akun demo: opt-in terlihat → diajak → diterima, keduanya dikabari', async ({ browser }) => {
  const aContext = await browser.newContext();
  const bContext = await browser.newContext();
  const a = await aContext.newPage();
  const b = await bContext.newPage();

  await signInAsDemo(b, 'Siswa baru', '/connections');
  await expect(b.getByText('Profilmu belum bisa ditemukan.')).toBeVisible();
  await b.getByRole('switch', { name: /Tampilkan aku di Cari Koneksi/ }).check();
  const headline = `Uji koneksi ${Date.now()}`;
  await b.getByLabel('Headline').fill(headline);
  await b.getByRole('button', { name: 'Simpan pengaturan' }).click();
  await expect(b).toHaveURL(/notice=network_profile_saved/);

  await signInAsDemo(a, 'Mahasiswa', '/connections');
  await a.getByRole('searchbox', { name: /Cari nama, jurusan/ }).fill('Raka');
  await a.getByRole('searchbox', { name: /Cari nama, jurusan/ }).press('Enter');
  await expect(a).toHaveURL(/q=Raka/);
  const raka = a.locator('section[aria-labelledby="cari-koneksi"] article').filter({ hasText: headline });
  await raka.getByRole('button', { name: /Hubungkan/ }).click();
  await expect(a).toHaveURL(/notice=connection_requested/);

  await b.goto('/connections');
  await b.getByRole('button', { name: /Terima ajakan Dinda Pratiwi/ }).click();
  await expect(b.locator('section[aria-labelledby="koneksimu"]').getByText('Dinda Pratiwi', { exact: true })).toBeVisible();

  await a.goto('/connections');
  await a.locator('summary[aria-label^="Notifikasi"]').click();
  await expect(a.getByText('Raka Aditya menerima ajakan koneksimu.')).toBeVisible();
  await aContext.close();
  await bContext.close();
});

test('peta: kanvas tergambar, navigasi keyboard membuka panel detail', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/connections');
  const canvas = page.locator('canvas[aria-roledescription="peta koneksi"]');
  await expect(canvas).toBeVisible();
  const painted = await canvas.evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index]! > 0) count += 1;
    return count;
  });
  expect(painted).toBeGreaterThan(500);

  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('p[aria-live="polite"]')).not.toBeEmpty();
  await page.keyboard.press('Enter');
  const panel = page.locator('section[aria-label^="Detail:"]');
  await expect(panel).toBeVisible();
  // Tombol aksi panel tidak boleh kolaps di wadah flex-col (target sentuh 44px).
  for (const control of await panel.locator('form button, a').all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0, await control.innerText()).toBeGreaterThanOrEqual(43.5);
  }
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('section[aria-label^="Detail:"]')).toHaveCount(0);
});

test('tamu melihat peta contoh tanpa nama & ajakan masuk', async ({ page }) => {
  await page.goto('/connections');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Temukan rekan satu minat');
  await expect(page.getByRole('img', { name: /Contoh peta koneksi/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Masuk untuk mulai' })).toHaveAttribute('href', /next=%2Fconnections/);
});
