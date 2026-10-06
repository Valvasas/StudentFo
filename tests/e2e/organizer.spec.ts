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
  // Acara berformulir pendaftaran langsung membuka Performa pendaftaran dulu (ADR-055); analitik halaman satu tab di sebelahnya.
  await org.locator(`a[href^="${MANAGED}"]`).first().click();
  await org.getByRole('navigation', { name: 'Studio acara' }).getByRole('link', { name: 'Analitik halaman' }).click();
  await expect(org.getByRole('img', { name: /Grafik kunjungan harian, 30 hari/ })).toBeVisible();
  await org.getByRole('link', { name: '7 hari' }).click();
  await expect(org.getByRole('img', { name: /Grafik kunjungan harian, 7 hari/ })).toBeVisible();

  const description = `Deskripsi uji e2e ${Date.now()}`;
  await org.getByText('Ajukan perubahan').click();
  await org.getByLabel('Deskripsi').fill(description);
  await org.getByRole('button', { name: 'Kirim ke moderator' }).click();
  await expect(org).toHaveURL(/notice=revision_submitted/);

  // Belum tampil di halaman publik sebelum moderator menerapkannya.
  const publicHref = await org.getByRole('link', { name: /Lihat halaman publik/ }).getAttribute('href');
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
