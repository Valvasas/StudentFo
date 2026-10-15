import { expect, test } from '@playwright/test';
import { PAID_DEMO_EVENT, registerForPaidDemoEvent, signInAsDemo, uploadDemoPaymentProof } from './helpers';

/**
 * Formulir internal & pembayaran lintas peran (ADR-056), seperti dipakai
 * sungguhan: peserta mendaftar lewat formulir StudentFo → bayar & unggah
 * bukti → panitia memeriksa di studio → peserta melihat terkonfirmasi.
 * Bukti bayar privat: tamu & orang lain mendapat 404, bukan 403.
 */
const PAID_EVENT = PAID_DEMO_EVENT.path;
const PAID_EVENT_ID = PAID_DEMO_EVENT.id;

test('peserta daftar → unggah bukti → panitia konfirmasi → peserta terkonfirmasi', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama — cukup satu proyek');
  const student = await (await browser.newContext()).newPage();
  const registrationId = await registerForPaidDemoEvent(student);
  await uploadDemoPaymentProof(student);
  expect((await student.request.get(`/media/bukti/${registrationId}`)).status()).toBe(200);

  const guest = await browser.newContext();
  expect((await guest.request.get(`/media/bukti/${registrationId}`)).status()).toBe(404);
  await guest.close();

  const organizer = await (await browser.newContext()).newPage();
  await signInAsDemo(organizer, 'Penyelenggara', `/penyelenggara/acara/${PAID_EVENT_ID}/pendaftar?status=diperiksa`);
  const row = organizer.locator(`#pendaftar-${registrationId}`);
  // Baris pendaftar = <details>; di dalamnya ada <details> lain (tolak bukti, dst).
  await row.locator(':scope > summary').click();
  await row.getByRole('button', { name: 'Konfirmasi pembayaran' }).click();
  await expect(organizer).toHaveURL(/notice=registration_reviewed/);

  await student.reload();
  await expect(student.getByText('Terkonfirmasi').first()).toBeVisible();
  await student.goto('/pembayaran');
  await expect(student.getByRole('main')).toContainText('Workshop Riset Kualitatif');
});

test('jawaban ganda ditolak; pendaftaran yang sudah ada mengarah ke halaman statusnya', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama — cukup satu proyek');
  const registrationId = await registerForPaidDemoEvent(page);

  await page.goto(`${PAID_EVENT}/formulir`);
  await expect(page).toHaveURL(new RegExp(`/pembayaran/${registrationId}`));
  await page.goto(PAID_EVENT);
  await expect(page.getByRole('link', { name: /Lihat pendaftaranmu/ }).first()).toHaveAttribute('href', `/pembayaran/${registrationId}`);
});

test('tamu yang membuka formulir diarahkan masuk dulu', async ({ page }) => {
  await page.goto(`${PAID_EVENT}/formulir`);
  await expect(page).toHaveURL(/\/login\?next=/);
});
