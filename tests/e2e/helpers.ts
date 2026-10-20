import { expect, type Page } from '@playwright/test';
import { demoReceiptPng } from '../../src/lib/data/demo-media';
import { DEMO_ADMIN_TEST_KEY } from './demo-keys';

export type PersonaLabel = 'Mahasiswa' | 'Siswa baru' | 'Admin moderator' | 'Penyelenggara';

/**
 * Masuk lewat kartu persona demo di /demo, persis seperti pengunjung sungguhan.
 * Persona Admin hanya muncul di tautan berkunci (ADR-057), jadi tesnya membawa kunci.
 */
export async function signInAsDemo(page: Page, persona: PersonaLabel, next = '/'): Promise<void> {
  const key = persona === 'Admin moderator' ? `&akses=${DEMO_ADMIN_TEST_KEY}` : '';
  await page.goto(`/demo?next=${encodeURIComponent(next)}${key}`);
  await page.getByRole('button', { name: new RegExp(`^Masuk sebagai ${persona}:`) }).click();
  await expect(page).toHaveURL(new RegExp(`${next === '/' ? '/$' : next.replace(/[/?]/g, '\\$&')}`));
  // Setelah redirect Server Action, Next menavigasi di klien dan <title>
  // di-stream sesaat SETELAH URL berubah — tunggu sampai terpasang supaya
  // audit tidak memotret halaman di tengah transisi.
  await expect(page).toHaveTitle(/\S/);
}

/** Acara berbayar contoh dengan formulir internal (seed, ADR-056). */
export const PAID_DEMO_EVENT = {
  path: '/events/workshop-riset-kualitatif-untuk-mahasiswa-tingkat-akhir',
  id: 'e1000000-0000-4000-8000-000000000004',
} as const;

/**
 * Akun Mahasiswa BARU (tiap masuk demo = uid baru) mendaftar ke acara berbayar
 * contoh. Data contoh dipakai bersama semua tes yang berjalan paralel, jadi tes
 * yang butuh "bukti bayar menunggu" menyiapkannya sendiri alih-alih berharap
 * baris contoh belum diproses tes lain. Mengembalikan id pendaftaran.
 */
export async function registerForPaidDemoEvent(page: Page): Promise<string> {
  await signInAsDemo(page, 'Mahasiswa', PAID_DEMO_EVENT.path);
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

/** Di halaman /pembayaran/[id]: unggah struk contoh → status "Pembayaran diperiksa". */
export async function uploadDemoPaymentProof(page: Page): Promise<void> {
  await page.locator('input[type=file][name=proof]').setInputFiles({
    name: 'bukti.png',
    mimeType: 'image/png',
    buffer: Buffer.from(demoReceiptPng()),
  });
  await page.getByRole('button', { name: 'Kirim bukti pembayaran' }).click();
  await expect(page).toHaveURL(/notice=payment_submitted/);
  await expect(page.getByText('Pembayaran diperiksa').first()).toBeVisible();
}
