import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Penyelenggara terverifikasi (ADR-042/043) di browser sungguhan: tidak ada
 * jalan pintas melewati moderator. Pengajuan → admin memverifikasi, dan
 * perubahan acara baru tampil setelah admin menerapkannya.
 */

const MANAGED = '/penyelenggara/acara/e1000000-0000-4000-8000-000000000001';

test('mahasiswa mengajukan verifikasi → admin memverifikasi → studio terbuka', async ({ browser }, testInfo) => {
  // Status penyelenggara menempel di data demo bersama: sekali terverifikasi,
  // proyek lain (gelap/ponsel) tidak lagi melihat formulir pengajuan.
  test.skip(testInfo.project.name !== 'terang', 'mengubah status persona bersama — cukup satu proyek');
  const studentContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const student = await studentContext.newPage();
  const admin = await adminContext.newPage();

  await signInAsDemo(student, 'Mahasiswa', '/penyelenggara');
  // Belum terverifikasi: tidak ada analitik, hanya formulir pengajuan.
  await expect(student.getByRole('heading', { name: 'Ajukan verifikasi' })).toBeVisible();
  const orgName = `Himpunan Uji ${Date.now()}`;
  await student.getByLabel('Nama lembaga / organisasi').fill(orgName);
  await student.getByLabel('Bukti peranmu').fill('Saya ketua himpunan, lihat https://himpunan.example/pengurus');
  await student.getByRole('button', { name: 'Kirim pengajuan' }).click();
  await expect(student).toHaveURL(/notice=organizer_applied/);
  await expect(student.getByText('Menunggu verifikasi')).toBeVisible();

  // Analitik acara orang lain tertutup walau URL-nya ditebak.
  await student.goto(MANAGED);
  await expect(student.getByRole('heading', { name: 'Acara ini tidak ada di dasbormu' })).toBeVisible();

  await signInAsDemo(admin, 'Admin moderator', '/admin/penyelenggara');
  const card = admin.getByRole('listitem').filter({ hasText: orgName });
  // Menolak tanpa alasan tidak mungkin: catatan wajib.
  await card.getByText('Tolak', { exact: true }).click();
  await expect(card.getByRole('textbox', { name: /Catatan untuk pemohon \(wajib\)/ })).toHaveAttribute('required', '');
  await card.getByRole('button', { name: 'Verifikasi' }).click();
  await expect(admin).toHaveURL(/notice=organizer_reviewed/);

  await student.goto('/penyelenggara');
  await expect(student.getByRole('heading', { level: 1, name: orgName })).toBeVisible();
  await expect(student.getByText('Terverifikasi', { exact: true })).toBeVisible();
  await studentContext.close();
  await adminContext.close();
});

test('penyelenggara: analitik, lalu perubahan acara baru tayang setelah diterapkan admin', async ({ browser }) => {
  const orgContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const org = await orgContext.newPage();
  const admin = await adminContext.newPage();

  await signInAsDemo(org, 'Penyelenggara', '/penyelenggara');
  // Kartu acara menautkan ruang kerja dua kali (judul + tab Ringkasan).
  await org.locator(`a[href="${MANAGED}"]`).first().click();
  await expect(org.getByRole('img', { name: /Grafik kunjungan harian, 30 hari/ })).toBeVisible();
  await org.getByRole('link', { name: '7 hari' }).click();
  await expect(org.getByRole('img', { name: /Grafik kunjungan harian, 7 hari/ })).toBeVisible();

  const description = `Deskripsi uji e2e ${Date.now()}`;
  await org.getByText('Ajukan perubahan').click();
  await org.getByLabel('Deskripsi').fill(description);
  await org.getByRole('button', { name: 'Kirim ke moderator' }).click();
  await expect(org).toHaveURL(/notice=revision_submitted/);

  // Belum tampil di halaman publik sebelum moderator menerapkannya.
  const publicHref = await org.getByRole('link', { name: /^Halaman publik/ }).getAttribute('href');
  await org.goto(publicHref!);
  await expect(org.getByText(description)).toHaveCount(0);
  await expect(org.getByRole('img', { name: 'Penyelenggara terverifikasi' }).first()).toBeVisible();

  await signInAsDemo(admin, 'Admin moderator', '/admin/penyelenggara?tab=perubahan');
  await admin.getByRole('listitem').filter({ hasText: description }).getByRole('button', { name: /Terapkan perubahan/ }).click();
  await expect(admin).toHaveURL(/notice=revision_reviewed/);

  await org.reload();
  await expect(org.getByText(description)).toBeVisible();
  await orgContext.close();
  await adminContext.close();
});

test('penyelenggara: susun formulir, periksa bukti bayar, unduh CSV pendaftar', async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama — cukup satu proyek');
  await signInAsDemo(page, 'Penyelenggara', '/penyelenggara');

  // Penanda di kartu studio langsung membuka antrean bukti acara berbayar.
  await page
    .locator('section[aria-labelledby="acara-saya"] li')
    .filter({ hasText: 'Workshop Riset Kualitatif' })
    .getByRole('link', { name: /bukti bayar perlu dicek/ })
    .click();
  await expect(page).toHaveURL(/\/pendaftar\?status=diperiksa/);
  const rows = page.locator('li[id^="pendaftar-"]');
  const first = rows.first();
  await first.locator('summary').first().click();
  const proof = first.getByRole('img', { name: /^Bukti pembayaran/ });
  await expect(proof).toBeVisible();
  const proofSrc = (await proof.getAttribute('src'))!;
  await first.getByRole('button', { name: 'Konfirmasi pembayaran' }).click();
  await expect(page).toHaveURL(/notice=registration_reviewed/);

  // Menolak bukti wajib beralasan; peserta kembali "Menunggu pembayaran".
  const second = rows.first();
  await second.locator('summary').first().click();
  await second.locator('summary', { hasText: 'Tolak bukti' }).click();
  await expect(second.getByRole('textbox', { name: 'Alasan untuk peserta (wajib)' }).first()).toHaveAttribute('required', '');
  await second.getByRole('textbox', { name: 'Alasan untuk peserta (wajib)' }).first().fill('Nominal transfer kurang Rp 5.000.');
  await second.getByRole('button', { name: 'Tolak bukti' }).click();
  await expect(page).toHaveURL(/notice=registration_reviewed/);

  const exportHref = page.url().replace(/\/pendaftar.*$/, '/pendaftar/ekspor');
  const csv = await page.request.get(exportHref);
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(csv.headers()['content-disposition']).toMatch(/^attachment; filename="pendaftar-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.csv"$/);
  expect(await csv.text()).toContain('"Kode","Nama","Email akun"');
  expect((await page.request.get(proofSrc)).status()).toBe(200);

  // Tamu: bukti & ekspor sama-sama 404, tidak membocorkan keberadaannya.
  const guest = await browser.newContext();
  expect((await guest.request.get(new URL(proofSrc, page.url()).href)).status()).toBe(404);
  expect((await guest.request.get(exportHref)).status()).toBe(404);
  await guest.close();

  // Formulir: pertanyaan tanpa judul ditahan di klien, lalu tersimpan.
  await page.goto(`${MANAGED}/formulir`);
  await page.getByRole('button', { name: 'Tambah pertanyaan' }).click();
  await page.getByRole('button', { name: 'Pilihan ganda', exact: true }).click();
  await page.getByRole('button', { name: 'Simpan formulir' }).click();
  await expect(page.getByText('Tulis pertanyaannya.')).toBeVisible();
  const label = `Ukuran kaos ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Pertanyaan', exact: true }).fill(label);
  await page.getByRole('textbox', { name: 'Pilihan 1' }).fill('S');
  await page.getByRole('textbox', { name: 'Pilihan 2' }).fill('M');
  await page.getByRole('button', { name: 'Simpan formulir' }).click();
  await expect(page).toHaveURL(/notice=registration_form_saved/);
  await expect(page.getByRole('button', { name: new RegExp(`^Pertanyaan \\d+: ${label}`) })).toBeVisible();
});
