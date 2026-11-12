import { expect, test, type Page } from '@playwright/test';
import { demoPosterPng, demoScenePng } from '../../src/lib/data/demo-media';
import { confirmDialog, signInAsDemo } from './helpers';

/**
 * Foto profil & banner kartu profil (ADR-083), sebagai alur nyata. Setiap
 * masuk demo = identitas baru yang terisolasi, jadi data contoh bersama tidak
 * berubah. Satu proyek cukup untuk alurnya; tampilan sempit dijaga
 * narrow-viewport.spec.ts.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'alur, bukan tampilan; cukup satu proyek');
});

const MEDIA_SRC = /^\/media\/profil\/[0-9a-f-]{36}$/;

async function uploadTo(page: Page, input: string, button: string, buffer: Uint8Array): Promise<void> {
  await page.locator(input).setInputFiles({ name: 'gambar.png', mimeType: 'image/png', buffer: Buffer.from(buffer) });
  // Peramban memperkecil gambar dulu; tombol kirim baru aman ditekan setelah ringkasannya muncul.
  await expect(page.getByText('1 gambar siap dikirim.').first()).toBeVisible();
  await page.getByRole('button', { name: button }).click();
}

test('pasang foto → tampil di menu akun & halaman profil; tamu tidak bisa membuka berkasnya; hapus mengembalikan inisial', async ({ page, browser }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/details');
  const card = page.locator('#tampilan');
  await expect(card.getByRole('heading', { name: 'Foto & banner' })).toBeVisible();
  await expect(card.locator('img[src^="/media/profil/"]')).toHaveCount(0);

  await uploadTo(page, '#foto-profil', 'Pasang foto', demoPosterPng(1));
  await expect(page).toHaveURL(/notice=avatar_saved/);
  await expect(page.getByText(/Foto profil terpasang/)).toBeVisible();
  const photo = card.locator('img[src^="/media/profil/"]').first();
  await expect(photo).toBeVisible();
  const src = await photo.getAttribute('src');
  expect(src).toMatch(MEDIA_SRC);

  // Berkasnya privat: pemilik menerima gambar tanpa cache bersama; tamu menerima 404 yang sama dengan id ngawur.
  const own = await page.request.get(src!);
  expect(own.status()).toBe(200);
  expect(own.headers()['content-type']).toBe('image/png');
  expect(own.headers()['cache-control']).toContain('private');
  expect(own.headers()['x-content-type-options']).toBe('nosniff');
  const guest = await browser.newContext();
  expect((await guest.request.get(src!)).status()).toBe(404);
  expect((await guest.request.get('/media/profil/00000000-0000-4000-8000-000000000000')).status()).toBe(404);
  await guest.close();

  // Menu akun dan kepala halaman profil memakai foto yang sama.
  // (`:visible`: sidebar akun punya salinan untuk tata letak sempit yang tersembunyi di layar lebar.)
  await page.locator('summary[aria-label^="Menu akun"]').click();
  await expect(page.locator(`header img[src="${src}"]:visible`).first()).toBeVisible();
  await page.goto('/profile');
  await expect(page.locator(`main img[src="${src}"]:visible`).first()).toBeVisible();

  await page.goto('/profile/details');
  await page.locator('#tampilan').getByRole('button', { name: 'Hapus foto' }).click();
  await confirmDialog(page, 'Ya, hapus foto');
  await expect(page).toHaveURL(/notice=avatar_removed/);
  await expect(page.locator('#tampilan img[src^="/media/profil/"]')).toHaveCount(0);
  expect((await page.request.get(src!)).status()).toBe(404);
});

test('banner: gaya bawaan tersimpan; unggahan menimpanya dan bisa dihapus lagi', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/details');
  const card = page.locator('#tampilan');
  await expect(card.getByRole('radio', { name: 'Kertas bertitik' })).toBeChecked();

  await card.getByRole('radio', { name: 'Ombak' }).check();
  await card.getByRole('button', { name: 'Simpan banner' }).click();
  await expect(page).toHaveURL(/notice=banner_preset_saved/);
  await expect(page.locator('#tampilan').getByRole('radio', { name: 'Ombak' })).toBeChecked();

  await page.locator('#tampilan summary', { hasText: 'Atau unggah banner sendiri' }).click();
  await uploadTo(page, '#banner-unggahan', 'Pasang banner', demoScenePng(1));
  await expect(page).toHaveURL(/notice=banner_saved/);
  await expect(page.locator('#tampilan summary', { hasText: 'Banner unggahanmu' })).toBeVisible();
  await expect(page.locator('#tampilan img[src^="/media/profil/"]').first()).toBeVisible();

  await page.locator('#tampilan').getByRole('button', { name: 'Hapus banner unggahan' }).click();
  await confirmDialog(page, 'Ya, hapus banner');
  await expect(page).toHaveURL(/notice=banner_removed/);
  await expect(page.locator('#tampilan img[src^="/media/profil/"]')).toHaveCount(0);
  // Gaya bawaan pilihan tetap ada di bawahnya.
  await expect(page.locator('#tampilan').getByRole('radio', { name: 'Ombak' })).toBeChecked();
});

test('berkas yang bukan gambar ditolak dengan pesan jelas', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/details');
  await page.locator('#foto-profil').setInputFiles({ name: 'dokumen.png', mimeType: 'image/png', buffer: Buffer.from('%PDF-1.7 bukan gambar') });
  await page.getByRole('button', { name: 'Pasang foto' }).click();
  await expect(page).toHaveURL(/error=image_invalid/);
  await expect(page.locator('#tampilan img[src^="/media/profil/"]')).toHaveCount(0);
});

test('foto terlihat anggota lain di Koneksi; moderator melihat, mencabut, dan tercatat di riwayat', async ({ browser }) => {
  const [ownerContext, readerContext, adminContext] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [owner, reader, admin] = await Promise.all([ownerContext.newPage(), readerContext.newPage(), adminContext.newPage()]);
  const token = `uji-foto-${Date.now()}`;

  // Pemilik membuka profilnya di Koneksi lalu memasang foto.
  await signInAsDemo(owner, 'Siswa baru', '/connections?tab=pengaturan');
  await owner.getByRole('switch', { name: /Tampilkan aku di Cari Koneksi/ }).check();
  await owner.getByLabel('Headline').fill(token);
  await owner.getByRole('button', { name: 'Simpan pengaturan' }).click();
  await owner.getByRole('alertdialog').getByRole('button', { name: 'Ya, tampilkan' }).click();
  await expect(owner).toHaveURL(/notice=network_profile_saved/);
  await owner.goto('/profile/details');
  await uploadTo(owner, '#foto-profil', 'Pasang foto', demoPosterPng(2));
  await expect(owner).toHaveURL(/notice=avatar_saved/);
  const src = await owner.locator('#tampilan img[src^="/media/profil/"]').first().getAttribute('src');
  expect(src).toMatch(MEDIA_SRC);

  // Anggota lain menemukannya di Cari Koneksi — kartunya memuat foto itu.
  await signInAsDemo(reader, 'Mahasiswa', '/connections');
  await reader.getByRole('searchbox', { name: /Cari nama, jurusan/ }).fill('Raka');
  await reader.getByRole('searchbox', { name: /Cari nama, jurusan/ }).press('Enter');
  const person = reader.locator('section[aria-labelledby="cari-koneksi"] article').filter({ hasText: token });
  await expect(person.locator(`img[src="${src}"]`)).toBeAttached();
  expect((await reader.request.get(src!)).status()).toBe(200);

  // Moderator: gambar terlihat di daftar pengguna, alasan wajib, lalu dicabut.
  await signInAsDemo(admin, 'Admin moderator', '/admin/pengguna?q=Raka');
  const row = admin.locator('main li').filter({ has: admin.locator(`img[src="${src}"]`) }).first();
  await expect(row.getByRole('img', { name: /^Foto profil Raka/ })).toBeVisible();
  await row.locator('summary', { hasText: 'Cabut foto & banner' }).click();
  const form = row.locator('form').filter({ has: admin.getByRole('button', { name: 'Konfirmasi: cabut gambar' }) });
  await form.getByLabel('Alasan (wajib, tercatat di riwayat)', { exact: true }).fill(`Foto bukan milik sendiri ${token}`);
  await form.getByRole('button', { name: 'Konfirmasi: cabut gambar' }).click();
  await expect(admin).toHaveURL(/notice=profile_media_cleared/);
  await expect(admin.getByText(/Foto profil & banner akun itu dicabut/)).toBeVisible();
  await expect(admin.locator(`main img[src="${src}"]`)).toHaveCount(0);

  await admin.goto('/admin/riwayat');
  const entry = admin.locator('main li').filter({ hasText: `Foto bukan milik sendiri ${token}` });
  await expect(entry.getByText('Foto & banner dicabut — Raka Aditya')).toBeVisible();

  // Berkasnya benar-benar hilang — untuk pemilik, pembaca, dan moderator; akunnya tetap aktif.
  for (const page of [owner, reader, admin]) expect((await page.request.get(src!)).status()).toBe(404);
  await owner.goto('/profile/details');
  await expect(owner.locator('#tampilan img[src^="/media/profil/"]')).toHaveCount(0);
  await expect(owner.locator('#tampilan').getByRole('button', { name: 'Pasang foto' })).toBeVisible();

  await Promise.all([ownerContext.close(), readerContext.close(), adminContext.close()]);
});
