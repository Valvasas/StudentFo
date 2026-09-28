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
  // Tombol di dalam <details> yang tertutup (konfirmasi blokir) tidak dirender.
  // Tunggu animasi `.pop` (mulai dari scale 0.985) selesai: tanpa ini ukuran
  // di frame pertama terbaca 43,3px walau gerak dikurangi.
  await panel.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  for (const control of await panel.locator('form button:visible, a:visible, summary:visible').all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0, await control.innerText()).toBeGreaterThanOrEqual(43.5);
  }
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('section[aria-label^="Detail:"]')).toHaveCount(0);
});

test('blokir tanpa JavaScript: dari daftar koneksi & kartu ajakan, hilang dari mana pun, lalu dibuka lagi', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await signInAsDemo(page, 'Mahasiswa', '/connections');
  const mine = page.locator('section[aria-labelledby="koneksimu"]');
  const blocked = page.locator('section[aria-labelledby="diblokir-title"]');
  await expect(blocked.getByText('Belum ada.', { exact: false })).toBeVisible();

  await mine.locator('summary[aria-label="Opsi untuk Rani Prameswari"]').click();
  await mine.getByRole('button', { name: 'Ya, blokir Rani Prameswari' }).click();
  await expect(page).toHaveURL(/notice=person_blocked/);
  await expect(page.getByText(/^Diblokir\. Koneksi & ajakan/)).toBeVisible();
  await expect(mine.getByText('Rani Prameswari', { exact: true })).toHaveCount(0);
  await expect(page.locator('#orang-seed-user-1')).toHaveCount(0);
  await expect(blocked.getByText('Rani Prameswari', { exact: true })).toBeVisible();
  await expect(page.locator('dl').getByText('Koneksi', { exact: true }).locator('..')).toContainText('2');

  const incoming = page.locator('section[aria-labelledby="ajakan-masuk"]');
  const rizky = incoming.getByRole('article').filter({ hasText: 'Rizky Hidayat' });
  await rizky.locator('summary[aria-label="Blokir Rizky Hidayat"]').click();
  await rizky.getByRole('button', { name: 'Ya, blokir Rizky Hidayat' }).click();
  await expect(page).toHaveURL(/notice=person_blocked/);
  await expect(incoming.getByRole('article')).toHaveCount(1);
  await expect(blocked.getByRole('listitem')).toHaveCount(2);

  await blocked.getByRole('button', { name: 'Buka blokir Rani Prameswari' }).click();
  await expect(page).toHaveURL(/notice=person_unblocked/);
  await expect(blocked.getByRole('listitem')).toHaveCount(1);
  // Tidak ada lagi hubungan apa pun: Rani kembali sebagai saran, bukan koneksi.
  await expect(page.locator('section[aria-labelledby="cari-koneksi"] #orang-seed-user-1')).toBeVisible();
  await context.close();
});

test('parameter tampil yang aneh tidak merusak halaman', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/connections');
  for (const value of ['abc', '-5', '999999', '2']) {
    const response = await page.goto(`/connections?tampil=${value}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('section[aria-labelledby="koneksimu"] li')).toHaveCount(3);
  }
});

test('tamu melihat peta contoh tanpa nama & ajakan masuk', async ({ page }) => {
  await page.goto('/connections');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Temukan rekan satu minat');
  await expect(page.getByRole('img', { name: /Contoh peta koneksi/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Masuk untuk mulai' })).toHaveAttribute('href', /next=%2Fconnections/);
});
