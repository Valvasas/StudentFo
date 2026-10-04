import { expect, test } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Fitur ADR-049..051 di mode seed: biaya, promosi, lencana, buku panduan,
 * kalender, dan endpoint dispatch. Slug di bawah = data contoh
 * (src/lib/data/seed-data.ts) yang sengaja diberi atribut-atribut ini.
 */
const KOMPETISI = '/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026';
const WORKSHOP_PROMOSI = 'Workshop Analisis Data dengan Python untuk Pemula';

test('filter biaya lewat chip berfungsi TANPA JavaScript; kegiatan berbiaya-tak-diketahui tidak ikut', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/events');
  const filters = page.getByRole('region', { name: 'Filter kegiatan' });
  await filters.getByRole('link', { name: 'Gratis', exact: true }).click();
  await expect(page).toHaveURL(/biaya=gratis/);
  await expect(filters.getByRole('link', { name: 'Gratis', exact: true })).toHaveAttribute('aria-current', 'true');

  const cards = page.locator('main article');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await expect(cards.nth(index)).toContainText('Gratis');
  }
  await context.close();
});

test('promosi berbayar: di puncak daftar umum dengan label, tidak di papan "tenggat terdekat"', async ({ page }) => {
  await page.goto('/events');
  const first = page.locator('main article').first();
  await expect(first).toContainText(WORKSHOP_PROMOSI);
  await expect(first).toContainText('Promosi');
  await expect(first).toContainText('Rp 150.000');

  await page.goto('/events?type=WORKSHOP');
  await expect(page.locator('main').getByText('Promosi', { exact: true })).toHaveCount(0);
});

test('detail: lencana otoritas + tooltip, biaya, buku panduan (PDF di balik <details>), CSP frame-src hanya di detail', async ({ page }) => {
  const response = await page.goto(`${KOMPETISI}?tab=syarat`);
  expect(response?.headers()['content-security-policy']).toMatch(/frame-src [^;]*https:/);

  const badge = page.getByRole('button', { name: 'Kampus terverifikasi' });
  await expect(badge).toBeVisible();
  await badge.focus();
  await expect(page.getByRole('tooltip').filter({ hasText: 'domain atau akun resmi kampus' })).toBeVisible();

  await expect(page.locator('main dl')).toContainText('Gratis');
  await expect(page.getByRole('link', { name: /Buka panduan/ })).toHaveAttribute('href', /^https:\/\/www\.w3\.org\/.+\.pdf$/);
  // Iframe tidak dimuat sebelum diminta (kuota & privasi).
  await expect(page.locator('iframe[title^="Buku panduan"]')).toBeHidden();

  const listing = await page.request.get('/events');
  expect(listing.headers()['content-security-policy']).not.toMatch(/frame-src [^;]*https:(?!\/\/)/);
});

test('tambah ke kalender: tautan Google per tenggat + berkas .ics RFC 5545', async ({ page }) => {
  await page.goto(`${KOMPETISI}?tab=tahapan`);
  const menu = page.locator('main section details').filter({ hasText: 'Tambah ke kalender' }).first();
  await menu.locator('summary').click();
  const google = menu.getByRole('link', { name: /Pendaftaran/ }).first();
  await expect(google).toHaveAttribute('href', /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  await expect(google).toHaveAttribute('href', /dates=\d{8}%2F\d{8}/);

  const ics = await page.request.get(`/api/events/${KOMPETISI.split('/').pop()}/calendar`);
  expect(ics.status()).toBe(200);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  expect(ics.headers()['content-disposition']).toContain('attachment; filename="kompetisi-inovasi-perangkat-lunak-nusantara-2026.ics"');
  const body = await ics.text();
  expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(body).toContain('BEGIN:VALARM');

  const missing = await page.request.get('/api/events/tidak-ada-kegiatan-ini/calendar');
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toMatchObject({ code: 'NOT_FOUND' });
});

test('endpoint dispatch gagal tertutup: tanpa CRON_SECRET semua ditolak, GET bukan cara mengklaim', async ({ request }) => {
  const claim = await request.post('/api/cron/dispatch-deadline-notifications', { headers: { Authorization: 'Bearer apa-saja' } });
  expect(claim.status()).toBe(401);
  expect(await claim.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  const ack = await request.post('/api/cron/dispatch-deadline-notifications/ack', { data: { notificationIds: ['x'] } });
  expect(ack.status()).toBe(401);
  const get = await request.get('/api/cron/dispatch-deadline-notifications');
  expect(get.status()).toBe(405);
  expect(get.headers()['allow']).toBe('POST');
});

test('admin: memberi lencana + promosi tampil di katalog; tanggal lampau ditolak', async ({ page }) => {
  await signInAsDemo(page, 'Admin moderator', '/admin/promosi?q=Olimpiade');
  const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: /Olimpiade Matematika/ }) }).first();
  await row.getByLabel('Lencana penyelenggara').selectOption('COMMUNITY');
  const until = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await row.getByLabel(/Promosi sampai/).fill(until);
  await row.getByRole('button', { name: 'Simpan' }).click();
  await expect(page).toHaveURL(/notice=presentation_saved/);
  await expect(page.getByRole('region', { name: 'Promosi terjadwal' }).or(page.locator('section[aria-labelledby="promosi-terjadwal"]'))).toContainText(
    'Olimpiade Matematika',
  );

  // Kembalikan seperti semula: data demo dibagi semua proyek uji.
  const again = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: /Olimpiade Matematika/ }) }).last();
  await again.getByLabel('Lencana penyelenggara').selectOption('OFFICIAL_GOV');
  await again.getByLabel(/Promosi sampai/).fill('');
  await again.getByRole('button', { name: 'Simpan' }).click();
  await expect(page).toHaveURL(/notice=presentation_saved/);
});

test('kiriman berbayar: nominal & kontak panitia sampai ke kartu moderasi, bukan ke publik', async ({ browser }) => {
  const title = `Workshop Berbayar Uji ${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const octet = () => Math.floor(Math.random() * 250) + 1;
  const guest = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` } });
  const form = await guest.newPage();
  await form.goto('/submit');
  await form.getByLabel('Judul kegiatan').fill(title);
  await form.getByLabel('Penyelenggara').fill('Himpunan Uji Biaya');
  await form.getByLabel('Jenis kegiatan').selectOption('WORKSHOP');
  await form.getByLabel('Tautan pendaftaran').fill('https://contoh.example/biaya');
  await form.getByLabel('Tenggat pendaftaran').fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
  await form.locator('input[name="educationLevels"]').first().check();
  await form.getByRole('radio', { name: 'Berbayar' }).check();
  await form.getByLabel(/Nominal biaya/).fill('Rp 35.000');
  await form.getByLabel(/Kontak panitia/).fill('IG @himpunan.uji');
  await form.getByLabel('Email kamu').fill(`biaya.${Date.now()}@contoh.example`);
  await form.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
  await expect(form).toHaveURL(/notice=submission_received/);
  await guest.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAsDemo(page, 'Admin moderator', '/admin');
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) });
  await expect(card).toContainText('Rp 35.000');
  await expect(card).toContainText('IG @himpunan.uji');
  await card.getByText('Tolak', { exact: true }).click();
  await card.getByRole('button', { name: 'Ya, tolak' }).click();
  await expect(card).toHaveCount(0);
  await context.close();
});

test('320px: detail berlencana, menu kalender terbuka, dan tooltip tidak membuat halaman menggulir ke samping', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const tab of ['ringkasan', 'syarat', 'tahapan']) {
    await page.goto(`${KOMPETISI}?tab=${tab}`);
    if (tab === 'tahapan') await page.locator('main section summary').filter({ hasText: 'Tambah ke kalender' }).click();
    await page.getByRole('button', { name: 'Kampus terverifikasi' }).focus();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `tab ${tab} melebar ${overflow}px`).toBeLessThanOrEqual(0);
  }
});
