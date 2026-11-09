import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/** Username, bio, halaman /u/[username] (ADR-077) di mode seed. */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'gelap', 'alur, bukan tampilan; terang + ponsel cukup');
});

test('pasang username & bio: saran dari nama, tersimpan, tampil di profil; username terpakai ditolak', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/details?ubah=publik');
  const username = page.getByRole('textbox', { name: 'Username' });
  await expect(username).not.toHaveValue('');

  await username.fill('rani.prameswari');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page).toHaveURL(/error=username_taken/);
  await expect(page.getByText(/Username itu sudah dipakai orang lain/)).toBeVisible();

  const handle = `uji.${Date.now().toString(36)}`;
  await username.fill(`@${handle.toUpperCase()}`);
  await page.getByLabel(/^Bio/).fill('Suka lomba desain & data. Cari tim Gemastik.');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page).toHaveURL(/notice=profile_identity_saved/);
  await expect(page.locator('#publik').getByRole('link', { name: `@${handle}` })).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByText(`@${handle}`)).toBeVisible();
  await expect(page.getByText('Suka lomba desain & data. Cari tim Gemastik.')).toBeVisible();
  // Membuka profil sendiri lewat username = pratinjau publik.
  await page.goto(`/u/${handle}`);
  await expect(page).toHaveURL(/\/profile\?tampilan=publik/);
});

test('profil orang lain: /u/username memuat username, bio, kampus & kota; /orang/id dialihkan; tidak ada = 404', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/u/rani.prameswari');
  await expect(page.getByRole('heading', { name: 'Rani Prameswari' })).toBeVisible();
  await expect(page.getByText(/^Username:\s*rani\.prameswari$/)).toBeVisible();
  await expect(page.getByText(/ramah pembaca layar/)).toBeVisible();
  await expect(page.getByText('Universitas Indonesia (UI)')).toBeVisible();
  await expect(page.getByText('Kota Depok, Jawa Barat')).toBeVisible();
  // Persona demo sudah terhubung dengan Rani (data contoh) …
  await expect(page.getByText('Terhubung denganmu', { exact: true }).first()).toBeVisible();
  // … tetapi belum dengan Dimas: profil terbuka untuk anggota = bisa diajak langsung.
  await page.goto('/u/dimasarya');
  await page.getByRole('button', { name: /Hubungkan/ }).click();
  await expect(page).toHaveURL(/\/u\/dimasarya\?notice=connection_requested/);

  await page.goto('/orang/seed-user-1');
  await expect(page).toHaveURL(/\/u\/rani\.prameswari$/);

  // Profil "hanya koneksi" tetap terbuka untuk koneksinya (persona demo terhubung dengan Putri);
  // orang asing → 404 dikunci di profile-identity.test.ts, 114_profile_identity.test.sql, dan uji integrasi.
  const connected = await page.goto('/u/putri.ayu');
  expect(connected?.status()).toBe(200);
  const missing = await page.goto('/u/tidak.ada.sama.sekali');
  expect(missing?.status()).toBe(404);
});

test('tamu tidak bisa membuka profil — diarahkan masuk dulu', async ({ page }) => {
  await page.goto('/u/rani.prameswari');
  await expect(page).toHaveURL(/\/login\?next=/);
});
