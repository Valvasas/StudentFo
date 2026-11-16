import { expect, test, type Page } from '@playwright/test';
import { confirmDialog, signInAsDemo } from './helpers';

/**
 * Interaksi & perawatan postingan (ADR-092) di browser sungguhan: suka
 * (tombol toggle), komentar (kontak ditolak, hapus, gerbang tamu), menu
 * Bagikan tanpa pelacak + kirim ke koneksi, "Lagi ramai", dan lomba mandiri
 * berformulir StudentFo dari kiriman sampai Ringkasan jawaban & hapus postingan.
 */

// Kegiatan contoh bertautan luar yang tidak dipakai tes lain untuk suka/komentar.
const EVENT = '/events/festival-film-pendek-pelajar-nusantara';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'mengubah data demo bersama; cukup satu proyek');
});

const likeButton = (page: Page) => page.getByRole('button', { name: /^Suka, \d/ });
const likeCount = async (page: Page) => Number((await likeButton(page).getAttribute('aria-label'))?.match(/^Suka, ([\d.]+)/)?.[1]?.replace(/\./g, ''));

test('suka: toggle ber-aria-pressed, angka ikut berubah, tersimpan setelah dimuat ulang', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', EVENT);
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
  const before = await likeCount(page);

  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(likeButton(page)).toHaveAttribute('aria-label', `Suka, ${(before + 1).toLocaleString('id-ID')} orang menyukai`);
  await page.reload();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');

  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  expect(await likeCount(page)).toBe(before);
});

test('komentar: nomor HP ditolak, terkirim, dihapus sendiri; tamu hanya melihat gerbang', async ({ page, browser }) => {
  await signInAsDemo(page, 'Mahasiswa', `${EVENT}?tab=komentar`);
  await page.getByRole('textbox', { name: 'Tulis komentar' }).fill('Hubungi aku di 081234567890 ya');
  await page.getByRole('button', { name: 'Kirim komentar' }).click();
  await expect(page).toHaveURL(/error=community_contact_blocked/);

  const text = `Ada yang mau satu tim dari Bandung? ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Tulis komentar' }).fill(text);
  await page.getByRole('button', { name: 'Kirim komentar' }).click();
  await expect(page).toHaveURL(/notice=comment_sent/);
  const item = page.getByRole('listitem').filter({ hasText: text });
  await expect(item).toBeVisible();
  // Komentar sendiri: Hapus, bukan Laporkan.
  await expect(item.getByText('Laporkan', { exact: false })).toHaveCount(0);

  const guest = await browser.newPage();
  await guest.goto(`${EVENT}?tab=komentar`);
  await expect(guest.getByRole('heading', { name: 'Komentar khusus anggota' })).toBeVisible();
  await expect(guest.getByText(text)).toHaveCount(0);
  await guest.close();

  await item.getByRole('button', { name: /Hapus komentarmu/ }).click();
  await confirmDialog(page, 'Ya, hapus');
  await expect(page).toHaveURL(/notice=comment_deleted/);
  await expect(page.getByText(text)).toHaveCount(0);
});

test('Bagikan: tautan kanonis tanpa pelacak, Escape menutup; kirim ke koneksi lewat lonceng', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', '/connections');
  await page.locator('section[aria-labelledby="ajakan-masuk"]').getByRole('button', { name: /Terima ajakan Rizky Hidayat/ }).click();
  await expect(page).toHaveURL(/notice=connection_accepted/);

  await page.goto(EVENT);
  const summary = page.locator('details[data-popover] > summary', { hasText: 'Bagikan' });
  await summary.click();
  const whatsapp = page.getByRole('link', { name: /^WhatsApp/ });
  await expect(whatsapp).toBeVisible();
  const href = (await whatsapp.getAttribute('href')) ?? '';
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent(href)).toContain(new URL(EVENT, page.url()).href);
  expect(href).not.toMatch(/utm_|fbclid|gclid/);
  await page.keyboard.press('Escape');
  await expect(whatsapp).toBeHidden();

  await summary.click();
  await page.getByRole('link', { name: 'Kirim ke koneksi StudentFo' }).click();
  await expect(page).toHaveURL(`${EVENT}/bagikan`);
  await page.getByRole('checkbox', { name: /Rizky Hidayat/ }).check();
  await page.getByRole('button', { name: /Kirim ke koneksi terpilih/ }).click();
  await expect(page).toHaveURL(new RegExp(`${EVENT}\\?notice=event_shared`));
});

test('Lagi ramai: urutan sendiri yang berbentuk URL, beranda tamu memberi peringkat', async ({ page }) => {
  await page.goto('/events?sort=popular');
  await expect(page.locator('details[data-popover] > summary', { hasText: 'Urutkan: Lagi ramai' })).toBeVisible();
  await page.goto('/');
  const strip = page.getByRole('region', { name: 'Lagi ramai' });
  await expect(strip).toBeVisible();
  await expect(strip.getByText('Peringkat 1', { exact: false })).toBeAttached();
});

test.describe('lomba mandiri berformulir StudentFo', () => {
  test.describe.configure({ mode: 'serial' });
  const token = `mandiri${Date.now().toString(36)}`;
  const TITLE = `Lomba Desain Poster ${token}`;
  let eventPath = '';

  test('admin mengirim → menyetujui → menyusun formulir dari templat di studio', async ({ page }) => {
    test.setTimeout(90_000);
    await signInAsDemo(page, 'Admin moderator', '/submit');
    await page.getByLabel('Judul kegiatan').fill(TITLE);
    await page.getByLabel('Penyelenggara', { exact: true }).fill('StudentFo');
    await page.getByLabel('Jenis kegiatan').selectOption('LOMBA');
    await page.getByRole('radio', { name: /Lewat formulir di StudentFo/ }).check();
    // Tanpa JavaScript pun kotak tautan disembunyikan (`:has`), dan tidak menahan kiriman.
    await expect(page.getByLabel('Tautan pendaftaran')).toBeHidden();
    await page.getByLabel('Tenggat pendaftaran').fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole('checkbox', { name: 'D4/S1' }).check();
    await page.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
    await expect(page).toHaveURL(/notice=submission_received$/);

    await page.goto('/admin');
    const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: TITLE }) });
    await expect(card.getByText('Formulir StudentFo', { exact: false }).first()).toBeVisible();
    await card.getByRole('button', { name: /Setujui/ }).click();
    await confirmDialog(page, 'Ya, tayangkan');
    await expect(card).toHaveCount(0);

    await page.goto(`/events?q=${token}`);
    await page.getByRole('link', { name: TITLE, exact: true }).first().click();
    await expect(page).toHaveURL(/\/events\/lomba-desain-poster-mandiri/);
    eventPath = new URL(page.url()).pathname;
    await expect(page.getByText('Pendaftaran lewat formulir StudentFo segera dibuka.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Daftar sekarang/ })).toHaveCount(0);

    await page.getByRole('region', { name: 'Alat moderator' }).getByRole('link', { name: 'Formulir & pendaftar' }).click();
    await expect(page).toHaveURL(/\/penyelenggara\/acara\/[0-9a-f-]{36}\/formulir$/);
    await expect(page.getByText('Mode admin', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Hanya lewat StudentFo/ })).toBeChecked();

    const asal = page.getByRole('button', { name: /^Pertanyaan \d+: Asal sekolah \/ kampus/ });
    await expect(asal).toHaveCount(1);
    await page.getByRole('button', { name: 'Pakai templat' }).click();
    await page.getByRole('button', { name: /^Lomba individu/ }).click();
    // Formulir baru yang belum disentuh: templat MENGGANTI kolom awal — tidak ada pertanyaan ganda.
    await expect(page.getByRole('button', { name: /^Pertanyaan \d+: Jenjang pendidikan/ })).toBeVisible();
    await expect(asal).toHaveCount(1);
    // Dipakai lagi: semuanya sudah ada, tidak ada yang digandakan.
    await page.getByRole('button', { name: 'Pakai templat' }).click();
    await page.getByRole('button', { name: /^Lomba individu/ }).click();
    await expect(page.getByText(/Semua kolom templat “Lomba individu” sudah ada/)).toBeAttached();
    await expect(asal).toHaveCount(1);
    await page.getByRole('switch', { name: /Terima pendaftaran lewat StudentFo/ }).check();
    await page.getByRole('button', { name: 'Simpan formulir' }).click();
    await expect(page).toHaveURL(/notice=registration_form_saved/);
  });

  test('peserta: Daftar → pendataan singkat → formulir StudentFo; admin melihat Ringkasan jawaban', async ({ page, browser }) => {
    test.skip(!eventPath, 'butuh kegiatan dari tes sebelumnya');
    test.setTimeout(90_000);
    await signInAsDemo(page, 'Mahasiswa', eventPath);
    await page.getByRole('link', { name: /Daftar sekarang/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`${eventPath}/sebelum-daftar$`));
    await expect(page.getByRole('button', { name: /Lanjut ke formulir pendaftaran/ })).toBeVisible();
    await page.getByRole('button', { name: 'Lewati' }).click();
    await expect(page).toHaveURL(new RegExp(`${eventPath}/formulir$`));

    await page.getByRole('textbox', { name: 'Asal sekolah / kampus' }).fill('Universitas Contoh');
    await page.getByLabel(/^Jenjang pendidikan/).selectOption('D4/S1');
    await page.getByLabel(/^Nomor WhatsApp/).fill('081234567890');
    await page.getByRole('checkbox', { name: /menyetujui ketentuan lomba/ }).check();
    await page.getByRole('checkbox', { name: /Data di formulir ini dibagikan/ }).check();
    await page.getByRole('button', { name: 'Kirim pendaftaran' }).click();
    await expect(page).toHaveURL(/notice=registration_/);

    const admin = await (await browser.newContext()).newPage();
    await signInAsDemo(admin, 'Admin moderator', eventPath);
    await admin.getByRole('region', { name: 'Alat moderator' }).getByRole('link', { name: 'Formulir & pendaftar' }).click();
    await expect(admin).toHaveURL(/\/penyelenggara\/acara\/[0-9a-f-]{36}\/formulir$/);
    await admin.goto(admin.url().replace(/\/formulir$/, '/pendaftar'));
    await admin.getByRole('navigation', { name: 'Tampilan jawaban' }).getByRole('link', { name: 'Ringkasan jawaban' }).click();
    await expect(admin).toHaveURL(/\/pendaftar\?tampilan=ringkasan$/);
    const level = admin.getByRole('region', { name: 'Jenjang pendidikan' });
    await expect(level.getByText('1 dari 1 menjawab', { exact: false })).toBeVisible();
    await expect(level.getByRole('listitem').filter({ hasText: 'D4/S1' })).toContainText('100%');
    // Nomor telepon tidak dipajang ulang di ringkasan.
    await expect(admin.getByRole('region', { name: /^Nomor WhatsApp/ }).getByText('081234567890')).toHaveCount(0);
    await admin.context().close();
  });

  test('admin menghapus postingan sebelum tenggat → hilang untuk publik → Urungkan; hapus permanen ditolak selama ada pendaftar', async ({ page, browser }) => {
    test.skip(!eventPath, 'butuh kegiatan dari tes pertama');
    await signInAsDemo(page, 'Admin moderator', eventPath);
    const tools = page.getByRole('region', { name: 'Alat moderator' });
    await tools.locator('summary', { hasText: 'Hapus postingan' }).click();
    await tools.getByRole('radio', { name: 'Salah posting / data keliru' }).check();
    await tools.getByRole('button', { name: 'Ya, hapus dari katalog' }).click();
    await expect(page).toHaveURL(/\/admin\/acara\?.*notice=event_taken_down/);
    await expect(page.getByRole('button', { name: /^Urungkan/ })).toBeVisible();

    const guest = await browser.newContext();
    expect((await guest.request.get(eventPath)).status()).toBe(404);

    // Hapus permanen: frasa wajib, lalu ditolak karena masih ada pendaftar aktif.
    const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: TITLE }) });
    await row.locator('summary', { hasText: 'Hapus permanen' }).click();
    await row.getByLabel(/Ketik HAPUS/).fill('hapus');
    await row.getByRole('button', { name: 'Hapus permanen', exact: true }).click();
    await expect(page).toHaveURL(/error=event_has_registrations/);

    await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: TITLE }) }).getByRole('button', { name: /^Tayangkan lagi/ }).click();
    await expect(page).toHaveURL(/notice=event_restored/);
    expect((await guest.request.get(eventPath)).status()).toBe(200);
    await guest.close();
  });
});
