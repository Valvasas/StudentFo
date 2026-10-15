import { expect, test, type Page } from '@playwright/test';
import { demoReceiptPng } from '../../src/lib/data/demo-media';
import { signInAsDemo } from './helpers';

/**
 * Formulir internal & pembayaran lintas peran (ADR-056), seperti dipakai
 * sungguhan: peserta mendaftar lewat formulir StudentFo → bayar & unggah
 * bukti → panitia memeriksa di studio → peserta melihat terkonfirmasi.
 * Bukti bayar privat: tamu & orang lain mendapat 404, bukan 403.
 */
const PAID_EVENT = '/events/workshop-riset-kualitatif-untuk-mahasiswa-tingkat-akhir';
const PAID_EVENT_ID = 'e1000000-0000-4000-8000-000000000004';

async function registerAsStudent(page: Page): Promise<string> {
  await signInAsDemo(page, 'Mahasiswa', PAID_EVENT);
  await page.getByRole('link', { name: /Daftar sekarang/ }).first().click();
  await expect(page).toHaveURL(/\/formulir$/);

  await page.getByLabel('Nomor WhatsApp').fill('081234567890');
  await page.getByLabel(/Asal kampus/).fill('Universitas Contoh');
  await page.getByRole('checkbox', { name: /Data di formulir ini dibagikan/ }).check();
  await page.getByRole('button', { name: /Daftar & lanjut ke pembayaran/ }).click();

  await expect(page).toHaveURL(/\/pembayaran\/[0-9a-f-]{36}\?notice=registration_awaiting_payment/);
  await expect(page.getByText('Menunggu pembayaran').first()).toBeVisible();
  return new URL(page.url()).pathname.split('/').pop()!;
}

test('peserta daftar → unggah bukti → panitia konfirmasi → peserta terkonfirmasi', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama — cukup satu proyek');
  const student = await (await browser.newContext()).newPage();
  const registrationId = await registerAsStudent(student);

  await student.locator('input[type=file][name=proof]').setInputFiles({
    name: 'bukti.png',
    mimeType: 'image/png',
    buffer: Buffer.from(demoReceiptPng()),
  });
  await student.getByRole('button', { name: 'Kirim bukti pembayaran' }).click();
  await expect(student).toHaveURL(/notice=payment_submitted/);
  await expect(student.getByText('Pembayaran diperiksa').first()).toBeVisible();
  expect((await student.request.get(`/media/bukti/${registrationId}`)).status()).toBe(200);

  const guest = await browser.newContext();
  expect((await guest.request.get(`/media/bukti/${registrationId}`)).status()).toBe(404);
  await guest.close();

  const organizer = await (await browser.newContext()).newPage();
  await signInAsDemo(organizer, 'Penyelenggara', `/penyelenggara/acara/${PAID_EVENT_ID}/pendaftar?status=diperiksa`);
  const row = organizer.locator(`#pendaftar-${registrationId}`);
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'Konfirmasi pembayaran' }).click();
  await expect(organizer).toHaveURL(/notice=registration_reviewed/);

  await student.reload();
  await expect(student.getByText('Terkonfirmasi').first()).toBeVisible();
  await student.goto('/pembayaran');
  await expect(student.getByRole('main')).toContainText('Workshop Riset Kualitatif');
});

test('jawaban ganda ditolak; pendaftaran yang sudah ada mengarah ke halaman statusnya', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama — cukup satu proyek');
  const registrationId = await registerAsStudent(page);

  await page.goto(`${PAID_EVENT}/formulir`);
  await expect(page).toHaveURL(new RegExp(`/pembayaran/${registrationId}`));
  await page.goto(PAID_EVENT);
  await expect(page.getByRole('link', { name: /Lihat pendaftaranmu/ }).first()).toHaveAttribute('href', `/pembayaran/${registrationId}`);
});

test('tamu yang membuka formulir diarahkan masuk dulu', async ({ page }) => {
  await page.goto(`${PAID_EVENT}/formulir`);
  await expect(page).toHaveURL(/\/login\?next=/);
});
