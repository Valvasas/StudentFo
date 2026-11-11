import { expect, test } from '@playwright/test';
import { demoPosterPng } from '../../src/lib/data/demo-media';
import { PAID_DEMO_EVENT, signInAsDemo } from './helpers';

/**
 * Poster, slide & video acara (ADR-079). Data demo: acara 001 punya poster +
 * dua foto suasana; festival film punya poster + video (Big Buck Bunny) + satu
 * foto. Tes yang MENGUBAH media memakai acara 004 dan hanya proyek terang,
 * supaya tes baca di proyek lain tidak melihat poster yang berpindah.
 */

const POSTER_EVENT = '/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026';
const VIDEO_EVENT = '/events/festival-film-pendek-pelajar-nusantara';

test('slide: poster pertama, tombol & titik menggeser, layar penuh membuka penampil', async ({ page }) => {
  await page.goto(POSTER_EVENT);
  const carousel = page.getByRole('region', { name: /^Poster Kompetisi Inovasi/ });
  await expect(carousel).toBeVisible();
  await expect(carousel.getByRole('group', { name: '1 dari 3, poster' })).toBeVisible();
  await expect(carousel.getByRole('img', { name: 'Poster Kompetisi Inovasi Perangkat Lunak Nusantara 2026' })).toBeVisible();

  const dots = carousel.getByRole('button', { name: /^Ke slide/ });
  await expect(dots).toHaveCount(3);
  await expect(dots.first()).toHaveAttribute('aria-current', 'true');
  await carousel.getByRole('button', { name: 'Slide berikutnya' }).click();
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  // Berputar: dari slide terakhir kembali ke poster, tombol tidak pernah dinonaktifkan.
  await carousel.getByRole('button', { name: 'Slide berikutnya' }).click();
  await carousel.getByRole('button', { name: 'Slide berikutnya' }).click();
  await expect(dots.first()).toHaveAttribute('aria-current', 'true');

  await carousel.getByRole('button', { name: 'Layar penuh' }).click();
  const viewer = page.getByRole('dialog', { name: /^Foto Poster Kompetisi/ });
  await expect(viewer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('video: belum ada permintaan ke YouTube sampai Putar ditekan; pemutar memakai youtube-nocookie', async ({ page }) => {
  const thirdParty: string[] = [];
  page.on('request', (request) => {
    if (/youtube|ytimg|vimeo|googlevideo/.test(new URL(request.url()).hostname)) thirdParty.push(request.url());
  });
  // Tes tidak bergantung pada jaringan luar: pemutar dibalas halaman kosong.
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>pemutar</title>' }));

  await page.goto(VIDEO_EVENT);
  const carousel = page.getByRole('region', { name: /^Poster & video Festival Film/ });
  await carousel.getByRole('button', { name: 'Ke slide 2 (video)' }).click();
  const play = carousel.getByRole('link', { name: /Putar video/ });
  await expect(play).toHaveAttribute('href', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  expect(thirdParty).toEqual([]);

  await play.click();
  const player = carousel.locator('iframe');
  await expect(player).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?autoplay=1/);
  await expect(player).toHaveAttribute('title', 'Video acara (YouTube)');

  // Pindah slide melepas pemutar — video tidak terus berbunyi di slide yang tidak terlihat.
  await carousel.getByRole('button', { name: 'Ke slide 1 (poster)' }).click();
  await expect(carousel.locator('iframe')).toHaveCount(0);
});

test('poster jadi thumbnail di kartu lomba dan gambar pratinjau tautan; acara tanpa poster tidak diberi pengganti', async ({ page }) => {
  await page.goto('/events?type=LOMBA');
  const card = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Kompetisi Debat Bahasa Indonesia Antar-SMA', exact: true }) });
  await expect(card.locator('[data-poster-thumb] img')).toBeVisible();

  await page.goto(POSTER_EVENT);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/media\/foto\/[0-9a-f-]{36}$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');

  await page.goto('/events/beasiswa-unggulan-bakti-pendidikan-2026');
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  await expect(page.getByRole('region', { name: /^(Poster|Foto)/ })).toHaveCount(0);
});

test('studio: unggah poster, pasang video, lalu tampil di halaman publik', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  const gallery = `/penyelenggara/acara/${PAID_DEMO_EVENT.id}/galeri`;
  await signInAsDemo(page, 'Penyelenggara', gallery);
  await expect(page.getByRole('heading', { name: 'Poster & foto' })).toBeVisible();

  const asPoster = page.getByRole('checkbox', { name: /Jadikan gambar pertama sebagai poster/ });
  await expect(asPoster).toBeChecked();
  await page.locator('input[type=file][name=photos]').setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: Buffer.from(demoPosterPng(2)) });
  await page.getByRole('button', { name: 'Unggah', exact: true }).click();
  await expect(page).toHaveURL(/notice=poster_set/);
  await expect(page.getByRole('button', { name: 'Lepas poster' })).toBeVisible();

  const video = page.getByRole('textbox', { name: 'Tautan YouTube atau Vimeo' });
  await video.fill('https://www.tiktok.com/@akun/video/123');
  await page.getByRole('button', { name: 'Simpan video' }).click();
  await expect(page).toHaveURL(/error=invalid_video_url/);

  await page.getByRole('textbox', { name: 'Tautan YouTube atau Vimeo' }).fill('https://youtu.be/aqz-KE-bpKQ?si=dibagikan');
  await page.getByRole('button', { name: 'Simpan video' }).click();
  await expect(page).toHaveURL(/notice=video_saved/);
  await expect(page.getByRole('textbox', { name: 'Tautan YouTube atau Vimeo' })).toHaveValue('https://www.youtube.com/watch?v=aqz-KE-bpKQ');

  await page.goto(PAID_DEMO_EVENT.path);
  const carousel = page.getByRole('region', { name: /^Poster & video Workshop/ });
  await expect(carousel.getByRole('group', { name: '1 dari 2, poster' })).toBeVisible();
  await expect(carousel.getByRole('group', { name: '2 dari 2, video' })).toBeAttached();

  // Bersihkan: video dilepas, poster dihapus — tes lain memakai acara ini untuk pendaftaran.
  await page.goto(gallery);
  await page.getByRole('button', { name: 'Lepas video' }).click();
  await expect(page).toHaveURL(/notice=video_removed/);
  await page.locator('summary[aria-label="Hapus poster"]').click();
  await page.getByRole('button', { name: 'Ya, hapus poster' }).click();
  await expect(page).toHaveURL(/notice=photo_deleted/);
});

test('admin: acara tanpa pengelola bisa diberi poster & video dari Lencana & promosi', async ({ page }) => {
  await signInAsDemo(page, 'Admin moderator', '/admin/promosi');
  await page.getByRole('link', { name: /^Pasang poster & video untuk Program Magang Analis Data/ }).click();
  await expect(page).toHaveURL(/\/admin\/media\/program-magang-analis-data-kuartal-ii$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Poster & video' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tambah poster atau foto' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Video', exact: true })).toBeVisible();
});
