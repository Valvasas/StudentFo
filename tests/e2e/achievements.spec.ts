import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Prestasi terverifikasi, peringkat, portofolio publik, cari rekan tim
 * (ADR-098) di browser sungguhan, mode seed. Tiga proyek (terang, gelap,
 * ponsel) berbagi satu server: asersi tidak bergantung pada urutan atau skor
 * persis yang bisa berubah oleh tes paralel.
 */
const PAST_LOMBA = '/tracker/lomba-desain-ui-ux-nasional-edisi-lalu';
const OPEN_LOMBA = '/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026';

test('tamu: peringkat menampilkan rumus & kampus terverifikasi; portofolio opt-in terbuka, yang lain tidak', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Peringkat prestasi' })).toBeVisible();
  await expect(page.getByText(/Skor = 10 × Juara 1 \+ 8 × Juara 2/)).toBeVisible();
  await expect(page.getByText('Universitas Indonesia (UI)')).toBeVisible();

  await page.getByRole('link', { name: 'Pelajar & mahasiswa' }).click();
  await expect(page).toHaveURL(/\/leaderboard\?tab=mahasiswa$/);
  await page.getByRole('link', { name: 'Rizky Hidayat' }).click();
  await expect(page).toHaveURL(/\/u\/rizky\.hidayat$/);
  await expect(page.getByText('Portofolio publik', { exact: true })).toBeVisible();
  await expect(page.getByText('Terverifikasi moderator').first()).toBeVisible();
  // Muat langsung seperti crawler: sesaat setelah navigasi klien, meta halaman sebelumnya belum dicabut.
  await page.goto('/u/rizky.hidayat');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  // Tidak opt-in: tamu tetap dialihkan ke Masuk — URL tidak membocorkan ada/tidaknya akun.
  await page.goto('/u/rani.prameswari');
  await expect(page).toHaveURL(/\/login\?next=%2Fu%2Frani\.prameswari/);
});

test('saringan peringkat lewat form GET, tanpa JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/leaderboard');
  await page.getByLabel('Periode').selectOption('12-bulan');
  await page.getByRole('button', { name: 'Terapkan' }).click();
  await expect(page).toHaveURL(/periode=12-bulan/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/leaderboard$/);
  await context.close();
});

test('mahasiswa mengajukan verifikasi Juara 3 → menunggu → bisa dibatalkan', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', PAST_LOMBA);
  const panel = page.locator('#verifikasi-prestasi');
  await panel.getByRole('button', { name: 'Ajukan verifikasi Juara 3' }).click();
  await expect(page.getByText(/Pengajuan terkirim/)).toBeVisible();
  await expect(panel.getByText(/Juara 3 sedang diperiksa moderator/)).toBeVisible();

  await panel.getByRole('button', { name: 'Batalkan pengajuan' }).click();
  await expect(page.getByText('Pengajuan dibatalkan.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Ajukan verifikasi Juara 3' })).toBeVisible();
});

test('moderator memutuskan dari antrean Prestasi; penolakan wajib beralasan', async ({ browser }) => {
  // Pengajuan baru milik persona Mahasiswa, supaya antrean pasti berisi walau tes lain sudah memutuskan isi contoh.
  const student = await (await browser.newContext()).newPage();
  await signInAsDemo(student, 'Mahasiswa', PAST_LOMBA);
  await student.locator('#verifikasi-prestasi').getByRole('button', { name: 'Ajukan verifikasi Juara 3' }).click();
  await expect(student.getByText(/Pengajuan terkirim/)).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await signInAsDemo(admin, 'Admin moderator', '/admin/prestasi');
  await expect(admin.getByRole('heading', { level: 1, name: 'Verifikasi prestasi' })).toBeVisible();
  const card = admin.getByRole('listitem').filter({ hasText: 'Dinda Pratiwi' }).first();
  await card.getByText('Tolak…').click();
  // Tanpa alasan: browser menahan (required); paksa kirim untuk menguji penjaga server.
  await card.getByLabel(/Alasan untuk pengaju/).evaluate((field: HTMLTextAreaElement) => field.removeAttribute('required'));
  await card.getByRole('button', { name: 'Tolak pengajuan' }).click();
  await expect(admin.getByText(/Tulis alasan penolakan|sudah diputuskan/)).toBeVisible();

  const fresh = admin.getByRole('listitem').filter({ hasText: 'Dinda Pratiwi' }).first();
  await fresh.getByRole('button', { name: 'Verifikasi' }).click();
  // Tes paralel bisa memutuskan kartu yang sama lebih dulu — dua hasil itu sama-sama benar.
  await expect(admin.getByText(/Keputusan tersimpan|sudah diputuskan/)).toBeVisible();
});

test('portofolio publik: pasang username, nyalakan, tamu bisa membuka', async ({ page, browser }) => {
  const username = `dinda.uji${Date.now().toString(36)}`;
  await signInAsDemo(page, 'Mahasiswa', '/profile/details?ubah=publik');
  await page.locator('#username').fill(username);
  await page.locator('button[type="submit"][form="form-publik"]').click();
  await expect(page).toHaveURL(/notice=profile_identity_saved/);

  const card = page.locator('#portofolio-publik');
  await card.getByRole('button', { name: 'Nyalakan portofolio publik' }).click();
  await expect(page.getByText('Pengaturan portofolio publik disimpan.')).toBeVisible();
  await expect(card.getByRole('link', { name: `studentfo/u/${username}` })).toBeVisible();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/u/${username}`);
  await expect(guest.getByRole('heading', { level: 1, name: 'Dinda Pratiwi' })).toBeVisible();
  await expect(guest.getByText('Lomba Desain UI/UX Nasional')).toBeVisible();
  // Beasiswa yang belum lolos tidak pernah tampil (ADR-046).
  await expect(guest.getByText('Beasiswa Talenta Digital Gelombang 1')).toHaveCount(0);

  await card.getByRole('button', { name: 'Matikan portofolio publik' }).click();
  await expect(page.getByText('Pengaturan portofolio publik disimpan.')).toBeVisible();
  await guest.goto(`/u/${username}`);
  await expect(guest).toHaveURL(/\/login\?next=/);
});

test('cari rekan tim di halaman lomba: tamu diajak masuk, ajakan WhatsApp tanpa nomor', async ({ page }) => {
  await page.goto(OPEN_LOMBA);
  const finder = page.locator('#cari-rekan');
  await expect(finder.getByRole('heading', { name: /Cari rekan tim/ })).toBeVisible();
  await expect(finder.getByRole('link', { name: 'Masuk untuk melihat calon rekan' })).toBeVisible();
  await expect(finder.getByRole('link', { name: /Ajak teman via WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
});

test('cari rekan tim untuk anggota: saringan kampus lain berupa tautan biasa', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', OPEN_LOMBA);
  const finder = page.locator('#cari-rekan');
  await expect(finder.getByRole('heading', { name: 'Cari rekan tim' })).toBeVisible();
  const crossCampus = finder.getByRole('link', { name: 'Kampus lain' });
  if (await crossCampus.count()) {
    await crossCampus.click();
    await expect(page).toHaveURL(/rekan=lintas/);
    await expect(page.locator('#cari-rekan').getByRole('link', { name: 'Kampus lain' })).toHaveAttribute('aria-current', 'true');
  } else {
    await expect(finder.getByRole('link', { name: 'Buka kartu pemain' })).toBeVisible();
  }
});
