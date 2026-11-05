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

  await page.goto('/profile/interests');
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
  // Tunggu POST Server Action selesai sebelum reload — tanpa ini reload bisa
  // membatalkan aksi yang masih di jalan (gagal acak saat mesin uji sibuk).
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/tracker'),
    stage.locator('xpath=ancestor::form').getByRole('button', { name: 'Ubah' }).click(),
  ]);
  await page.reload();
  await expect(page.getByLabel(new RegExp(`Tahap lamaran untuk ${title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toHaveValue('APPLIED');

  await page.getByRole('button', { name: new RegExp(`Hapus .* dari Papan lamaran`) }).first().click();
  // Menghapus catatan & hasil portofolio = satu langkah konfirmasi (ADR-063); Batal tidak mengubah apa pun.
  const confirmRemove = page.getByRole('alertdialog', { name: 'Hapus dari Papan lamaran?' });
  await expect(confirmRemove).toBeVisible();
  await confirmRemove.getByRole('button', { name: 'Batal' }).click();
  await expect(confirmRemove).toBeHidden();
  await page.getByRole('button', { name: new RegExp(`Hapus .* dari Papan lamaran`) }).first().click();
  await confirmRemove.getByRole('button', { name: 'Ya, hapus' }).click();
  await expect(page).toHaveURL(/tracker/);
});

test('tim: buat tim → anggota lain bergabung → keluar; ketua melihat jumlah anggota berubah', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  const leaderContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  await signInAsDemo(leader, 'Mahasiswa', '/teams');
  const teamTitle = `Tim Uji Perjalanan ${Date.now()}`;
  // Membuka tim punya halamannya sendiri (ADR-054), bukan form terlipat di samping daftar.
  await leader.getByRole('link', { name: 'Buka tim baru' }).click();
  await expect(leader).toHaveURL(/\/teams\/baru$/);
  await leader.locator('#eventId').selectOption({ index: 1 });
  await leader.getByLabel('Judul tim').fill(teamTitle);
  await leader.getByLabel('Total anggota yang dibutuhkan').fill('3');
  await leader.getByRole('button', { name: 'Buka tim', exact: true }).click();
  await expect(leader).toHaveURL(/\/teams\/[0-9a-f-]{36}\?notice=team_created$/);
  await expect(leader.getByRole('heading', { name: 'Timmu sudah tampil di Cari Tim!' })).toBeVisible();
  const teamUrl = leader.url().split('?')[0]!;
  await expect(leader.getByText('1 dari 3 orang')).toBeVisible();

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signInAsDemo(member, 'Siswa baru', '/teams');
  await member.goto(teamUrl);
  await member.getByRole('button', { name: 'Ajukan gabung' }).click();
  await expect(member.getByRole('button', { name: 'Keluar dari tim' })).toBeVisible();
  // Gabung/keluar tidak lagi senyap (ADR-062): kode notice tertutup, bukan teks di URL.
  await expect(member).toHaveURL(/notice=team_joined/);
  await expect(member.getByText('Kamu masuk tim.', { exact: false }).first()).toBeVisible();

  await leader.reload();
  await expect(leader.getByText('Raka Aditya')).toBeVisible();
  await expect(leader.getByText('2 dari 3 orang')).toBeVisible();

  await member.getByRole('button', { name: 'Keluar dari tim' }).click();
  await member.getByRole('alertdialog').getByRole('button', { name: 'Ya, keluar dari tim' }).click();
  await expect(member).toHaveURL(/notice=team_left/);
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
  const menu = page.locator('details:has(> summary[aria-label^="Menu akun"])');
  await menu.locator('summary').click();
  // Dicari di dalam menu: halaman akun punya tombol "Keluar" kedua di sidebar.
  await menu.getByRole('button', { name: 'Keluar', exact: true }).click();
  // Keluar dari akun demo = datanya hilang, jadi ada konfirmasi (ADR-063).
  await menu.getByRole('alertdialog', { name: 'Keluar dari akun demo?' }).getByRole('button', { name: 'Ya, keluar' }).click();
  await expect(page.locator('summary[aria-label^="Menu akun"]')).toHaveCount(0);
  // Tamu di /tracker melihat ajakan masuk, bukan papan milik sesi sebelumnya.
  await page.goto('/tracker');
  await expect(page.getByRole('link', { name: 'Masuk untuk mulai melacak' })).toBeVisible();
});
