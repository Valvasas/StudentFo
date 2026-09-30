import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Portofolio, profil publik, riwayat penyelenggara, pemulihan moderasi
 * (ADR-046) di browser sungguhan, mode seed.
 */
const PAST_LOMBA = '/tracker/lomba-desain-ui-ux-nasional-edisi-lalu';

test('portofolio otomatis: riwayat pemilik lengkap, tampilan publik tanpa yang privat & belum lolos', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile?tab=portofolio');
  const owner = page.locator('section[aria-labelledby="portofolio-title"]');
  await expect(owner.getByRole('link', { name: 'Lomba Desain UI/UX Nasional', exact: true })).toBeVisible();
  await expect(owner.getByText('Belum lolos')).toBeVisible();
  await expect(owner.getByText('Hanya kamu')).toBeVisible();

  await page.goto('/profile?tampilan=publik&tab=portofolio');
  const preview = page.locator('section[aria-labelledby="portofolio-title"]');
  await expect(preview.getByText('Juara 3')).toBeVisible();
  await expect(preview.getByText('Beasiswa Talenta Digital Gelombang 1')).toHaveCount(0);
  await expect(preview.getByRole('link', { name: /Ubah hasil/ })).toHaveCount(0);
});

test('isi hasil di tracker → tampil di profil publik; tautan non-https ditolak dengan pesan', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', PAST_LOMBA);
  await page.getByLabel('Hasil', { exact: true }).selectOption('JUARA_1');
  await page.getByLabel(/Catatan hasil/).fill('Kategori utama');
  await page.getByRole('button', { name: 'Simpan portofolio' }).click();
  await expect(page.getByText('Portofolio diperbarui.')).toBeVisible();

  // Tanpa JS pun server menolak: validasi di Server Action, bukan hanya atribut HTML.
  await page.getByLabel('Tautan bukti').evaluate((input: HTMLInputElement) => {
    input.removeAttribute('pattern');
    input.type = 'text';
  });
  await page.getByLabel('Tautan bukti').fill('http://tidak-aman.example');
  await page.getByRole('button', { name: 'Simpan portofolio' }).click();
  await expect(page.getByText(/tautan bukti harus https/)).toBeVisible();

  await page.goto('/profile?tampilan=publik&tab=portofolio');
  await expect(page.getByText('Juara 1', { exact: true })).toBeVisible();
  await expect(page.getByText(/Kategori utama/)).toBeVisible();
});

test('profil publik orang lain: portofolio tampil, beasiswa privatnya tidak; id tak dikenal = 404', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/connections?tab=koneksi');
  await page.locator('section[aria-labelledby="koneksimu"]').getByRole('link', { name: /Rani Prameswari/ }).click();
  await expect(page).toHaveURL(/\/orang\/seed-user-1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Rani Prameswari' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="nama-orang"]').getByText('Terhubung denganmu')).toBeVisible();
  await expect(page.getByText('Juara 2')).toBeVisible();
  await expect(page.getByText(/dilaporkan sendiri/)).toBeVisible();

  await page.goto('/orang/seed-user-10');
  await expect(page.getByText('Finalis', { exact: true })).toBeVisible();
  await expect(page.getByText('Beasiswa Talenta Digital Gelombang 1')).toHaveCount(0);

  expect((await page.goto('/orang/tidak-ada'))?.status()).toBe(404);
});

test('penyelenggara: acara yang sudah tutup pindah ke Riwayat acara', async ({ page }) => {
  await signInAsDemo(page, 'Penyelenggara', '/penyelenggara');
  const history = page.locator('section[aria-labelledby="riwayat-acara"]');
  await expect(history.getByRole('listitem').filter({ hasText: 'Lomba Desain UI/UX Nasional' })).toHaveCount(1);
  await expect(history.getByRole('link', { name: 'Analitik lengkap Lomba Desain UI/UX Nasional' })).toBeVisible();
  await expect(history.getByText('Pengunjung unik')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="acara-saya"]').getByText('Lomba Desain UI/UX Nasional', { exact: true })).toHaveCount(0);
});

test('admin: tolak butuh konfirmasi, lalu bisa dikembalikan dari riwayat', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  const title = 'Lomba Poster Kesehatan Remaja';
  await signInAsDemo(page, 'Admin moderator', '/admin');
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) });
  await card.getByText('Tolak', { exact: true }).click();
  await card.getByRole('button', { name: 'Ya, tolak' }).click();
  await expect(card).toHaveCount(0);

  await page.goto('/admin/riwayat');
  await page.getByRole('button', { name: new RegExp(`Kembalikan ke antrean — ${title}`) }).click();
  await expect(page.getByText('Dikembalikan ke antrean moderasi')).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`Kembalikan ke antrean — ${title}`) })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});
