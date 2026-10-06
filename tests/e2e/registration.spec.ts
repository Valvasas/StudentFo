import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Pendaftaran langsung (ADR-055) di browser sungguhan: wizard bertahap,
 * tiket, batal & daftar ulang, keputusan penyelenggara yang sampai ke
 * peserta, ekspor CSV, dan formulir tanpa JavaScript.
 *
 * Data demo dipakai bersama SEMUA proyek (terang/gelap/ponsel) di satu
 * server, jadi tes yang mengubah pendaftaran hanya jalan di satu proyek,
 * dan setiap tes memakai acara & persona yang berbeda supaya bisa paralel.
 * Tiap tes juga membatalkan pendaftaran sisa run sebelumnya (server uji
 * dipakai ulang secara lokal) — tidak bergantung pada data yang bersih.
 */

const CONFERENCE = '/events/konferensi-mahasiswa-kesehatan-masyarakat-2026';
const INTERNSHIP = '/events/program-magang-analis-data-kuartal-ii';
const WORKSHOP = '/events/workshop-analisis-data-dengan-python-untuk-pemula';
const INTERNSHIP_STUDIO = '/penyelenggara/acara/e1000000-0000-4000-8000-000000000003';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** Buka formulir; kalau run sebelumnya meninggalkan pendaftaran aktif, batalkan dulu. */
async function openFreshForm(page: Page, eventPath: string) {
  await page.goto(`${eventPath}/pendaftaran`);
  if (/\/tiket/.test(page.url())) {
    await page.getByText('Batalkan pendaftaran', { exact: true }).click();
    await page.getByRole('button', { name: 'Ya, batalkan pendaftaranku' }).click();
    await expect(page).toHaveURL(/notice=registration_cancelled/);
    await page.getByRole('link', { name: 'Daftar lagi' }).click();
  }
  await expect(page).toHaveURL(new RegExp(`${eventPath}/pendaftaran$`));
}

test('peserta: daftar lewat wizard → tiket aktif → batal → daftar ulang dengan kode yang sama', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama — cukup satu proyek');
  await signInAsDemo(page, 'Mahasiswa', CONFERENCE);
  await openFreshForm(page, CONFERENCE);
  // Titik masuknya tombol utama di halaman acara, bukan tautan luar.
  await page.goto(CONFERENCE);
  await page.getByRole('link', { name: /^Daftar (lagi )?di StudentFo/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`${CONFERENCE}/pendaftaran$`));

  // Langkah 1: nomor yang tidak bisa dihubungi tidak lolos ke langkah berikutnya.
  await expect(page.getByRole('heading', { name: /Langkah 1 dari 3: Data diri/ })).toBeVisible();
  await page.getByLabel('Nomor WhatsApp').fill('12345');
  await page.getByRole('button', { name: /^Lanjut/ }).click();
  await expect(page.getByRole('heading', { name: /Langkah 1 dari 3/ })).toBeVisible();
  await page.getByLabel('Nomor WhatsApp').fill('0812 3456 7890');
  await expect(page.getByText('Tersimpan sebagai 0812-3456-7890')).toBeVisible();
  await page.getByLabel('Sekolah / kampus / instansi').fill('Universitas Hasanuddin');
  await page.getByRole('button', { name: /^Lanjut/ }).click();

  // Langkah 2: pertanyaan panitia.
  await expect(page.getByRole('heading', { name: /Langkah 2 dari 3: Pertanyaan panitia/ })).toBeFocused();
  await page.getByLabel('Kesehatan lingkungan').check();
  await page.getByRole('button', { name: /^Lanjut/ }).click();

  // Langkah 3: ringkasan + persetujuan wajib.
  await expect(page.getByRole('heading', { name: /Langkah 3 dari 3: Tinjau & kirim/ })).toBeVisible();
  await expect(page.locator('dd').filter({ hasText: /^Kesehatan lingkungan$/ })).toBeVisible();
  await expectNoViolations(page);
  await page.getByRole('checkbox', { name: /Saya setuju data di atas/ }).check();
  await page.getByRole('button', { name: /Kirim pendaftaran/ }).click();

  await expect(page).toHaveURL(/\/pendaftaran\/tiket\?notice=registration_submitted/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kamu terdaftar.' })).toBeVisible();
  const ticket = page.getByRole('article', { name: /Tiket Konferensi Mahasiswa/ });
  const code = (await ticket.locator('.font-mono').first().textContent())?.trim() ?? '';
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  await expectNoViolations(page);

  // Halaman acara kini menunjuk ke tiket, bukan formulir.
  await page.goto(CONFERENCE);
  await expect(page.getByRole('link', { name: /Lihat tiketmu/ }).first()).toBeVisible();

  // Batal (dengan konfirmasi), lalu daftar ulang: kode tiket tetap sama.
  await page.goto(`${CONFERENCE}/pendaftaran/tiket`);
  await page.getByText('Batalkan pendaftaran', { exact: true }).click();
  await page.getByRole('button', { name: 'Ya, batalkan pendaftaranku' }).click();
  await expect(page).toHaveURL(/notice=registration_cancelled/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kursimu sudah dilepas.' })).toBeVisible();
  await page.getByRole('link', { name: 'Daftar lagi' }).click();
  // Isian lama dipakai lagi — tidak diketik dari nol.
  await expect(page.getByLabel('Nomor WhatsApp')).toHaveValue('+6281234567890');
  await page.getByRole('button', { name: /^Lanjut/ }).click();
  await page.getByLabel('Gizi masyarakat').check();
  await page.getByRole('button', { name: /^Lanjut/ }).click();
  await page.getByRole('checkbox', { name: /Saya setuju data di atas/ }).check();
  await page.getByRole('button', { name: /Kirim pendaftaran/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kamu terdaftar.' })).toBeVisible();
  await expect(page.getByRole('article', { name: /Tiket Konferensi/ }).getByText(code)).toBeVisible();
});

test('tanpa JavaScript: semua langkah tampil sebagai satu formulir, kuota penuh → daftar tunggu', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama — cukup satu proyek');
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await signInAsDemo(page, 'Siswa baru', WORKSHOP);
  await openFreshForm(page, WORKSHOP);

  // Tanpa JS tidak ada tombol "Lanjut": seluruh isian terlihat sekaligus.
  await expect(page.getByLabel('Nomor WhatsApp')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Saya setuju data di atas/ })).toBeVisible();
  await expect(page.getByText(/Kursi penuh · masuk daftar tunggu/)).toBeVisible();

  await page.getByLabel('Nomor WhatsApp').fill('+62 857 1111 2222');
  await page.getByLabel('Sekolah / kampus / instansi').fill('SMA Negeri 1 Bogor');
  await page.getByLabel('SMA/SMK').check();
  await page.getByLabel('Linux').check();
  await page.getByRole('checkbox', { name: /Saya setuju data di atas/ }).check();
  await page.getByRole('button', { name: /Kirim pendaftaran/ }).click();

  await expect(page).toHaveURL(/\/tiket\?notice=registration_submitted/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kamu di daftar tunggu.' })).toBeVisible();
  await expect(page.getByText(/^Antre #\d+$/)).toBeVisible();
  await context.close();
});

test('penyelenggara meninjau: konfirmasi sampai ke peserta, CSV privat, formulir menolak data sensitif', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama — cukup satu proyek');
  const studentContext = await browser.newContext();
  const organizerContext = await browser.newContext();
  const student = await studentContext.newPage();
  const organizer = await organizerContext.newPage();

  // Peserta mendaftar ke magang yang ditinjau manual.
  await signInAsDemo(student, 'Mahasiswa', INTERNSHIP);
  await openFreshForm(student, INTERNSHIP);
  await student.getByLabel('Nomor WhatsApp').fill('081298765432');
  await student.getByLabel('Sekolah / kampus / instansi').fill('Universitas Hasanuddin');
  await student.getByRole('button', { name: /^Lanjut/ }).click();
  await student.getByLabel('Tautan CV atau portofolio').fill('https://cv.contoh.id/dinda');
  await student.getByLabel('Kenapa kamu tertarik dengan analisis data?').fill('Saya suka menemukan pola dari data kampus.');
  await student.getByLabel('Juli').check();
  await student.getByRole('button', { name: /^Lanjut/ }).click();
  await student.getByRole('checkbox', { name: /Saya setuju data di atas/ }).check();
  await student.getByRole('button', { name: /Kirim pendaftaran/ }).click();
  await expect(student.getByRole('heading', { level: 1, name: 'Pendaftaranmu sedang ditinjau.' })).toBeVisible();

  // Penyelenggara: dasbor → pendaftar → cari → konfirmasi.
  await signInAsDemo(organizer, 'Penyelenggara', `${INTERNSHIP_STUDIO}/pendaftaran`);
  await expect(organizer.getByRole('heading', { name: /Pendaftaran langsung · Dibuka/ })).toBeVisible();
  await expect(organizer.getByRole('heading', { name: 'Pendaftar per hari' })).toBeVisible();
  await organizer.getByRole('navigation', { name: 'Studio acara' }).getByRole('link', { name: /Pendaftar/ }).click();
  const search = organizer.getByRole('search');
  await search.getByLabel('Cari nama, institusi, email, atau kode tiket').fill('Dinda');
  await search.getByRole('button', { name: 'Cari' }).click();
  await expect(organizer).toHaveURL(/q=Dinda/);
  await organizer.getByRole('link', { name: /Dinda Pratiwi/ }).first().click();
  const panel = organizer.getByRole('complementary', { name: 'Dinda Pratiwi' });
  await expect(panel.getByText('https://cv.contoh.id/dinda')).toBeVisible();
  await expectNoViolations(organizer);
  await panel.getByRole('button', { name: /^Konfirmasi$/ }).click();
  await expect(organizer).toHaveURL(/notice=registration_decided/);

  // Peserta melihat statusnya berubah + pesan panitia yang hanya untuk yang terkonfirmasi.
  await student.reload();
  await expect(student.getByRole('heading', { level: 1, name: 'Kamu terdaftar.' })).toBeVisible();
  await expect(student.getByRole('heading', { name: /Pesan dari panitia/ })).toBeVisible();

  // CSV: untuk pengelola saja, tidak boleh tersimpan di cache bersama.
  const csv = await organizer.request.get(`${INTERNSHIP_STUDIO}/pendaftar/ekspor`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()['cache-control']).toContain('no-store');
  expect(csv.headers()['content-disposition']).toMatch(/attachment; filename="pendaftar-program-magang/);
  expect(await csv.text()).toContain('Dinda Pratiwi');
  const forbidden = await student.request.get(`${INTERNSHIP_STUDIO}/pendaftar/ekspor`);
  expect(forbidden.status()).toBe(403);

  // Formulir: pertanyaan yang meminta KTP diperingatkan saat mengetik dan ditolak server.
  await organizer.goto(`${INTERNSHIP_STUDIO}/pendaftaran/formulir`);
  await organizer.getByRole('button', { name: 'Tambah pertanyaan' }).click();
  await organizer.getByRole('textbox', { name: /^Teks pertanyaan/ }).last().fill('Nomor KTP kamu');
  await expect(organizer.getByText(/tidak mengizinkan formulir meminta kata sandi, OTP, NIK\/KTP/)).toBeVisible();
  await organizer.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(organizer).toHaveURL(/error=invalid_registration_form/);
  await expect(organizer).toHaveURL(/fields=q\d_label/);

  await studentContext.close();
  await organizerContext.close();
});

test('studio pendaftaran tertutup bagi yang bukan pengelola', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', `${INTERNSHIP_STUDIO}/pendaftar`);
  await expect(page.getByRole('heading', { name: 'Acara ini tidak ada di dasbormu' })).toBeVisible();
});
