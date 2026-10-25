import { expect, test, type Browser } from '@playwright/test';
import { nextStep, signInAsDemo } from './helpers';

/**
 * Form panjang per kartu (StepFlow, ADR-061). Tes alur di form lain cukup
 * memakai `nextStep`; di sini perilaku khas wizard-nya sendiri: ditahan per
 * kartu, Enter = Lanjut, kembali tanpa kehilangan isian, kiriman yang ditolak
 * server dibuka di kartu kolomnya, dan tanpa JS tetap satu form utuh.
 */
const future = () => new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const FREE_FORM = '/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026/formulir';

/** IP acak per tes: batas laju /submit per IP dibagi semua tes yang mengirim. */
async function guestPage(browser: Browser) {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` } });
  return { context, page: await context.newPage() };
}

test('kirim kegiatan: kolom wajib menahan kartu, Enter = Lanjut, Kembali tidak menghapus isian', async ({ page }) => {
  await page.goto('/submit');
  await expect(page.getByText('Langkah 1 dari 4')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kirim untuk diverifikasi' })).toHaveCount(0);

  await nextStep(page);
  // Ditahan di kartu pertama; fokus dibawa ke kolom wajib pertama yang kosong.
  await expect(page.getByText('Langkah 1 dari 4')).toBeVisible();
  await expect(page.getByLabel('Judul kegiatan')).toBeFocused();

  await page.getByLabel('Judul kegiatan').fill('Lomba Uji Langkah');
  await page.getByLabel('Penyelenggara').fill('Penyelenggara Uji');
  await page.getByLabel('Jenis kegiatan').selectOption('LOMBA');
  await page.getByLabel('Tautan pendaftaran').fill('https://contoh.example/langkah');
  // Enter di kartu tengah berarti "Lanjut", bukan mengirim form setengah jadi.
  await page.getByLabel('Tautan pendaftaran').press('Enter');
  await expect(page.getByText('Langkah 2 dari 4')).toBeVisible();
  await expect(page).toHaveURL(/\/submit$/);
  await expect(page.getByRole('heading', { name: /Waktu & tempat/ })).toBeFocused();

  await page.getByRole('button', { name: 'Kembali' }).click();
  await expect(page.getByLabel('Judul kegiatan')).toHaveValue('Lomba Uji Langkah');
  // Penunjuk langkah: kartu yang sudah dibuka bisa dituju lagi, yang belum tidak.
  await expect(page.getByRole('button', { name: /^Langkah 2: Waktu & tempat/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Langkah 4: Kirim/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Langkah 2: Waktu & tempat/ }).click();
  await expect(page.getByLabel('Tenggat pendaftaran')).toBeVisible();
});

test('kiriman yang ditolak server dibuka di kartu kolomnya dengan isian dipulihkan', async ({ browser }) => {
  const { context, page } = await guestPage(browser);
  const title = `Lomba Uji Draf ${Date.now()}`;
  await page.goto('/submit');
  await page.getByLabel('Judul kegiatan').fill(title);
  await page.getByLabel('Penyelenggara').fill('Penyelenggara Draf');
  await page.getByLabel('Jenis kegiatan').selectOption('LOMBA');
  await page.getByLabel('Tautan pendaftaran').fill('https://contoh.example/draf');
  await nextStep(page);
  await page.getByLabel('Tenggat pendaftaran').fill(future());
  await nextStep(page);
  // Jenjang wajib minimal satu (server menolaknya) — ditahan di kartunya, bukan setelah kirim.
  await nextStep(page);
  await expect(page.getByText('Langkah 3 dari 4')).toBeVisible();
  await expect(page.locator('input[name="educationLevels"]').first()).toBeFocused();
  await page.locator('input[name="educationLevels"]').first().check();
  await nextStep(page);
  await page.getByLabel('Email kamu').fill(`draf.${Date.now()}@contoh.example`);
  // Kolom ini sengaja bukan type="url" (lihat page.tsx), jadi hanya server yang menolaknya.
  await page.getByText('Detail tambahan (opsional)').click();
  await page.getByLabel(/Buku panduan/).fill('bukan-tautan');
  await page.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();

  await expect(page).toHaveURL(/error=invalid_submission&fields=guidebookUrl/);
  await expect(page.getByText('Langkah 4 dari 4')).toBeVisible();
  await expect(page.getByText('Isianmu kami kembalikan')).toBeVisible();
  await expect(page.getByLabel(/Buku panduan/)).toHaveValue('bukan-tautan');
  await expect(page.getByLabel('Judul kegiatan')).toHaveValue(title);
  await expect(page.getByLabel('Tenggat pendaftaran')).toHaveValue(future());
  await expect(page.locator('input[name="educationLevels"]').first()).toBeChecked();

  await page.getByLabel(/Buku panduan/).fill('https://contoh.example/panduan.pdf');
  await page.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
  await expect(page).toHaveURL(/notice=submission_received/);
  // Form kosong lagi untuk kiriman berikutnya, dan isian tidak menginap di tab.
  await expect(page.getByText('Langkah 1 dari 4')).toBeVisible();
  await expect(page.getByLabel('Judul kegiatan')).toHaveValue('');
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('sf-form-draft')))).toEqual([]);
  await context.close();
});

test('formulir pendaftaran panjang dipecah per tiga pertanyaan', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', FREE_FORM);
  await expect(page.getByText('Langkah 1 dari 2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data akun' })).toBeVisible();
  await page.getByLabel(/Nomor WhatsApp/).fill('081234567890');
  await page.getByLabel('Asal kampus').fill('Universitas Contoh');
  await page.getByLabel('Nama tim').fill('Tim Kartu');
  await nextStep(page);
  await expect(page.getByText('Langkah 2 dari 2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data akun' })).toBeHidden();
  await page.getByRole('radio', { name: '4 orang' }).check();
  await page.getByRole('checkbox', { name: /buku panduan/ }).check();
  await page.getByRole('checkbox', { name: /Data di formulir ini dibagikan/ }).check();
  await page.getByRole('button', { name: 'Kirim pendaftaran' }).click();
  await expect(page).toHaveURL(/\/pembayaran\/[0-9a-f-]{36}/);
});

test.describe('tanpa JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('kirim kegiatan tetap satu form utuh: semua kartu dan tombol kirim tampil', async ({ page }) => {
    await page.goto('/submit');
    await expect(page.getByText('4 langkah')).toBeVisible();
    for (const name of ['Tentang kegiatan', 'Waktu & tempat', 'Siapa yang bisa ikut', 'Kirim untuk dicek']) {
      await expect(page.getByRole('heading', { name: new RegExp(name) })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /^Lanjut/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kirim untuk diverifikasi' })).toBeVisible();
  });
});
