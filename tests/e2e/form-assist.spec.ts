import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { demoPosterPng } from '../../src/lib/data/demo-media';
import { signInAsDemo } from './helpers';

/**
 * Slide penjelas, penyusun formulir yang lebih ramah, dan tawaran cari
 * partner (ADR-094), sebagai satu alur penuh:
 *  1. admin membuat lomba + poster + dua slide berketerangan yang urutannya diubah sebelum dikirim;
 *  2. di penyusun: Status tim dari templat, "Tambah cepat", seret untuk mengubah urutan, pratinjau;
 *  3. peserta memilih "belum punya tim" → tawaran partner muncul di formulir, sesudah mendaftar,
 *     dan lobi terbuka dengan niat "Mencari tim" yang sudah terpilih.
 */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const png = (palette: number, name: string) => ({ name, mimeType: 'image/png', buffer: Buffer.from(demoPosterPng(palette)) });

test('lomba bergambar → formulir Status tim → peserta tanpa tim diantar ke pencarian partner & lobi', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  test.setTimeout(150_000);
  const title = `Lomba Tim Bergambar ${Date.now()}`;

  // 1. Admin: poster + dua slide, slide kedua dinaikkan sebelum dikirim.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsDemo(admin, 'Admin moderator', '/admin/acara/baru');
  await admin.getByLabel('Judul acara').fill(title);
  await admin.getByLabel('Deskripsi').fill('Lomba tim lintas kampus untuk menguji slide & pencarian partner.');
  await admin.getByLabel('Tenggat pendaftaran').fill(inDays(25));
  await admin.getByRole('checkbox', { name: 'D4/S1' }).check();
  await admin.locator('#poster').setInputFiles(png(1, 'poster.png'));
  await admin.locator('#slides').setInputFiles([png(2, 'hadiah.png'), png(3, 'juri.png')]);
  await expect(admin.getByText('2 gambar siap dikirim.')).toBeAttached();
  await admin.getByRole('textbox', { name: 'Keterangan gambar 1' }).fill('Hadiah');
  await admin.getByRole('textbox', { name: 'Keterangan gambar 2' }).fill('Juri');
  await admin.getByRole('button', { name: 'Naikkan gambar 2' }).click();
  await expect(admin.getByRole('textbox', { name: 'Keterangan gambar 1' })).toHaveValue('Juri');
  await admin.getByRole('button', { name: 'Buat acara' }).click();
  await expect(admin).toHaveURL(/\/penyelenggara\/acara\/[^/]+\/formulir\?notice=internal_event_created/);
  const studio = admin.url().split('?')[0]!;

  // 2. Penyusun: Status tim dari templat Lomba tim; tambah cepat; seret ke atas; pratinjau.
  await expect(admin.getByRole('button', { name: /^Pertanyaan \d+: Status tim/ })).toBeVisible();
  await expect(admin.getByRole('button', { name: /Status tim \+ cari partner/ })).toBeDisabled();
  await admin.getByRole('button', { name: 'Ukuran kaos' }).click();
  await expect(admin.getByRole('button', { name: /^Pertanyaan \d+: / }).last()).toHaveAccessibleName(/^Pertanyaan \d+: Ukuran kaos/);

  // Seret (tetikus) ke atas kartu ke-7: kartu yang lebih jauh ditangani gulir otomatis di tepi layar.
  const grip = admin.getByRole('button', { name: /^Seret untuk memindah “Ukuran kaos”/ });
  const seventh = admin.getByRole('button', { name: /^Pertanyaan 7: / });
  // Tengah layar: gulir otomatis di tepi tidak ikut campur dalam pengukuran tes.
  await grip.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const from = (await grip.boundingBox())!;
  const to = (await seventh.boundingBox())!;
  await admin.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await admin.mouse.down();
  await admin.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 12 });
  await admin.mouse.up();
  await expect(admin.getByRole('button', { name: /^Pertanyaan 7: Ukuran kaos/ })).toBeVisible();

  // Keyboard: panah atas di pegangan menaikkannya satu langkah, fokus tetap di pegangan.
  await admin.getByRole('button', { name: /^Seret untuk memindah “Ukuran kaos”/ }).focus();
  await admin.keyboard.press('ArrowUp');
  await expect(admin.getByRole('button', { name: /^Pertanyaan 6: Ukuran kaos/ })).toBeVisible();
  await expect(admin.getByRole('button', { name: /^Seret untuk memindah “Ukuran kaos”/ })).toBeFocused();

  // "Urutan" di pertanyaan yang dibuka (pembaca layar di ponsel): langsung ke urutan 2.
  await admin.getByRole('button', { name: /^Pertanyaan 6: Ukuran kaos/ }).click();
  await admin.getByRole('combobox', { name: 'Urutan' }).selectOption({ label: '2 dari 10' });
  await expect(admin.getByRole('button', { name: /^Pertanyaan 2: Ukuran kaos/ })).toBeVisible();

  await admin.getByRole('button', { name: 'Pratinjau', exact: true }).click();
  await expect(admin.getByRole('radio', { name: 'Belum punya tim — bantu carikan partner' })).toBeDisabled();
  await admin.getByRole('button', { name: 'Sunting', exact: true }).click();

  await admin.getByRole('switch', { name: /Terima pendaftaran lewat StudentFo/ }).check();
  await admin.getByRole('button', { name: 'Simpan formulir' }).click();
  await expect(admin).toHaveURL(/notice=registration_form_saved/);
  await expect(admin.getByText('Siap dibuka?')).toBeVisible();
  await expect(admin.getByText(/3 gambar di halaman acara/)).toBeVisible();

  // Galeri: urutan & keterangan sesuai yang disusun, lalu digeser dari studio.
  await admin.goto(`${studio.replace(/\/formulir$/, '')}/galeri`);
  await expect(admin.getByText('Slide 2')).toBeVisible();
  await expect(admin.locator('li', { hasText: 'Slide 2' }).getByText('Juri')).toBeVisible();
  await admin.getByRole('button', { name: 'Geser slide ke-3 ke depan' }).click();
  await expect(admin).toHaveURL(/notice=photos_reordered/);
  await expect(admin.locator('li', { hasText: 'Slide 2' }).getByText('Hadiah')).toBeVisible();
  await adminContext.close();

  // 3. Peserta tanpa tim.
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInAsDemo(student, 'Mahasiswa', '/events');
  await student.goto(`/events?q=${encodeURIComponent(title)}`);
  const href = await student.locator('a[href^="/events/"]', { hasText: title }).first().getAttribute('href');
  expect(href).toMatch(/^\/events\/[^/?]+$/);
  await student.goto(href!);
  // Keterangan slide aktif terbaca tanpa layar penuh; urutan pilihan admin.
  await expect(student.getByRole('img', { name: 'Hadiah (foto 2)' })).toBeAttached();
  await expect(student.getByRole('img', { name: 'Juri (foto 3)' })).toBeAttached();

  await student.goto(`${href}/formulir`);
  await expect(student.getByText(/pertanyaan\s+wajib terisi/)).toBeVisible();
  const seeking = student.getByRole('radio', { name: 'Belum punya tim — bantu carikan partner' });
  const assist = student.getByRole('link', { name: /Cari partner yang cocok/ });
  await expect(assist).toBeHidden();
  await seeking.check();
  await expect(assist).toBeVisible();
  await expect(assist).toHaveAttribute('target', '_blank');

  await student.getByLabel(/^Jumlah anggota/).selectOption('1');
  await student.getByLabel(/^Nama & asal sekolah\/kampus tiap anggota/).fill('Saya sendiri — Universitas Contoh');
  await student.getByLabel(/^Nomor WhatsApp ketua/).fill('081234567890');
  await student.getByRole('checkbox', { name: /menyetujui ketentuan lomba/ }).check();
  await student.getByRole('checkbox', { name: /Data di formulir ini dibagikan/ }).check();
  await student.getByRole('button', { name: 'Kirim pendaftaran' }).click();
  await expect(student).toHaveURL(/\/pembayaran\/[^?]+\?notice=registration_confirmed/);

  const next = student.getByRole('region', { name: 'Langkah berikutnya' });
  await expect(next.getByRole('link', { name: /Cari partner yang cocok/ })).toHaveAttribute('href', '/teams/cocok');
  const lobby = next.getByRole('link', { name: /Masuk lobi/ });
  await expect(lobby).toHaveAttribute('href', /\/lobi\/[^?]+\?niat=CARI_TIM$/);
  await lobby.click();
  await expect(student.getByRole('radio', { name: /^Mencari tim/ })).toBeChecked();
  await studentContext.close();
});

test('kiriman /submit membawa slide berketerangan; moderator menilainya sebelum tayang', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama');
  test.setTimeout(90_000);
  const title = `Lomba Kiriman Bergambar ${Date.now()}`;
  const octet = () => Math.floor(Math.random() * 250) + 1;
  const senderContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` } });
  const sender = await senderContext.newPage();
  await signInAsDemo(sender, 'Mahasiswa', '/submit');
  await expect(sender.getByRole('navigation', { name: 'Langkah mengirim kegiatan' })).toBeVisible();
  await sender.getByLabel('Judul kegiatan').fill(title);
  await sender.getByLabel('Penyelenggara', { exact: true }).fill('Panitia Bergambar');
  await sender.getByLabel('Jenis kegiatan').selectOption('LOMBA');
  await sender.getByLabel('Tautan pendaftaran').fill(`https://contoh.example/bergambar-${Date.now()}`);
  await sender.getByLabel(/^Deskripsi/).fill('Tema: energi bersih. Hadiah total Rp5 juta.');
  await sender.getByLabel('Tenggat pendaftaran').fill(inDays(20));
  await sender.getByRole('checkbox', { name: 'D4/S1' }).check();
  // Email sendiri: batas 3 kiriman/jam per email dibagi dengan tes lain yang memakai persona yang sama.
  await sender.getByLabel('Email kamu').fill(`slide.${Date.now()}@contoh.example`);
  await sender.locator('#slides').setInputFiles([png(4, 'alur.png'), png(5, 'linimasa.png')]);
  await sender.getByRole('textbox', { name: 'Keterangan gambar 1' }).fill('Alur pendaftaran');
  await sender.getByRole('button', { name: 'Lepas gambar 2' }).click();
  await expect(sender.getByText('1 gambar siap dikirim.')).toBeAttached();
  await sender.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
  await expect(sender).toHaveURL(/notice=submission_received$/);
  await senderContext.close();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsDemo(admin, 'Admin moderator', '/admin');
  const card = admin.getByRole('listitem').filter({ has: admin.getByRole('heading', { name: title }) });
  await expect(card.getByText('Slide penjelas (1)')).toBeVisible();
  const slide = card.getByRole('img', { name: /Slide 1 kiriman .*: Alur pendaftaran/ });
  await slide.scrollIntoViewIfNeeded();
  await expect(slide).toBeVisible();
  // Gambar yang belum tayang benar-benar tersaji untuk moderator, bukan gambar rusak.
  await expect.poll(() => slide.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await adminContext.close();
});

test('axe: penyusun formulir (sunting & pratinjau) dan halaman kirim kegiatan', async ({ page }) => {
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  await signInAsDemo(page, 'Penyelenggara', '/penyelenggara/acara/e1000000-0000-4000-8000-000000000001/formulir');
  await page.getByRole('button', { name: /^Pertanyaan 1: / }).click();
  expect((await scan()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Pratinjau', exact: true }).click();
  expect((await scan()).violations).toEqual([]);
  await page.goto('/submit');
  expect((await scan()).violations).toEqual([]);
});
