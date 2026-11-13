import { expect, test } from '@playwright/test';
import { demoPosterPng } from '../../src/lib/data/demo-media';
import { confirmDialog, signInAsDemo } from './helpers';

/**
 * Poster lampiran saat mengirim kegiatan (ADR-084), sebagai alur penuh:
 * pengirim yang masuk melampirkan poster → moderator melihatnya di antrean →
 * disetujui → poster tayang di halaman & kartu kegiatan. Sekaligus mengunci
 * bahwa isian form panjang ini TIDAK hilang bila server menolak kiriman.
 */

const octet = () => Math.floor(Math.random() * 250) + 1;
/** Batas laju kiriman dihitung per IP; tiap tes memakai alamat sendiri. */
const freshIp = () => ({ extraHTTPHeaders: { 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` } });

test('tamu tidak ditawari kolom berkas, tetapi tetap bisa mengisi video', async ({ page }) => {
  await page.goto('/submit');
  const media = page.getByRole('region', { name: /Media kegiatan/ });
  await expect(media.locator('input[type=file]')).toHaveCount(0);
  await expect(media.getByRole('link', { name: 'Masuk' })).toHaveAttribute('href', '/login?next=%2Fsubmit');
  await expect(media.getByLabel('Video (opsional)')).toBeVisible();
});

test('poster ditolak server → isian dipulihkan; poster sah → moderator melihat & menayangkannya', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  const title = `Lomba Berposter ${Date.now()}`;
  const deadline = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);

  const senderContext = await browser.newContext(freshIp());
  const sender = await senderContext.newPage();
  await signInAsDemo(sender, 'Mahasiswa', '/submit');
  await sender.getByLabel('Judul kegiatan').fill(title);
  await sender.getByLabel('Penyelenggara', { exact: true }).fill('Panitia Berposter');
  await sender.getByLabel('Jenis kegiatan').selectOption('LOMBA');
  await sender.getByLabel('Tautan pendaftaran').fill(`https://contoh.example/berposter-${Date.now()}`);
  await sender.getByLabel('Tenggat pendaftaran').fill(deadline);
  await sender.getByRole('checkbox', { name: 'D4/S1' }).check();
  await sender.getByRole('radio', { name: 'Berbayar' }).check();
  await sender.getByLabel(/Nominal biaya/).fill('50000');
  await sender.getByLabel('Video (opsional)').fill('youtu.be/aqz-KE-bpKQ');

  // Berkas berlabel PNG yang isinya bukan gambar: lolos pemeriksaan jenis di peramban, ditolak server dari byte-nya.
  await sender.locator('#poster').setInputFiles({ name: 'dokumen.png', mimeType: 'image/png', buffer: Buffer.from('%PDF-1.7 bukan gambar') });
  await sender.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
  await expect(sender).toHaveURL(/error=image_invalid&fields=poster/);
  await expect(sender.getByText('Periksa kolom: Poster.')).toBeVisible();

  // Tidak ada yang perlu diketik ulang — teks, pilihan, tanggal, kotak centang, dan radio kembali.
  await expect(sender.getByLabel('Judul kegiatan')).toHaveValue(title);
  await expect(sender.getByLabel('Jenis kegiatan')).toHaveValue('LOMBA');
  await expect(sender.getByLabel('Tenggat pendaftaran')).toHaveValue(deadline);
  await expect(sender.getByRole('checkbox', { name: 'D4/S1' })).toBeChecked();
  await expect(sender.getByRole('radio', { name: 'Berbayar' })).toBeChecked();
  await expect(sender.getByLabel(/Nominal biaya/)).toHaveValue('50000');
  await expect(sender.getByLabel('Video (opsional)')).toHaveValue('youtu.be/aqz-KE-bpKQ');

  await sender.locator('#poster').setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: Buffer.from(demoPosterPng(3)) });
  await expect(sender.getByText('1 gambar siap dikirim.').first()).toBeVisible();
  await sender.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
  await expect(sender).toHaveURL(/notice=submission_received$/);
  // Kiriman berhasil: form kosong lagi, salinan isian dibuang.
  await expect(sender.getByLabel('Judul kegiatan')).toHaveValue('');

  // Poster yang belum tayang: pengirimnya boleh, tamu tidak.
  const mine = sender.getByRole('region', { name: 'Kirimanmu' }).getByRole('listitem').filter({ hasText: title });
  const pendingSrc = await mine.getByRole('link', { name: 'poster terlampir' }).getAttribute('href');
  expect(pendingSrc).toMatch(/^\/media\/kiriman\/[0-9a-f-]{36}$/);
  const own = await sender.request.get(pendingSrc!);
  expect(own.status()).toBe(200);
  expect(own.headers()['cache-control']).toContain('no-store');
  const guest = await browser.newContext();
  expect((await guest.request.get(pendingSrc!)).status()).toBe(404);
  await guest.close();

  // Moderator melihat posternya di antrean sebelum memutuskan.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsDemo(admin, 'Admin moderator', '/admin');
  const card = admin.getByRole('listitem').filter({ has: admin.getByRole('heading', { name: title }) });
  await expect(card.getByRole('img', { name: `Poster lampiran ${title} — buka ukuran penuh di tab baru` })).toBeVisible();
  await expect(card.getByText('Ikut tayang sebagai poster bila disetujui; dihapus bila ditolak.')).toBeVisible();
  await card.getByRole('button', { name: /Setujui/ }).click();
  await confirmDialog(admin, 'Ya, tayangkan');
  await expect(card).toHaveCount(0);

  // Tayang: slide pertama = poster, video ikut, dan rute kiriman tidak lagi menyajikannya.
  await admin.goto(`/events?q=${encodeURIComponent(title)}`);
  await admin.getByRole('link', { name: title, exact: true }).first().click();
  await expect(admin).toHaveURL(/\/events\/lomba-berposter-/);
  const carousel = admin.getByRole('region', { name: /^Poster & video Lomba Berposter/ });
  await expect(carousel.getByRole('group', { name: '1 dari 2, poster' })).toBeVisible();
  await expect(admin.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/media\/foto\/[0-9a-f-]{36}$/);
  expect((await sender.request.get(pendingSrc!)).status()).toBe(404);

  await Promise.all([senderContext.close(), adminContext.close()]);
});

test('kiriman berposter yang ditolak: posternya dihapus', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  const title = `Lomba Poster Ditolak ${Date.now()}`;

  const senderContext = await browser.newContext(freshIp());
  const sender = await senderContext.newPage();
  await signInAsDemo(sender, 'Mahasiswa', '/submit');
  await sender.getByLabel('Judul kegiatan').fill(title);
  await sender.getByLabel('Penyelenggara', { exact: true }).fill('Panitia Ditolak');
  await sender.getByLabel('Jenis kegiatan').selectOption('LOMBA');
  await sender.getByLabel('Tautan pendaftaran').fill(`https://contoh.example/ditolak-${Date.now()}`);
  await sender.getByLabel('Tenggat pendaftaran').fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
  await sender.getByRole('checkbox', { name: 'D4/S1' }).check();
  await sender.locator('#poster').setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: Buffer.from(demoPosterPng(4)) });
  await expect(sender.getByText('1 gambar siap dikirim.').first()).toBeVisible();
  await sender.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
  await expect(sender).toHaveURL(/notice=submission_received$/);
  const mine = sender.getByRole('region', { name: 'Kirimanmu' }).getByRole('listitem').filter({ hasText: title });
  const pendingSrc = await mine.getByRole('link', { name: 'poster terlampir' }).getAttribute('href');

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsDemo(admin, 'Admin moderator', '/admin');
  const card = admin.getByRole('listitem').filter({ has: admin.getByRole('heading', { name: title }) });
  await card.locator('summary', { hasText: 'Tolak' }).click();
  await card.getByLabel(/Alasan untuk pengirim/).fill('Poster memuat nomor rekening pribadi');
  await card.getByRole('button', { name: 'Ya, tolak' }).click();
  await expect(admin).toHaveURL(/notice=submission_rejected/);

  for (const page of [sender, admin]) expect((await page.request.get(pendingSrc!)).status()).toBe(404);
  await sender.goto('/submit');
  await expect(mine).toContainText('Tidak disetujui');
  await expect(mine.getByRole('link', { name: 'poster terlampir' })).toHaveCount(0);

  await Promise.all([senderContext.close(), adminContext.close()]);
});
