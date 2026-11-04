import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Keamanan & kepercayaan (ADR-061), sebagai alur nyata: lapor → antrean admin
 * → tangguhkan → sesi terlapor putus → cabut → putuskan laporan; hapus akun
 * sendiri. Setiap masuk demo = identitas baru yang terisolasi, jadi data
 * contoh bersama tidak diubah. Satu proyek cukup — alurnya bukan tampilan.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'alur, bukan tampilan; cukup satu proyek');
});

test('lapor pengguna → admin menangguhkan → sesi terlapor putus → dicabut → laporan diputuskan', async ({ browser }) => {
  const [aContext, bContext, adminContext] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [a, b, admin] = await Promise.all([aContext.newPage(), bContext.newPage(), adminContext.newPage()]);
  const token = `uji-lapor-${Date.now()}`;

  // B membuka profilnya supaya bisa ditemukan (dan dilaporkan).
  await signInAsDemo(b, 'Siswa baru', '/connections?tab=pengaturan');
  await b.getByRole('switch', { name: /Tampilkan aku di Cari Koneksi/ }).check();
  await b.getByLabel('Headline').fill(token);
  await b.getByRole('button', { name: 'Simpan pengaturan' }).click();
  await expect(b).toHaveURL(/notice=network_profile_saved/);

  // A menemukan B lalu melaporkannya.
  await signInAsDemo(a, 'Mahasiswa', '/connections');
  await a.getByRole('searchbox', { name: /Cari nama, jurusan/ }).fill('Raka');
  await a.getByRole('searchbox', { name: /Cari nama, jurusan/ }).press('Enter');
  const card = a.locator('section[aria-labelledby="cari-koneksi"] article').filter({ hasText: token });
  await card.locator('a[href^="/orang/"]').first().click();
  await expect(a).toHaveURL(/\/orang\//);
  await a.getByRole('link', { name: 'Laporkan pengguna ini' }).click();
  await expect(a.getByRole('heading', { level: 1, name: 'Laporkan pengguna' })).toBeVisible();
  await a.getByRole('radio', { name: /Pelecehan atau intimidasi/ }).check();
  await a.getByLabel(/Keterangan/).fill(`Ajakan berulang ${token}`);
  await a.getByRole('button', { name: 'Kirim laporan' }).click();
  await expect(a).toHaveURL(/\/orang\/.*notice=report_sent/);
  await expect(a.getByText(/Laporan terkirim/)).toBeVisible();

  // Admin melihat laporan dan membuka akun yang dilaporkan.
  await signInAsDemo(admin, 'Admin moderator', '/admin/laporan');
  const report = admin.locator('main li').filter({ hasText: `Ajakan berulang ${token}` });
  await expect(report.getByText('Pelecehan atau intimidasi')).toBeVisible();
  await report.locator('a[href^="/admin/pengguna?q="]').click();
  const row = admin.locator('main li').filter({ hasText: 'Raka' }).first();
  await row.locator('summary', { hasText: 'Tangguhkan' }).click();
  await row.getByLabel('Alasan (wajib, tercatat di riwayat)', { exact: true }).fill(`Pelecehan berulang ${token}`);
  await row.getByRole('button', { name: 'Konfirmasi: tangguhkan' }).click();
  await expect(admin.getByText(/Akun ditangguhkan/)).toBeVisible();
  await expect(admin.locator('main li').filter({ hasText: `Pelecehan berulang ${token}` })).toBeVisible();

  // Sesi B putus seketika: halaman akun meminta masuk lagi.
  await b.goto('/profile');
  await expect(b).toHaveURL(/\/login\?next=%2Fprofile/);

  // Cabut, lalu putuskan laporannya; keduanya tercatat di riwayat.
  await admin.getByRole('button', { name: 'Cabut penangguhan' }).first().click();
  await expect(admin.getByText(/Penangguhan dicabut/)).toBeVisible();
  await admin.goto('/admin/laporan');
  const open = admin.locator('main li').filter({ hasText: `Ajakan berulang ${token}` });
  await open.getByLabel(/Catatan keputusan/).fill(`Diperingatkan lewat email ${token}`);
  await open.getByRole('button', { name: 'Abaikan' }).click();
  await expect(admin.getByText(/Laporan diabaikan/)).toBeVisible();
  await expect(admin.locator('main li').filter({ hasText: `Ajakan berulang ${token}` })).toHaveCount(0);

  // Pelapor dikabari hasilnya — tanpa catatan internal moderator (ADR-062).
  await a.goto('/');
  await a.locator('summary[aria-label^="Notifikasi"]').first().click();
  await expect(a.getByText(/Laporanmu tentang akun yang kamu laporkan sudah ditinjau moderator/).first()).toBeVisible();
  await expect(a.getByText(`Diperingatkan lewat email ${token}`)).toHaveCount(0);

  await admin.goto('/admin/riwayat');
  await expect(admin.getByText(`Diperingatkan lewat email ${token}`)).toBeVisible();
  await expect(admin.getByText(`Pelecehan berulang ${token}`)).toBeVisible();

  await Promise.all([aContext.close(), bContext.close(), adminContext.close()]);
});

test('lapor kegiatan dari halaman detail; tamu diminta masuk dulu', async ({ page }) => {
  await page.goto('/laporkan?kegiatan=kompetisi-inovasi-perangkat-lunak-nusantara-2026');
  await expect(page).toHaveURL(/\/login\?next=/);

  await signInAsDemo(page, 'Mahasiswa', '/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026');
  await page.getByRole('link', { name: /Laporkan kegiatan ini/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Laporkan kegiatan' })).toBeVisible();
  // Tanpa memilih alasan, peramban menahan form (required) — server pun menolak.
  await page.getByRole('radio', { name: /Penipuan/ }).check();
  await page.getByRole('button', { name: 'Kirim laporan' }).click();
  await expect(page).toHaveURL(/\/events\/kompetisi-inovasi-perangkat-lunak-nusantara-2026\?notice=report_sent/);

  // Subjek yang tidak ada = 404, bukan pesan yang membedakan.
  const missing = await page.goto('/laporkan?kegiatan=tidak-ada-sama-sekali');
  expect(missing?.status()).toBe(404);
});

test('hapus akun sendiri: frasa salah ditolak, frasa benar menghapus dan mengeluarkan', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/settings');
  const card = page.locator('#hapus-akun');
  await card.locator('summary', { hasText: 'Hapus akunku' }).click();
  await card.getByLabel(/untuk konfirmasi/).fill('HAPUS');
  await card.getByRole('button', { name: 'Hapus akun permanen' }).click();
  await expect(page).toHaveURL(/error=account_delete_confirm/);
  await expect(page.getByText(/Ketik HAPUS AKUN persis/)).toBeVisible();

  await page.locator('#hapus-akun summary', { hasText: 'Hapus akunku' }).click();
  await page.locator('#hapus-akun').getByLabel(/untuk konfirmasi/).fill('hapus akun');
  await page.locator('#hapus-akun').getByRole('button', { name: 'Hapus akun permanen' }).click();
  await expect(page).toHaveURL(/\/\?notice=account_deleted$/);
  await expect(page.getByText(/Akunmu dan datanya sudah dihapus/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Masuk', exact: true }).first()).toBeVisible();

  await page.goto('/profile/settings');
  await expect(page).toHaveURL(/\/login\?next=/);
});
