import { expect, test } from '@playwright/test';

/**
 * Cuplikan beranda (ADR-065, dirampingkan ADR-081): hanya "video"-nya —
 * tanpa judul, daftar langkah, atau keterangan. Konfigurasi uji memakai
 * `reducedMotion: 'reduce'`, jadi yang dikunci di sini jalur aksesibelnya:
 * cuplikan TIDAK berjalan sendiri, tombol putar maju satu adegan, dan tiap
 * ruas bilah melompat ke adegannya.
 */
test('cuplikan beranda: hanya video + kendali pemutar, tidak berjalan sendiri saat gerak dikurangi', async ({ page }) => {
  await page.goto('/');
  const clip = page.locator('#cara-kerja');
  await clip.scrollIntoViewIfNeeded();

  const scenes = clip.getByRole('group', { name: 'Adegan cuplikan' }).getByRole('button');
  await expect(scenes).toHaveCount(5);
  await expect(scenes.first()).toHaveAttribute('aria-current', 'true');

  // Tidak ada judul, daftar langkah, atau label "contoh" di sekitar video.
  await expect(clip.getByRole('heading')).toHaveCount(0);
  await expect(clip.getByRole('tab')).toHaveCount(0);
  await expect(clip).not.toContainText(/Cara kerja StudentFo|Lima langkah|Contoh tampilan|Cek sumbernya/);

  // Gerak dikurangi → tidak ada autoplay; tombolnya "Putar cuplikan" dan memajukan satu adegan.
  await page.waitForTimeout(6500);
  await expect(scenes.first()).toHaveAttribute('aria-current', 'true');
  await clip.getByRole('button', { name: 'Putar cuplikan' }).click();
  await expect(scenes.nth(1)).toHaveAttribute('aria-current', 'true');

  // Ruas bilah = lompat ke adegan, bisa dipakai dari papan ketik.
  await scenes.nth(4).focus();
  await page.keyboard.press('Enter');
  await expect(scenes.nth(4)).toHaveAttribute('aria-current', 'true');
  await expect(scenes.nth(1)).not.toHaveAttribute('aria-current', 'true');
  await expect(scenes.nth(4)).toHaveAccessibleName(/Adegan 5 dari 5: pencocokan tim/);

  // Fitur khusus mode demo tidak diperagakan.
  await expect(clip).not.toContainText(/Ruang diskusi|Pesan/);
});

test('cuplikan beranda tanpa JavaScript: adegan pertama tampil, tanpa tombol mati', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  const clip = page.locator('#cara-kerja');
  await expect(clip.getByText('lomba desain', { exact: true })).toBeAttached();
  await expect(clip.getByRole('button')).toHaveCount(0);
  await context.close();
});
