import { expect, test, type Browser, type Page } from '@playwright/test';
import { confirmDialog, signInAsDemo } from './helpers';

/**
 * Komunitas (ADR-087), sebagai alur nyata antar beberapa akun. Setiap masuk
 * demo = identitas baru yang terisolasi; postingan baru memakai token unik
 * supaya tes paralel tidak saling melihat. Alur cukup satu proyek; tampilan
 * dijaga axe & narrow-viewport.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'alur, bukan tampilan; cukup satu proyek');
});

async function member(browser: Browser, persona: 'Mahasiswa' | 'Siswa baru' | 'Admin moderator', next: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signInAsDemo(page, persona, next);
  return page;
}

async function writePost(page: Page, title: string, body = 'Ada yang tahu apakah lomba ini boleh tim lintas kampus?'): Promise<string> {
  await page.goto('/komunitas/baru');
  await page.getByRole('radio', { name: /Tanya/ }).check();
  await page.getByLabel('Judul').fill(title);
  await page.getByLabel('Isi').fill(body);
  await page.getByRole('button', { name: 'Terbitkan' }).click();
  await expect(page).toHaveURL(/\/komunitas\/[0-9a-f-]{36}\?notice=community_post_created$/);
  return new URL(page.url()).pathname;
}

test('tamu: penjelasan & pintu masuk saja — tidak ada isi percakapan di HTML', async ({ page, request }) => {
  await page.goto('/komunitas');
  await expect(page.getByRole('heading', { level: 1, name: 'Komunitas pelajar pemburu peluang' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Masuk', exact: true }).last()).toHaveAttribute('href', '/login?next=%2Fkomunitas');
  const html = await (await request.get('/komunitas')).text();
  // Judul postingan contoh tidak pernah sampai ke tamu atau mesin pencari.
  expect(html).not.toContain('Esai beasiswa');
  expect(html).not.toContain('Cari 1 programmer');
});

test('anggota menulis → orang lain membalas & menandai bermanfaat → penulis dikabari lewat lonceng', async ({ browser }) => {
  const token = `uji-komunitas-${Date.now()}`;
  const author = await member(browser, 'Mahasiswa', '/komunitas');
  const threadPath = await writePost(author, `Boleh lintas kampus? ${token}`);
  await expect(author.getByText('Postinganmu sudah tampil')).toBeVisible();
  // Tulisan sendiri: hapus, bukan lapor; "bermanfaat" hanya angka.
  await expect(author.locator('#postingan').getByRole('button', { name: /^Hapus/ })).toBeVisible();
  await expect(author.locator('#postingan').getByRole('button', { name: /Bermanfaat/ })).toHaveCount(0);

  const reader = await member(browser, 'Siswa baru', '/komunitas?topik=tanya');
  await reader.getByRole('link', { name: `Boleh lintas kampus? ${token}` }).click();
  await expect(reader).toHaveURL(threadPath);

  const helpful = reader.locator('#postingan').getByRole('button', { name: /Bermanfaat/ });
  await expect(helpful).toHaveAttribute('aria-pressed', 'false');
  await helpful.click();
  await expect(reader.locator('#postingan').getByRole('button', { name: /Bermanfaat/ })).toHaveAttribute('aria-pressed', 'true');

  // Kontak pribadi ditolak dengan pesan jelas, ketikan tidak hilang.
  await reader.getByLabel('Tulis balasan').fill(`Chat aku di 0812 3456 7890 ${token}`);
  await reader.getByRole('button', { name: 'Kirim balasan' }).click();
  await expect(reader).toHaveURL(/error=community_contact_blocked/);
  await expect(reader.getByText(/nomor HP, email, dan tautan WhatsApp/).first()).toBeVisible();
  await expect(reader.getByLabel('Tulis balasan')).toHaveValue(`Chat aku di 0812 3456 7890 ${token}`);

  await reader.getByLabel('Tulis balasan').fill(`Boleh, tahun lalu timku lintas kampus. ${token}`);
  await reader.getByRole('button', { name: 'Kirim balasan' }).click();
  await expect(reader).toHaveURL(/notice=community_reply_sent/);
  await expect(reader.locator('#balasan li').filter({ hasText: token })).toHaveCount(1);

  // Penulis: satu notifikasi yang menaut ke utasnya.
  await author.goto('/');
  await author.locator('summary[aria-label^="Notifikasi"]').first().click();
  const note = author.getByRole('button', { name: new RegExp(`Ada balasan baru di postinganmu "Boleh lintas kampus\\? ${token}"`) });
  await expect(note).toBeVisible();
  await note.click();
  await expect(author).toHaveURL(threadPath);
  await expect(author.locator('#balasan li').filter({ hasText: token }).getByText('Penulis')).toHaveCount(0);

  // Penulis menghapus postingannya: hilang dari lini masa.
  await author.locator('#postingan').getByRole('button', { name: /^Hapus/ }).click();
  await confirmDialog(author, 'Ya, hapus postingan');
  await expect(author).toHaveURL(/\/komunitas\?notice=community_post_deleted$/);
  await expect(author.getByRole('link', { name: `Boleh lintas kampus? ${token}` })).toHaveCount(0);

  await Promise.all([author.context().close(), reader.context().close()]);
});

test('tiga pelapor berbeda menyembunyikan otomatis; moderator mengabaikan → tampil lagi, pelapor dikabari', async ({ browser }) => {
  const token = `uji-lapor-komunitas-${Date.now()}`;
  const author = await member(browser, 'Mahasiswa', '/komunitas');
  const threadPath = await writePost(author, `Promo kelas berbayar ${token}`, 'Ikut kelas persiapan lomba kami, diskon untuk sepuluh pendaftar pertama!');

  const reporters: Page[] = [];
  for (let index = 0; index < 3; index += 1) {
    const reporter = await member(browser, 'Siswa baru', threadPath);
    await reporter.locator('#postingan summary', { hasText: 'Laporkan' }).click();
    await reporter.getByRole('radio', { name: /Spam atau promosi/ }).check();
    await reporter.locator('#postingan').getByRole('button', { name: 'Kirim laporan' }).click();
    await expect(reporter).toHaveURL(/\/komunitas\?notice=report_sent$/);
    reporters.push(reporter);
  }

  // Tersembunyi untuk semua pembaca (404 yang sama dengan "tidak ada").
  const response = await reporters[0]!.goto(threadPath);
  expect(response?.status()).toBe(404);
  await reporters[0]!.goto('/komunitas');
  await expect(reporters[0]!.getByRole('link', { name: `Promo kelas berbayar ${token}` })).toHaveCount(0);

  const admin = await member(browser, 'Admin moderator', '/admin/laporan');
  const card = admin.getByRole('listitem').filter({ hasText: token });
  await expect(card.getByText('3 pelapor')).toBeVisible();
  await expect(card.getByText('Tersembunyi otomatis')).toBeVisible();
  await expect(card.getByText('Spam atau promosi')).toBeVisible();
  await card.getByLabel(/Catatan keputusan/).fill(`Promosi wajar ${token}`);
  await card.getByRole('button', { name: 'Abaikan' }).click();
  await expect(admin).toHaveURL(/notice=report_dismissed/);
  await expect(admin.getByRole('listitem').filter({ hasText: token })).toHaveCount(0);

  await reporters[1]!.goto(threadPath);
  await expect(reporters[1]!.getByRole('heading', { level: 1, name: `Promo kelas berbayar ${token}` })).toBeVisible();
  await reporters[1]!.goto('/');
  await reporters[1]!.locator('summary[aria-label^="Notifikasi"]').first().click();
  await expect(reporters[1]!.getByText(/Laporanmu tentang sebuah tulisan di Komunitas sudah ditinjau/).first()).toBeVisible();
  await expect(reporters[1]!.getByText(`Promosi wajar ${token}`)).toHaveCount(0);

  await Promise.all([author, admin, ...reporters].map((page) => page.context().close()));
});

test('dari halaman kegiatan: diskusi tersaring per kegiatan & postingan baru tertaut ke kegiatannya', async ({ browser }) => {
  const page = await member(browser, 'Mahasiswa', '/events/kompetisi-inovasi-perangkat-lunak-nusantara-2026');
  await page.getByRole('link', { name: 'Diskusikan di Komunitas' }).click();
  await expect(page).toHaveURL('/komunitas?kegiatan=kompetisi-inovasi-perangkat-lunak-nusantara-2026');
  await expect(page.getByRole('link', { name: 'Cari 1 programmer untuk Kompetisi Inovasi Perangkat Lunak' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Esai beasiswa/ })).toHaveCount(0);

  await page.getByRole('link', { name: 'Tulis postingan' }).click();
  await expect(page).toHaveURL('/komunitas/baru?kegiatan=kompetisi-inovasi-perangkat-lunak-nusantara-2026');
  // Dari lomba, topik bawaannya "Cari tim".
  await expect(page.getByRole('radio', { name: /Cari tim/ })).toBeChecked();
  await expect(page.getByText('Kompetisi Inovasi Perangkat Lunak Nusantara 2026', { exact: true })).toBeVisible();
  await page.context().close();
});
