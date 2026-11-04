import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createUnsubscribeToken } from '../../src/lib/email/unsubscribe-token';
import { EMAIL_LINK_TEST_SECRET } from './demo-keys';
import { signInAsDemo } from './helpers';

/**
 * Pengingat tenggat lewat email (ADR-062 #6): persetujuan di Pengaturan,
 * halaman berhenti dari tautan email, dan rute pengirim yang gagal tertutup.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'alur, bukan tampilan; cukup satu proyek');
});

test('nyalakan → tercatat waktu persetujuan → matikan', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/profile/settings');
  const card = page.locator('#pengingat-email');
  await expect(card.getByText(/kamu setuju StudentFo mengirim email pengingat/)).toBeVisible();
  await card.getByRole('button', { name: 'Nyalakan pengingat email' }).click();
  await expect(page).toHaveURL(/notice=email_reminders_on/);
  await expect(page.getByText(/Pengingat email aktif/)).toBeVisible();
  await expect(card.getByText(/Aktif sejak/)).toBeVisible();

  await card.getByRole('button', { name: 'Matikan pengingat email' }).click();
  await expect(page).toHaveURL(/notice=email_reminders_off/);
  await expect(card.getByRole('button', { name: 'Nyalakan pengingat email' })).toBeVisible();
});

test('tautan berhenti: membuka saja tidak mengubah apa pun; tombol menghentikan; tautan palsu ditolak', async ({ page, request }) => {
  const token = createUnsubscribeToken(randomUUID(), EMAIL_LINK_TEST_SECRET);
  await page.goto(`/berhenti-email?token=${encodeURIComponent(token)}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Berhenti menerima pengingat email?' })).toBeVisible();
  await page.getByRole('button', { name: 'Ya, hentikan email pengingat' }).click();
  await expect(page).toHaveURL(/\/berhenti-email\?selesai=1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Pengingat email dihentikan' })).toBeVisible();

  await page.goto('/berhenti-email?token=bukan-token');
  await expect(page.getByText(/Tautan ini tidak valid/)).toBeVisible();
  await expect(page.getByRole('button', { name: /hentikan/ })).toHaveCount(0);

  // RFC 8058: POST satu klik dari aplikasi email; GET hanya mengalihkan ke halaman konfirmasi.
  const oneClick = await request.post(`/api/email/berhenti?token=${encodeURIComponent(token)}`, { form: { 'List-Unsubscribe': 'One-Click' } });
  expect(oneClick.status()).toBe(200);
  expect((await request.post('/api/email/berhenti?token=palsu')).status()).toBe(400);
  const get = await request.get(`/api/email/berhenti?token=${encodeURIComponent(token)}`, { maxRedirects: 0 });
  expect(get.status()).toBe(303);
});

test('rute pengirim gagal tertutup: tanpa CRON_SECRET ditolak, GET bukan cara mengirim', async ({ request }) => {
  const send = await request.post('/api/cron/send-deadline-emails', { headers: { Authorization: 'Bearer apa-saja' } });
  expect(send.status()).toBe(401);
  expect((await request.get('/api/cron/send-deadline-emails')).status()).toBe(405);
});
