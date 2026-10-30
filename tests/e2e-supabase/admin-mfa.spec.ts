import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { sql } from '../integration/harness';
import { totp } from '../integration/totp';

/**
 * MFA admin lewat UI ASLI dengan GoTrue sungguhan (ADR-062 #4): masuk dengan
 * sandi → panel menolak → pasang TOTP dari halaman → panel terbuka; perangkat
 * lain → diminta kode. Hanya jalan di mode WITH_SUPABASE_SERVICES=1 — stack
 * uji biasa tidak punya endpoint MFA.
 */
test.skip(!process.env.GOTRUE_URL, 'butuh GoTrue sungguhan (WITH_SUPABASE_SERVICES=1)');

const password = 'rahasia-kuat-123';

async function signInWithPassword(page: Page, email: string): Promise<void> {
  await page.goto('/login?next=%2Fadmin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
}

test('admin: sandi saja tidak membuka panel; pasang TOTP → panel terbuka; perangkat lain diminta kode', async ({ browser }) => {
  const email = `admin-ui-${randomUUID()}@uji.example`;
  const response = await fetch(`${process.env.GOTRUE_URL}/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    body: JSON.stringify({ email, password, data: { full_name: 'Admin MFA' } }),
  });
  const userId = ((await response.json()) as { user: { id: string } }).user.id;
  sql(`UPDATE public.users SET role = 'ADMIN' WHERE id = '${userId}'`);

  const first = await (await browser.newContext()).newPage();
  await signInWithPassword(first, email);
  await expect(first).toHaveURL(/\/admin\/mfa$/);
  await expect(first.getByRole('heading', { level: 1, name: 'Verifikasi dua langkah' })).toBeVisible();

  await first.getByRole('button', { name: 'Tampilkan kode QR' }).click();
  await expect(first.getByRole('img', { name: /Kode QR untuk aplikasi autentikator/ })).toBeVisible();
  const secret = (await first.locator('code').first().innerText()).replace(/\s/g, '');

  // Salah ketik: tetap di faktor yang sama (QR tidak perlu dipindai ulang).
  await first.getByLabel('Kode 6 digit').fill('000000' === totp(secret) ? '111111' : '000000');
  await first.getByRole('button', { name: 'Aktifkan' }).click();
  await expect(first).toHaveURL(/error=mfa_invalid_code&faktor=/);
  await expect(first.getByText(/Kode tidak cocok/)).toBeVisible();
  await expect(first.getByText(/Kode QR yang sudah kamu pindai tetap berlaku/)).toBeVisible();

  await first.getByLabel('Kode 6 digit').fill(totp(secret));
  await first.getByRole('button', { name: 'Aktifkan' }).click();
  await expect(first).toHaveURL(/\/admin\?notice=mfa_enabled$/);
  await expect(first.getByRole('heading', { name: 'Antrean moderasi' })).toBeVisible();
  await expect(first.getByText(/Verifikasi dua langkah aktif/)).toBeVisible();

  const second = await (await browser.newContext()).newPage();
  await signInWithPassword(second, email);
  await expect(second).toHaveURL(/\/admin\/mfa$/);
  await second.goto('/admin/laporan');
  await expect(second).toHaveURL(/\/admin\/mfa$/);
  // Langkah waktu berikutnya: GoTrue boleh menolak kode yang sama dipakai dua kali.
  await second.getByLabel('Kode 6 digit').fill(totp(secret, Date.now() + 30_000));
  await second.getByRole('button', { name: 'Verifikasi' }).click();
  await expect(second).toHaveURL(/\/admin\?notice=mfa_verified$/);
  await expect(second.getByRole('heading', { name: 'Antrean moderasi' })).toBeVisible();
});
