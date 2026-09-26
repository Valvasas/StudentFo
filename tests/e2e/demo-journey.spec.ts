import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Perjalanan pengunjung demo di browser sungguhan: klik, form, JS klien,
 * dan reload — bukan hanya request/response Server Action lewat curl.
 */

test('profil: mengisi minat mengubah urutan beranda dari cold start ke personal', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'satu proyek cukup');
  // /events (urut relevansi), bukan beranda: tautan pertama beranda berasal dari
  // pita tenggat & sorotan yang memang tidak dipersonalisasi.
  await signInAsDemo(page, 'Siswa baru', '/events');
  const before = await page.locator('main a[href^="/events/"]').evaluateAll((links) => links.slice(0, 6).map((a) => a.getAttribute('href')));

  await page.goto('/profile');
  await page.getByLabel('Jenjang pendidikan').selectOption('SMA_SMK');
  await page.getByRole('checkbox', { name: /Kesehatan/ }).check();
  await page.getByRole('checkbox', { name: /Seni/ }).check();
  await page.getByRole('button', { name: 'Simpan profil' }).click();
  await expect(page).toHaveURL(/notice=profile_saved/);

  await page.goto('/events');
  const after = await page.locator('main a[href^="/events/"]').evaluateAll((links) => links.slice(0, 6).map((a) => a.getAttribute('href')));
  expect(after).not.toEqual(before);
});

test('tracker: simpan → ubah tahap → tahap bertahan setelah reload → hapus', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/events');
  const link = page.locator('main a[href^="/events/"]').first();
  const title = (await link.textContent())?.trim() ?? '';
  await link.click();
  await page.getByRole('button', { name: 'Simpan ke Tracker' }).click();
  await expect(page.getByRole('button', { name: 'Tersimpan di Tracker' })).toBeVisible();

  await page.goto('/tracker');
  const stage = page.getByLabel(new RegExp(`Tahap lamaran untuk ${title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  await stage.selectOption('APPLIED');
  await stage.locator('xpath=ancestor::form').getByRole('button', { name: 'Ubah' }).click();
  await page.reload();
  await expect(page.getByLabel(new RegExp(`Tahap lamaran untuk ${title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toHaveValue('APPLIED');

  await page.getByRole('button', { name: new RegExp(`Hapus .* dari tracker`) }).first().click();
  await expect(page).toHaveURL(/tracker/);
});

test('tim: buat tim → anggota lain bergabung → keluar; ketua melihat jumlah anggota berubah', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInAsDemo(leader, 'Mahasiswa', '/teams');
  const teamTitle = `Tim Uji Perjalanan ${Date.now()}`;
  await leader.getByText('Buka tim baru').click(); // <details> tertutup secara bawaan
  await leader.locator('#eventId').selectOption({ index: 1 });
  await leader.getByLabel('Judul tim').fill(teamTitle);
  await leader.getByLabel('Total anggota yang dibutuhkan').fill('3');
  await leader.getByRole('button', { name: 'Buka tim' }).click();
  await expect(leader).toHaveURL(/\/teams\/[0-9a-f-]{36}/);
  const teamUrl = leader.url();
  await expect(leader.getByText('1 dari 3 orang')).toBeVisible();

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signInAsDemo(member, 'Siswa baru', '/teams');
  await member.goto(teamUrl);
  await member.getByRole('button', { name: 'Ajukan gabung' }).click();
  await expect(member.getByRole('button', { name: 'Keluar dari tim' })).toBeVisible();

  await leader.reload();
  await expect(leader.getByText('Raka Aditya')).toBeVisible();
  await expect(leader.getByText('2 dari 3 orang')).toBeVisible();

  await member.getByRole('button', { name: 'Keluar dari tim' }).click();
  await leader.reload();
  await expect(leader.getByText('Raka Aditya')).toHaveCount(0);
  await expect(leader.getByText('1 dari 3 orang')).toBeVisible();
  await leaderContext.close();
  await memberContext.close();
});

test('tema gelap bertahan setelah reload & pindah halaman (localStorage + skrip bernonce)', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const toggle = page.getByRole('button', { name: /Ganti ke tema (gelap|terang)/ });
  if ((await html.getAttribute('data-theme')) !== 'dark') await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.goto('/events');
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('keluar lewat menu akun menghapus sesi demo', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/tracker');
  await page.locator('summary[aria-label^="Menu akun"]').click();
  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page.locator('summary[aria-label^="Menu akun"]')).toHaveCount(0);
  // Tamu di /tracker melihat ajakan masuk, bukan papan milik sesi sebelumnya.
  await page.goto('/tracker');
  await expect(page.getByRole('link', { name: 'Masuk untuk mulai melacak' })).toBeVisible();
});
