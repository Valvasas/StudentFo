import { expect, test, type Page } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Waktu pelaksanaan (ADR-100): jadwal acara terpisah dari tenggat, tampil
 * sebagai fakta di halaman detail dan menjadi `startDate` data terstruktur
 * `Event` — tanpanya workshop/seminar tidak pernah bisa jadi rich result.
 */
const SCHEDULED = '/events/workshop-riset-kualitatif-untuk-mahasiswa-tingkat-akhir';
const ONLINE_WORKSHOP = 'workshop-analisis-data-dengan-python-untuk-pemula';

async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => {
    const parsed = JSON.parse(text) as { '@type'?: string } | { '@type'?: string }[];
    return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => item['@type'] ?? '');
  });
}

test('tamu: workshop berjadwal menampilkan waktu WIB dan data terstruktur Event', async ({ page }) => {
  await page.goto(SCHEDULED);
  await expect(page.getByText(/· 09\.00 WIB$|09\.00 – .* 16\.00 WIB/).first()).toBeVisible();
  expect(await jsonLdTypes(page)).toContain('Event');
});

test('admin memasang lalu menghapus waktu pelaksanaan; urutan terbalik ditolak dengan pesan', async ({ page }, testInfo) => {
  // Mengubah data bersama satu server: proyek paralel lain akan saling menimpa jadwalnya.
  test.skip(testInfo.project.name !== 'terang', 'mengubah data bersama — cukup satu proyek');
  await signInAsDemo(page, 'Admin moderator', `/admin/media/${ONLINE_WORKSHOP}`);
  const card = page.locator('section[aria-labelledby="waktu-pelaksanaan"]');

  await card.getByLabel('Mulai (WIB)').fill('2027-01-09T16:00');
  await card.getByLabel('Selesai (WIB)').fill('2027-01-09T09:00');
  await card.getByRole('button', { name: 'Simpan waktu' }).click();
  await expect(page.getByText(/tidak boleh sebelum waktu mulai/)).toBeVisible();

  await card.getByLabel('Mulai (WIB)').fill('2027-01-09T09:00');
  await card.getByLabel('Selesai (WIB)').fill('2027-01-09T12:30');
  await card.getByRole('button', { name: 'Simpan waktu' }).click();
  await expect(page.getByText('Waktu pelaksanaan disimpan')).toBeVisible();
  await expect(card.getByText('Sabtu, 9 Januari 2027 · 09.00–12.30 WIB')).toBeVisible();

  await page.goto(`/events/${ONLINE_WORKSHOP}`);
  await expect(page.getByText('Sabtu, 9 Januari 2027 · 09.00–12.30 WIB')).toBeVisible();
  expect(await jsonLdTypes(page)).toContain('Event');

  await page.goto(`/admin/media/${ONLINE_WORKSHOP}`);
  await page.locator('section[aria-labelledby="waktu-pelaksanaan"]').getByRole('button', { name: 'Hapus waktu' }).click();
  await expect(page.getByText('Waktu pelaksanaan dihapus')).toBeVisible();
  await page.goto(`/events/${ONLINE_WORKSHOP}`);
  await expect(page.getByText('Sabtu, 9 Januari 2027')).toHaveCount(0);
});
