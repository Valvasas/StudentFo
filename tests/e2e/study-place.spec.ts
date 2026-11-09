import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Tempat studi, domisili & bidang spesifik (ADR-074–076) di mode seed.
 * Setiap masuk demo = akun baru, jadi tes ini tidak saling menimpa.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'gelap', 'alur, bukan tampilan; terang + ponsel cukup');
});

test('Data diri: pilih kampus dari direktori + domisili sampai kecamatan; orang lain hanya melihat kab/kota', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/details?ubah=asal');

  const campus = page.getByRole('combobox', { name: 'Sekolah / kampus' });
  await campus.fill('itb');
  await page.getByRole('option', { name: /Institut Teknologi Bandung \(ITB\)/ }).click();
  await expect(campus).toHaveValue('Institut Teknologi Bandung (ITB)');

  await page.getByRole('button', { name: 'Domisili' }).click();
  await page.getByRole('combobox', { name: 'Cari kabupaten / kota' }).fill('Kota Bandung');
  await page.getByRole('option', { name: /^Kota Bandung/ }).click();
  const district = page.getByRole('combobox', { name: /Kecamatan/ });
  await expect(district).toBeEnabled();
  await district.selectOption({ label: 'Coblong' });

  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page).toHaveURL(/notice=study_place_saved/);
  const card = page.locator('#asal');
  await expect(card).toContainText('Institut Teknologi Bandung (ITB)');
  await expect(card).toContainText('Kec. Coblong, Kota Bandung, Jawa Barat');

  // Pratinjau publik = yang dilihat orang lain: kab/kota, tanpa kecamatan.
  await page.goto('/profile?tampilan=publik');
  await expect(page.getByText('Institut Teknologi Bandung (ITB)')).toBeVisible();
  await expect(page.getByText('Kota Bandung, Jawa Barat')).toBeVisible();
  await expect(page.getByText(/Coblong/)).toHaveCount(0);
});

test('teks bebas di luar direktori tetap tersimpan apa adanya', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/details?ubah=asal');
  await page.getByRole('combobox', { name: 'Sekolah / kampus' }).fill('Pesantren Kilat Uji Coba');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page).toHaveURL(/notice=study_place_saved/);
  await expect(page.locator('#asal')).toContainText('Pesantren Kilat Uji Coba');
});

test('Peminatan: bidang spesifik ikut memilih bidang induknya', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/interests');
  const group = page.locator('details').filter({ hasText: 'Teknik & Rekayasa' });
  await group.locator('summary').click();
  await group.getByRole('checkbox', { name: 'Teknik Sipil & Konstruksi' }).check();
  await page.getByRole('button', { name: 'Simpan profil' }).click();
  await expect(page).toHaveURL(/notice=profile_saved/);
  await expect(page.getByRole('checkbox', { name: 'Teknik & Rekayasa' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Teknik Sipil & Konstruksi' })).toBeChecked();
});

test('profil publik orang lain & lobi menampilkan tempat studinya', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/orang/seed-user-1');
  await expect(page.getByText('Universitas Indonesia (UI)')).toBeVisible();
  await expect(page.getByText('Kota Depok, Jawa Barat')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Bidang peminatan spesifik' })).toContainText('Desain UI/UX');
});
