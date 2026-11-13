import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Gerbang anggota di halaman kegiatan (ADR-085). Yang dikunci:
 * - tamu melihat "etalase" (judul, fakta, poster, cuplikan) + gerbang, bukan halaman kosong;
 * - deskripsi lengkap, tautan pendaftaran/sumber/panduan TIDAK ada di HTML tamu
 *   (termasuk payload RSC yang terbaca lewat view-source);
 * - mesin pencari menerima halaman yang sama dengan tamu (bukan cloaking);
 * - masuk dari gerbang kembali ke bagian yang sama, kini terbuka.
 */
const SLUG = 'kompetisi-inovasi-perangkat-lunak-nusantara-2026';
const EVENT = `/events/${SLUG}`;
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
/** Kalimat penutup deskripsi contoh — di luar cuplikan 200 karakter. */
const DESCRIPTION_END = 'mentor industri sebelum demo day';

test('tamu: etalase + cuplikan + gerbang; tautan pendaftaran & isi tab tidak terkirim sama sekali', async ({ page, request }) => {
  await page.goto(EVENT);
  await expect(page.getByRole('heading', { level: 1, name: 'Kompetisi Inovasi Perangkat Lunak Nusantara 2026' })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Poster/ })).toBeVisible();
  await expect(page.locator('main dl')).toContainText('Gratis');

  // Cuplikan terpotong di batas kata, diikuti gerbang anggota.
  const about = page.locator('main section').filter({ has: page.getByRole('heading', { name: 'Tentang kegiatan' }) }).first();
  await expect(about.getByText(/^Kompetisi pengembangan perangkat lunak tingkat nasional.*…$/)).toBeVisible();
  const gate = page.getByRole('region', { name: 'Lanjut baca setelah masuk' });
  await expect(gate.getByRole('link', { name: 'Masuk', exact: true })).toHaveAttribute('href', `/login?next=${encodeURIComponent(EVENT)}`);
  await expect(gate.getByRole('link', { name: 'Daftar gratis' })).toHaveAttribute('href', `/register?next=${encodeURIComponent(EVENT)}`);

  // Tombol daftar diganti ajakan masuk; kalender adalah alat anggota.
  const aside = page.getByRole('complementary', { name: 'Pendaftaran' });
  await expect(page.getByRole('link', { name: /Daftar sekarang/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Masuk untuk mendaftar' }).first()).toHaveAttribute('href', `/login?next=${encodeURIComponent(EVENT)}`);
  await expect(aside.getByText('Tambah ke kalender')).toHaveCount(0);

  // Tidak ada di dokumen mana pun yang diterima tamu — bukan sekadar disembunyikan CSS.
  const html = await (await request.get(EVENT)).text();
  for (const secret of [DESCRIPTION_END, `example.org/daftar/${SLUG}`, `example.org/sumber/${SLUG}`, 'dummy.pdf']) {
    expect(html, `bocor ke tamu: ${secret}`).not.toContain(secret);
  }
});

test('tamu: setiap tab lain berisi gerbang dengan judulnya sendiri', async ({ page }) => {
  for (const [tab, heading] of [
    ['syarat', 'Syarat & berkas khusus anggota'],
    ['tahapan', 'Jadwal lengkap khusus anggota'],
    ['tanya', 'Tanya jawab khusus anggota'],
    ['penyelenggara', 'Sumber resmi khusus anggota'],
  ] as const) {
    await page.goto(`${EVENT}?tab=${tab}`);
    const gate = page.getByRole('region', { name: heading });
    await expect(gate).toBeVisible();
    await expect(gate.getByRole('link', { name: 'Masuk', exact: true })).toHaveAttribute('href', `/login?next=${encodeURIComponent(`${EVENT}?tab=${tab}`)}`);
  }
  // Tahapan menyebut jumlah tahapnya — alasan konkret untuk masuk.
  await page.goto(`${EVENT}?tab=tahapan`);
  await expect(page.getByText(/Kegiatan ini punya \d+ tahap\./)).toBeVisible();
});

test('mesin pencari menerima halaman yang sama dengan tamu (bukan cloaking)', async ({ request }) => {
  const html = await (await request.get(EVENT, { headers: { 'user-agent': GOOGLEBOT } })).text();
  expect(html).toContain('Lanjut baca setelah masuk');
  expect(html).not.toContain(DESCRIPTION_END);
  // Tetap bisa diindeks: judul & cuplikan ada, tanpa noindex.
  expect(html).toContain('Kompetisi Inovasi Perangkat Lunak Nusantara 2026');
  expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
});

test('masuk dari gerbang → kembali ke tab yang sama, kini terbuka penuh', async ({ page }) => {
  await page.goto(`${EVENT}?tab=syarat`);
  await page.getByRole('region', { name: 'Syarat & berkas khusus anggota' }).getByRole('link', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(`${EVENT}?tab=syarat`)}`);

  // Mode seed: pintu masuknya persona demo, dengan tujuan yang sama.
  await page.getByRole('link', { name: 'Lihat pratinjau dengan akun demo' }).click();
  await page.getByRole('button', { name: /^Masuk sebagai Mahasiswa:/ }).click();
  await expect(page).toHaveURL(`${EVENT}?tab=syarat`);
  await expect(page.getByRole('heading', { name: 'Syarat peserta' })).toBeVisible();
  await expect(page.getByRole('region', { name: /khusus anggota/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Daftar sekarang/ }).first()).toBeAttached();

  await page.goto(EVENT);
  await expect(page.getByText(DESCRIPTION_END, { exact: false })).toBeVisible();
});

test('tamu tanpa JavaScript: gerbang tetap tautan biasa yang berfungsi', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${EVENT}?tab=tanya`);
  await page.getByRole('region', { name: 'Tanya jawab khusus anggota' }).getByRole('link', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await context.close();
});

test('pendataan sebelum daftar & berkas kalender: tamu diarahkan masuk / ditolak', async ({ request }) => {
  const survey = await request.get('/events/program-relawan-literasi-desa-angkatan-7/sebelum-daftar', { maxRedirects: 0 });
  expect([303, 307]).toContain(survey.status());
  expect(survey.headers()['location']).toContain(`/login?next=${encodeURIComponent('/events/program-relawan-literasi-desa-angkatan-7')}`);

  const ics = await request.get(`/api/events/${SLUG}/calendar`);
  expect(ics.status()).toBe(401);
});

test('anggota: tamu-lain di perangkat yang sama tidak mewarisi isi terbuka (halaman tidak di-cache bersama)', async ({ browser }) => {
  const member = await browser.newContext();
  await signInAsDemo(await member.newPage(), 'Mahasiswa', EVENT);
  await member.close();

  const guest = await browser.newContext();
  const page = await guest.newPage();
  await page.goto(EVENT);
  await expect(page.getByRole('region', { name: 'Lanjut baca setelah masuk' })).toBeVisible();
  await expect(page.getByText(DESCRIPTION_END)).toHaveCount(0);
  await guest.close();
});
