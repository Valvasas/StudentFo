import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * "Buat acara StudentFo" (ADR-093): admin membuat lomba internal dari satu
 * halaman → mendarat di penyusun formulir (templat, tertutup) → membuka
 * pendaftaran → peserta bisa mendaftar lewat formulir StudentFo.
 */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test('admin membuat lomba internal, membuka formulirnya, peserta bisa mendaftar', async ({ browser }) => {
  const title = `Lomba Esai StudentFo Uji ${Date.now()}`;
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsDemo(admin, 'Admin moderator', '/admin');

  // Titik masuk dari antrean (pintu yang dilihat admin pertama kali).
  await admin.getByRole('link', { name: 'Buat acara StudentFo' }).first().click();
  await expect(admin.getByRole('heading', { name: 'Buat acara StudentFo', level: 1 })).toBeVisible();

  await admin.getByLabel('Judul acara').fill(title);
  await admin.getByLabel('Deskripsi').fill('Lomba esai internal untuk pelajar.');
  await admin.getByLabel('Tenggat pendaftaran').fill(inDays(20));
  await admin.getByRole('checkbox', { name: 'SMA/SMK' }).check();
  await admin.getByRole('button', { name: 'Buat acara' }).click();

  await expect(admin).toHaveURL(/\/penyelenggara\/acara\/[^/]+\/formulir\?notice=internal_event_created/);
  await expect(admin.getByText(/Formulirnya sudah disiapkan dari templat/)).toBeVisible();
  // Templat bawaan lomba = lomba tim, dan formulirnya TERTUTUP sampai dibuka admin.
  await expect(admin.getByText('Nama tim').first()).toBeVisible();
  const toggle = admin.getByRole('switch');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await admin.getByRole('button', { name: 'Simpan formulir' }).click();
  // Tunggu jawaban server, bukan keadaan sakelar di klien (sudah tercentang sebelum terkirim).
  await expect(admin).toHaveURL(/notice=registration_form_saved/);
  await expect(admin.getByRole('switch')).toBeChecked();
  await adminContext.close();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInAsDemo(student, 'Mahasiswa', '/events');
  await student.goto(`/events?q=${encodeURIComponent(title)}`);
  const href = await student.locator('a[href^="/events/"]', { hasText: title }).first().getAttribute('href');
  expect(href).toMatch(/^\/events\/[^/?]+$/);
  await student.goto(href!);
  await expect(student.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  // Lomba mandiri yang dibuka: pendaftaran lewat formulir StudentFo, tidak pernah ke tautan luar.
  await expect(student.locator(`a[href^="${href}/"][href*="formulir"], a[href^="${href}/daftar"]`).filter({ visible: true }).first()).toBeVisible();
  await expect(student.locator('a[href^="https://"]').filter({ hasText: /^Daftar/ })).toHaveCount(0);
  await studentContext.close();
});

test('berbayar tanpa cara pembayaran ditolak tanpa kehilangan isian; tautan luar muncul saat dipilih', async ({ page }) => {
  await signInAsDemo(page, 'Admin moderator', '/admin/acara/baru');
  const title = `Lomba Berbayar Uji ${Date.now()}`;
  await page.getByLabel('Judul acara').fill(title);
  await page.getByLabel('Tenggat pendaftaran').fill(inDays(15));
  await page.getByRole('checkbox', { name: 'SMA/SMK' }).check();
  await page.getByRole('radio', { name: 'Berbayar' }).check();
  await page.getByLabel('Nominal (jika berbayar)').fill('50000');
  await page.getByRole('button', { name: 'Buat acara' }).click();
  await expect(page).toHaveURL(/error=payment_instructions_required/);
  await expect(page.getByText(/butuh cara pembayaran/)).toBeVisible();
  await expect(page.getByLabel('Judul acara')).toHaveValue(title);

  await expect(page.getByLabel('Tautan pendaftaran')).toBeHidden();
  await page.getByRole('radio', { name: /Tautan luar/ }).check();
  await expect(page.getByLabel('Tautan pendaftaran')).toBeVisible();
});

test('bukan admin tidak bisa membuka halaman Buat acara', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/');
  const response = await page.goto('/admin/acara/baru');
  expect(response?.status()).toBe(404);
});

test('axe: halaman Buat acara StudentFo', async ({ page }) => {
  await signInAsDemo(page, 'Admin moderator', '/admin/acara/baru');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
});
