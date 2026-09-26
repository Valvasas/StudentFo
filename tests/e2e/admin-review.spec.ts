import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Admin wajib bisa membandingkan hasil ekstraksi LLM dengan sumber aslinya
 * tanpa meninggalkan antrean. Kartu tanpa tautan sumber = persetujuan buta.
 */
test('setiap kartu antrean moderasi menampilkan domain & tautan sumber serta tautan pendaftaran', async ({ page }) => {
  await signInAsDemo(page, 'Admin moderator', '/admin');
  const cards = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /Setujui/ }) });
  await expect(cards.first()).toBeVisible();

  const eventCards = cards.filter({ hasNot: page.getByText(/^Dikirim /) });
  const count = await eventCards.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const card = eventCards.nth(i);
    const source = card.getByRole('link', { name: /^Sumber asli/ });
    await expect(source).toHaveAttribute('href', /^https?:\/\//);
    await expect(source).toHaveAttribute('target', '_blank');
    await expect(source).toHaveAttribute('rel', /noopener/);
    await expect(card.getByRole('link', { name: /^Tautan pendaftaran/ })).toHaveAttribute('href', /^https?:\/\//);
  }
});

test('keputusan moderasi tercatat di riwayat dengan nama admin', async ({ browser }) => {
  // Kiriman milik test ini sendiri, bukan kegiatan PENDING bawaan seed: data
  // demo dibagi semua proyek & run, dan seed hanya punya dua kegiatan PENDING.
  const title = `Lomba Riwayat Uji ${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const octet = () => Math.floor(Math.random() * 250) + 1;
  const guest = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` } });
  const form = await guest.newPage();
  await form.goto('/submit');
  await form.getByLabel('Judul kegiatan').fill(title);
  await form.getByLabel('Penyelenggara').fill('Penyelenggara Riwayat');
  await form.getByLabel('Jenis kegiatan').selectOption('LOMBA');
  await form.getByLabel('Tautan pendaftaran').fill('https://contoh.example/riwayat');
  await form.getByLabel('Tenggat pendaftaran').fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
  await form.locator('input[name="educationLevels"]').first().check();
  await form.locator('input[name="categorySlugs"]').first().check();
  await form.getByLabel('Email kamu').fill(`riwayat.${Date.now()}@contoh.example`);
  await form.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
  await expect(form).toHaveURL(/notice=submission_received/);
  await guest.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAsDemo(page, 'Admin moderator', '/admin');
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) });
  await card.getByRole('button', { name: 'Tolak' }).click();
  await expect(card).toHaveCount(0);

  await page.getByRole('link', { name: 'Riwayat moderasi' }).click();
  await expect(page).toHaveURL(/\/admin\/riwayat$/);
  const entry = page.getByRole('listitem').filter({ hasText: title }).first();
  await expect(entry).toContainText('Ditolak');
  await expect(entry).toContainText('Admin Moderator');
  await context.close();
});

test('riwayat moderasi tertutup untuk non-admin', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa');
  await page.goto('/admin/riwayat');
  await expect(page.getByRole('heading', { name: 'Akses terbatas' })).toBeVisible();
});
