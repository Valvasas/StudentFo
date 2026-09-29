import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Konfirmasi hasil oleh penyelenggara (ADR-047) di browser sungguhan, dua
 * sesi sekaligus. Setiap login demo = pengguna baru, tetapi SEMUA sesi
 * penyelenggara mengelola acara yang sama — jadi permintaan dari uji ini
 * ditandai catatan unik dan hanya baris itu yang diputuskan.
 */
const PAST_LOMBA = '/tracker/lomba-desain-ui-ux-nasional-edisi-lalu';
const DEMO_ORG = 'Himpunan Mahasiswa Informatika (contoh)';

async function saveNote(page: Page, note: string): Promise<void> {
  await page.getByLabel(/Catatan hasil/).fill(note);
  await page.getByRole('button', { name: 'Simpan portofolio' }).click();
  await expect(page.getByText('Portofolio diperbarui.')).toBeVisible();
}

function requestRow(page: Page, note: string) {
  return page.locator('section[aria-labelledby="verifikasi-hasil"] li').filter({ hasText: note });
}

test('minta → penyelenggara mengonfirmasi → tanda terverifikasi; lonceng menuju panelnya; ubah isi = gugur', async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name === 'gelap', 'alur data sama dengan terang; tampilan gelap dicakup axe');
  const note = `Uji ${randomUUID().slice(0, 8)}`;
  // Penyelenggara sudah ada SEBELUM permintaan dikirim — notifikasi hanya
  // untuk pengelola yang ada saat itu. '/' akan dialihkan ke studio, jadi
  // mulai dari halaman lain supaya lonceng yang membawa ke sana.
  const orgContext = await browser.newContext();
  const org = await orgContext.newPage();
  await signInAsDemo(org, 'Penyelenggara', '/events');

  await signInAsDemo(page, 'Mahasiswa', PAST_LOMBA);
  await saveNote(page, note);
  const panel = page.locator('section[aria-labelledby="portofolio-title"]');
  await panel.getByRole('button', { name: 'Minta konfirmasi' }).click();
  await expect(page.getByText('Permintaan terkirim ke penyelenggara.')).toBeVisible();
  await expect(panel.getByText(/Menunggu konfirmasi/)).toBeVisible();
  await expect(panel.getByText(/membatalkan permintaan konfirmasi/)).toBeVisible();

  await org.reload();
  await org.locator('summary[aria-label^="Notifikasi"]').click();
  await org.getByRole('button', { name: /Ada permintaan konfirmasi hasil untuk "Lomba Desain UI\/UX Nasional"/ }).click();
  await expect(org).toHaveURL(/\/penyelenggara\?fokus=verifikasi/);
  await expect(org.locator('#verifikasi-hasil')).toBeFocused();
  const row = requestRow(org, note);
  await expect(row.getByText('Juara 3')).toBeVisible();
  await row.getByRole('button', { name: /^Konfirmasi/ }).click();
  await expect(org.getByText('Hasil dikonfirmasi.')).toBeVisible();
  await expect(requestRow(org, note)).toHaveCount(0);
  await orgContext.close();

  await page.goto('/');
  await page.locator('summary[aria-label^="Notifikasi"]').click();
  await page.getByRole('button', { name: new RegExp(`${DEMO_ORG.replace(/[()]/g, '\\$&')} mengonfirmasi hasilmu`) }).click();
  await expect(page).toHaveURL(/\/tracker\/lomba-desain-ui-ux-nasional-edisi-lalu\?fokus=portofolio/);
  // Redirect Server Action membuang #fragmen — ScrollToSection yang membawa pengguna ke panelnya.
  await expect(page.locator('#portofolio-title')).toBeFocused();
  await expect(page.locator('#portofolio-title')).toBeInViewport();
  await expect(panel.getByText(`Dikonfirmasi ${DEMO_ORG}`)).toBeVisible();

  await page.goto('/profile?tampilan=publik&tab=portofolio');
  await expect(page.getByText(`Dikonfirmasi ${DEMO_ORG}`)).toBeVisible();

  await page.goto(PAST_LOMBA);
  await saveNote(page, `${note} (diubah)`);
  await expect(panel.getByRole('button', { name: 'Minta konfirmasi' })).toBeVisible();
});

test('penyelenggara menyatakan tidak sesuai dengan alasan → peserta melihat alasannya & tidak bisa langsung minta ulang', async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'alur data; satu proyek cukup');
  const note = `Uji ${randomUUID().slice(0, 8)}`;
  await signInAsDemo(page, 'Mahasiswa', PAST_LOMBA);
  await saveNote(page, note);
  await page.getByRole('button', { name: 'Minta konfirmasi' }).click();
  await expect(page.getByText('Permintaan terkirim ke penyelenggara.')).toBeVisible();

  const orgContext = await browser.newContext();
  const org = await orgContext.newPage();
  await signInAsDemo(org, 'Penyelenggara', '/penyelenggara');
  const row = requestRow(org, note);
  await row.locator('summary').click();
  await row.getByLabel(/Alasan untuk/).fill('Juara 3 kategori ini atas nama tim lain.');
  await row.getByRole('button', { name: 'Kirim: tidak sesuai' }).click();
  await expect(org.getByText('Ditandai belum sesuai.')).toBeVisible();
  await orgContext.close();

  await page.goto(PAST_LOMBA);
  const panel = page.locator('section[aria-labelledby="portofolio-title"]');
  await expect(panel.getByText('“Juara 3 kategori ini atas nama tim lain.”')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Minta konfirmasi' })).toHaveCount(0);
  await expect(page.locator('section[aria-labelledby="todo-title"]').getByText('Hasil belum sesuai menurut penyelenggara')).toBeVisible();
});

test('kegiatan yang sudah tutup: "Saya ikut kegiatan ini" langsung mengisi portofolio', async ({ page }) => {
  await signInAsDemo(page, 'Siswa baru', '/events/workshop-riset-pengguna-angkatan-3');
  await expect(page.getByRole('button', { name: 'Simpan ke Tracker' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Saya ikut kegiatan ini' }).first().click();
  await expect(page).toHaveURL(/\/tracker\/workshop-riset-pengguna-angkatan-3\?notice=portfolio_added/);
  await expect(page.getByText('Masuk portofoliomu.')).toBeVisible();
  await expect(page.getByText('Setelah disimpan, kamu bisa meminta Studio Rupa Kolektif mengonfirmasinya.')).toBeVisible();

  await page.goto('/events/workshop-riset-pengguna-angkatan-3');
  await expect(page.getByRole('link', { name: 'Ada di portofoliomu' }).first()).toBeVisible();
});

test('tamu yang menekan "Saya ikut kegiatan ini" diminta masuk dulu', async ({ page }) => {
  await page.goto('/events/workshop-riset-pengguna-angkatan-3');
  await page.getByRole('button', { name: 'Saya ikut kegiatan ini' }).first().click();
  await expect(page).toHaveURL(/\/login\?next=%2Fevents%2Fworkshop-riset-pengguna-angkatan-3/);
});
