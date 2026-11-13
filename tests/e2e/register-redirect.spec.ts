import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

/**
 * "Daftar sekarang" keluar lewat /events/<slug>/daftar supaya klik tercatat
 * (ADR-032). Yang wajib dijaga: tujuannya selalu tautan pendaftaran event
 * itu sendiri (bukan open redirect), dan slug tak dikenal tidak pernah
 * mengalihkan ke luar situs.
 */
test('tombol Daftar menunjuk pengalih internal yang mengarah ke tautan pendaftaran event', async ({ page, request }) => {
  // Acara contoh tanpa formulir StudentFo (ADR-056): yang berformulir menautkan /formulir, bukan /daftar.
  const href = '/events/program-relawan-literasi-desa-angkatan-7';

  // Tamu tidak pernah diantar ke tautan pendaftaran — kembali ke halaman acara setelah masuk (ADR-085).
  const guest = await request.get(`${href}/daftar`, { maxRedirects: 0, headers: { 'user-agent': BROWSER_UA } });
  expect(guest.status()).toBe(303);
  const login = new URL(guest.headers()['location']!, 'http://localhost');
  expect(`${login.pathname}${login.search}`).toBe(`/login?next=${encodeURIComponent(href)}`);

  await signInAsDemo(page, 'Mahasiswa', href);
  const register = page.getByRole('link', { name: /Daftar sekarang/ });
  await expect(register).toHaveAttribute('href', `${href}/daftar`);
  await expect(register).toHaveAttribute('rel', /noopener/);

  // Tujuan LUAR melewati pendataan kinerja dulu (ADR-070) — tetap di situs ini.
  const response = await page.request.get(`${href}/daftar`, { maxRedirects: 0, headers: { 'user-agent': BROWSER_UA } });
  expect(response.status()).toBe(303);
  expect(new URL(response.headers()['location']!, page.url()).pathname).toBe(`${href}/sebelum-daftar`);
});

test('pendataan kinerja: sekali per acara, lalu keluar ke tautan resmi; kunjungan berikutnya langsung keluar', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'terang', 'alur, bukan tampilan');
  let external: string | null = null;
  await context.route(/^(?!http:\/\/(localhost|127\.0\.0\.1))/, (route) => {
    external = route.request().url();
    return route.abort();
  });
  const href = '/events/program-relawan-literasi-desa-angkatan-7';
  await signInAsDemo(page, 'Mahasiswa', `${href}/sebelum-daftar`);
  await expect(page.getByText(/tidak memuat nama atau email/)).toBeVisible();
  await expect(page.getByText(/boleh dilewati/)).toBeVisible();

  await page.getByRole('button', { name: /Lanjut ke pendaftaran resmi/ }).click();
  // Isian wajib kosong: peramban menahan kiriman, tetap di halaman ini.
  await expect(page).toHaveURL(new RegExp(`${href}/sebelum-daftar$`));

  await page.getByRole('radio', { name: 'D4/S1' }).check();
  await page.getByRole('radio', { name: 'Instagram' }).check();
  await page.getByRole('button', { name: /Lanjut ke pendaftaran resmi/ }).click();
  await expect.poll(() => external).toMatch(/^https?:\/\//);

  const again = await page.request.get(`${href}/daftar`, { maxRedirects: 0, headers: { 'user-agent': BROWSER_UA } });
  expect(again.status()).toBe(303);
  expect(new URL(again.headers()['location']!).host).not.toBe(new URL(page.url()).host);
  // Halaman pendataan sendiri pun langsung meneruskan — tidak ditanya ulang.
  const survey = await page.request.get(`${href}/sebelum-daftar`, { maxRedirects: 0 });
  expect([303, 307]).toContain(survey.status());
});

test('Lewati: tanpa mengisi apa pun langsung ke tautan resmi, tidak ditanya lagi untuk acara itu', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'terang', 'alur, bukan tampilan');
  let external: string | null = null;
  await context.route(/^(?!http:\/\/(localhost|127\.0\.0\.1))/, (route) => {
    external = route.request().url();
    return route.abort();
  });
  const href = '/events/program-relawan-literasi-desa-angkatan-7';
  await signInAsDemo(page, 'Mahasiswa', `${href}/sebelum-daftar`);
  // Pertanyaan wajib dibiarkan kosong — Lewati tidak boleh ditahan validasi peramban.
  await page.getByRole('button', { name: 'Lewati' }).click();
  await expect.poll(() => external).toMatch(/^https?:\/\//);
  const survey = await page.request.get(`${href}/sebelum-daftar`, { maxRedirects: 0 });
  expect([303, 307]).toContain(survey.status());

  // Klik "Daftar" menaruh acaranya di Papan lamaran (ADR-090) — sebagai "Disimpan", bukan
  // "Sudah Daftar": klik bukan bukti pendaftaran selesai, tahap itu dilaporkan sendiri (ADR-046).
  await page.goto(href);
  await expect(page.getByRole('button', { name: 'Tersimpan di Tracker' })).toBeVisible();
  const title = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  await page.goto('/tracker');
  await expect(page.getByLabel(`Tahap lamaran untuk ${title}`, { exact: true })).toHaveValue('SAVED');
});

test('pendataan lomba menunjuk lobi, asal sekolah dari direktori; admin melihat hasilnya tanpa identitas', async ({ page, context, browser }) => {
  test.skip(test.info().project.name !== 'terang', 'alur, bukan tampilan');
  await context.route(/^(?!http:\/\/(localhost|127\.0\.0\.1))/, (route) => route.abort());
  const href = '/events/olimpiade-matematika-pelajar-tingkat-nasional';
  await signInAsDemo(page, 'Mahasiswa', `${href}/sebelum-daftar`);
  await expect(page.getByRole('link', { name: 'Lobi lomba ini' })).toHaveAttribute('href', '/lobi/olimpiade-matematika-pelajar-tingkat-nasional');
  await page.getByRole('radio', { name: 'SMA/SMK' }).check();
  await page.getByRole('radio', { name: 'TikTok' }).check();
  await page.getByRole('radio', { name: 'Masih mencari tim atau partner' }).check();
  const institution = page.getByRole('combobox', { name: 'Asal sekolah / kampus (opsional)' });
  await institution.fill('sman 8 jakarta');
  await page.getByRole('option', { name: /SMAN 8 Jakarta/ }).click();
  await expect(institution).toHaveValue('SMAN 8 Jakarta');
  await expect(page.getByText('Terpilih dari direktori resmi.')).toBeVisible();
  await page.getByRole('button', { name: /Lanjut ke pendaftaran resmi/ }).click();
  await expect(page).not.toHaveURL(/sebelum-daftar/);

  const admin = await (await browser.newContext()).newPage();
  await signInAsDemo(admin, 'Admin moderator', '/admin/kinerja');
  const row = admin.getByRole('row', { name: /Olimpiade Matematika Pelajar/ });
  await expect(row).toBeVisible();
  await expect(admin.getByRole('term').filter({ hasText: 'Melewati' })).toBeVisible();
  // k-anonim: asal sekolah dengan < 5 jawaban tidak disebut namanya.
  await expect(admin.getByRole('region', { name: 'Asal sekolah / kampus' }).getByText('SMAN 8 JAKARTA')).toHaveCount(0);
  await admin.close();
});

test('admin menyusun pertanyaan pendataan: bawaan + pertanyaan tambahan, tersimpan', async ({ page }) => {
  test.skip(test.info().project.name !== 'terang', 'alur, bukan tampilan');
  await signInAsDemo(page, 'Admin moderator', '/admin/kinerja');
  await page.getByRole('link', { name: 'Atur pertanyaan' }).click();
  await expect(page).toHaveURL(/\/admin\/kinerja\/pertanyaan$/);
  await expect(page.getByLabel('Jenjang pendidikan')).toHaveValue('REQUIRED');
  await expect(page.getByLabel('Domisili kabupaten/kota')).toHaveValue('OPTIONAL');
  await expect(page.getByRole('button', { name: /^Pertanyaan 1: Dari mana kamu tahu info ini/ })).toBeVisible();
  // Jenis pembawa identitas tidak ditawarkan.
  await page.getByRole('button', { name: 'Tambah pertanyaan' }).click();
  await expect(page.getByRole('button', { name: 'Email' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nomor telepon' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tutup pilihan jenis' }).click();
  // Simpan tanpa perubahan: idempoten, aman untuk tes lain yang berjalan bersamaan.
  await page.getByRole('button', { name: 'Simpan pertanyaan' }).click();
  await expect(page).toHaveURL(/notice=outbound_config_saved/);
});

test('pendataan & editor tertutup untuk peserta biasa', async ({ page }) => {
  test.skip(test.info().project.name !== 'terang', 'alur, bukan tampilan');
  await signInAsDemo(page, 'Mahasiswa', '/profile');
  const response = await page.goto('/admin/kinerja/pertanyaan');
  expect(response?.status()).toBe(404);
});

test('slug tak dikenal & parameter tujuan palsu tidak pernah mengalihkan ke luar situs', async ({ request, baseURL }) => {
  for (const path of ['/events/tidak-ada/daftar', '/events/tidak-ada/daftar?to=https://evil.example', '/events/%2F%2Fevil.example/daftar']) {
    const response = await request.get(path, { maxRedirects: 0, headers: { 'user-agent': BROWSER_UA } });
    expect([303, 404]).toContain(response.status());
    const location = response.headers()['location'];
    if (location) expect(new URL(location, baseURL).host).toBe(new URL(baseURL!).host);
  }
});

test('robots.txt melarang crawler mengikuti pengalih', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /events/*/daftar');
  expect(robots).toContain('Disallow: /events/*/sebelum-daftar');
  expect(robots).toContain('Disallow: /lobi');
});
