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

test('keputusan moderasi tercatat di riwayat dengan nama admin', async ({ page }, testInfo) => {
  // Data demo dibagi semua proyek yang berjalan paralel dan hanya punya dua
  // kegiatan PENDING; menolaknya di tiap proyek menghabiskan antrean. Perilaku
  // moderasi tidak bergantung pada tema/viewport, jadi cukup satu proyek.
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  await signInAsDemo(page, 'Admin moderator', '/admin');
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: /^Sumber asli/ }) })
    .first();
  const title = (await card.getByRole('heading').textContent())?.trim();
  expect(title).toBeTruthy();
  await card.getByRole('button', { name: /Tolak/ }).click();
  await page.waitForLoadState('networkidle');

  await page.getByRole('link', { name: 'Riwayat moderasi' }).click();
  await expect(page).toHaveURL(/\/admin\/riwayat$/);
  const entry = page.getByRole('listitem').filter({ hasText: title! }).first();
  await expect(entry).toContainText('Ditolak');
  await expect(entry).toContainText('Admin Moderator');
});

test('riwayat moderasi tertutup untuk non-admin', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa');
  await page.goto('/admin/riwayat');
  await expect(page.getByRole('heading', { name: 'Akses terbatas' })).toBeVisible();
});
