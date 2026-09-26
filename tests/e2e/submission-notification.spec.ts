import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Alur penuh di browser: mahasiswa (masuk) mengirim kegiatan → admin demo
 * menyetujui → lonceng mahasiswa menampilkan kabar yang menaut ke halaman
 * kegiatannya. Satu proyek saja: data demo dibagi proyek yang berjalan paralel.
 */
test('pengirim yang masuk dikabari lewat lonceng saat kirimannya disetujui', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  const title = `Lomba Kabar Pengirim ${Date.now()}`;
  const octet = () => Math.floor(Math.random() * 250) + 1;

  const studentContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` } });
  const student = await studentContext.newPage();
  await signInAsDemo(student, 'Mahasiswa', '/submit');
  await expect(student.getByText('dikabarkan lewat lonceng notifikasi akunmu')).toBeVisible();
  await student.getByLabel('Judul kegiatan').fill(title);
  await student.getByLabel('Penyelenggara').fill('Penyelenggara Kabar');
  await student.getByLabel('Jenis kegiatan').selectOption('LOMBA');
  await student.getByLabel('Tautan pendaftaran').fill('https://contoh.example/kabar');
  await student.getByLabel('Tenggat pendaftaran').fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
  await student.locator('input[name="educationLevels"]').first().check();
  await student.locator('input[name="categorySlugs"]').first().check();
  await student.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
  await expect(student).toHaveURL(/notice=submission_received/);

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsDemo(admin, 'Admin moderator', '/admin');
  const card = admin.getByRole('listitem').filter({ has: admin.getByRole('heading', { name: title }) });
  await card.getByRole('button', { name: /Setujui/ }).click();
  await expect(card).toHaveCount(0);
  await adminContext.close();

  await student.goto('/');
  await student.locator('summary[aria-label*="otifikasi"]').click();
  const item = student.getByRole('button', { name: new RegExp(title) });
  await expect(item).toBeVisible();
  await item.click();
  await expect(student).toHaveURL(/\/events\/lomba-kabar-pengirim/);
  await expect(student.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await studentContext.close();
});

test('tamu diberi tahu bahwa ia tidak akan dikabari', async ({ page }) => {
  await page.goto('/submit');
  await expect(page.getByText('Masuk dulu kalau ingin dikabari')).toBeVisible();
});
