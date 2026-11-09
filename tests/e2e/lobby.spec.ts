import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Lobi lomba (ADR-071) di mode seed. Data contoh dipakai bersama tes yang
 * berjalan paralel (setiap masuk demo = akun baru), jadi jumlah anggota
 * diperiksa sebagai pola, bukan angka tetap.
 */
const LOBBY = '/lobi/kompetisi-inovasi-perangkat-lunak-nusantara-2026';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'gelap', 'alur, bukan tampilan; terang + ponsel cukup');
});

test('lobi: daftar lobi → anggota tersembunyi sebelum bergabung → bergabung, sapa, ajak teman, keluar', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/lobi');
  const row = page.getByRole('listitem').filter({ hasText: 'Kompetisi Inovasi Perangkat Lunak' });
  await expect(row.getByText(/\d+ peserta di lobi/)).toBeVisible();
  await expect(row.getByText('Belum bergabung')).toBeVisible();
  await row.getByRole('link', { name: /Masuk lobi/ }).click();
  await expect(page).toHaveURL(new RegExp(`${LOBBY}$`));

  // Timbal-balik: belum bergabung = hanya jumlah, tanpa nama.
  await expect(page.getByText(/peserta sudah di lobi\. Masuk lobi untuk melihat siapa saja/)).toBeVisible();
  await expect(page.getByText('Dimas Arya')).toHaveCount(0);

  await page.getByRole('radio', { name: /Mencari tim/ }).check();
  await page.getByLabel('Catatan singkat (opsional)').fill('Bisa UI/UX, cari backend');
  await page.getByRole('button', { name: 'Masuk lobi' }).click();
  await expect(page).toHaveURL(/notice=lobby_joined/);

  const members = page.getByRole('region', { name: 'Peserta di lobi' });
  await expect(members.getByText('Arif Setiawan')).toBeVisible();
  // Arif menyalakan "tampilkan lencanaku" dan punya pendaftaran terkonfirmasi yang sudah ditutup (ADR-072).
  const arif = members.getByRole('listitem').filter({ hasText: 'Arif Setiawan' });
  await expect(arif.getByRole('list', { name: 'Lencana yang diraih' })).toContainText('Debut Arena');
  // Citra tidak menyalakannya: tanpa lencana.
  await expect(members.getByRole('listitem').filter({ hasText: 'Citra Lestari' }).getByRole('list', { name: 'Lencana yang diraih' })).toHaveCount(0);
  await expect(members.getByRole('listitem').filter({ hasText: 'Rani Prameswari' }).getByText('Terhubung')).toBeVisible();
  // Tempat studi sesama peserta (ADR-076): kampus + kab/kota, kecamatan tidak pernah tampil.
  const rani = members.getByRole('listitem').filter({ hasText: 'Rani Prameswari' });
  await expect(rani).toContainText('Universitas Indonesia (UI)');
  await expect(rani).toContainText('Kota Depok, Jawa Barat');
  await expect(rani).not.toContainText('Kec.');

  const dimas = members.getByRole('listitem').filter({ hasText: 'Dimas Arya' });
  await dimas.getByRole('button', { name: 'Ajak terhubung' }).click();
  await expect(page).toHaveURL(/notice=connection_requested/);
  await expect(members.getByRole('listitem').filter({ hasText: 'Dimas Arya' }).getByText('Ajakan menunggu')).toBeVisible();

  const invite = page.getByRole('region', { name: 'Ajak teman ikut lomba ini' });
  await invite.getByRole('listitem').filter({ hasText: 'Salsabila Putri' }).getByRole('button', { name: 'Ajak' }).click();
  await expect(page).toHaveURL(/notice=lobby_invited/);
  await expect(page.getByText(/Sudah kamu ajak: .*Salsabila Putri/)).toBeVisible();

  await page.getByRole('button', { name: 'Keluar lobi' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ya, keluar' }).click();
  await expect(page).toHaveURL(/notice=lobby_left/);
  await expect(page.getByRole('button', { name: 'Masuk lobi' })).toBeVisible();
});

test('lobi lomba yang belum didaftar: penjelasan + catat "Sudah daftar" membuka lobi; bukan lomba = 404', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/lobi/olimpiade-matematika-pelajar-tingkat-nasional');
  await expect(page.getByRole('heading', { name: 'Lobi ini untuk peserta yang sudah mendaftar' })).toBeVisible();
  await page.getByRole('button', { name: /Sudah daftar, buka lobinya/ }).click();
  await expect(page.getByRole('button', { name: 'Masuk lobi' })).toBeVisible();

  const response = await page.goto('/lobi/program-relawan-literasi-desa-angkatan-7');
  expect(response?.status()).toBe(404);
});

test('tamu diarahkan masuk dulu', async ({ page }) => {
  await page.goto(LOBBY);
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('lencana: bawaan privat → tampilkan → terlihat di pratinjau publik → privat lagi', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile?tab=lencana');
  await expect(page.getByRole('heading', { name: 'Lencanamu privat' })).toBeVisible();
  await page.goto('/profile?tampilan=publik');
  await expect(page.getByRole('list', { name: 'Lencana yang diraih' })).toHaveCount(0);

  await page.goto('/profile?tab=lencana');
  await page.getByRole('button', { name: 'Tampilkan lencanaku' }).click();
  await expect(page).toHaveURL(/notice=badges_shown/);
  await expect(page.getByRole('heading', { name: 'Lencanamu tampil untuk orang lain' })).toBeVisible();
  await page.goto('/profile?tampilan=publik');
  await expect(page.getByRole('list', { name: 'Lencana yang diraih' })).toBeVisible();

  await page.goto('/profile?tab=lencana');
  await page.getByRole('button', { name: 'Jadikan privat' }).click();
  await expect(page).toHaveURL(/notice=badges_hidden/);
});
