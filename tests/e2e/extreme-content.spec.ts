import { expect, test, type Browser, type Page } from '@playwright/test';
import { confirmDialog, signInAsDemo } from './helpers';

/**
 * Konten terburuk yang masih LOLOS validasi: judul & penyelenggara 255
 * karakter (batas form & kolom VARCHAR) dengan satu "kata" panjang tanpa
 * spasi — tagar, singkatan berantai, atau URL yang ditempel apa adanya oleh
 * pengirim/scraper. Data seed paling panjang hanya ±55 karakter, jadi tanpa
 * tes ini tata letak hanya pernah diuji dengan konten yang sopan.
 *
 * Kegiatan dibuat lewat alur sungguhan (kirim → moderator menyetujui), lalu
 * setiap halaman yang menampilkannya diukur di 320px: tidak boleh ada geser
 * horizontal maupun teks yang meluber dari layar.
 */

test.describe.configure({ mode: 'serial' });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'terang', 'viewport diatur sendiri & mengubah data demo bersama; cukup satu proyek');
});

const token = `ekstrem${Date.now().toString(36)}`;
/** 72 karakter tanpa spasi — lebih lebar dari layar 320px pada ukuran huruf mana pun di aplikasi. */
const UNBROKEN = '#InovasiTeknologiBerkelanjutanUntukIndonesiaEmasDuaRibuEmpatPuluhLimaYa';
const pad = (text: string, length: number) => (text + ' Tingkat Nasional Terbuka untuk Seluruh Pelajar Indonesia'.repeat(6)).slice(0, length).trimEnd();
const TITLE = pad(`Lomba ${token} Karya Tulis Ilmiah ${UNBROKEN} Pekan Ilmiah Mahasiswa Fakultas Teknik Tahun 2026`, 255);
const ORGANIZER = pad(`BadanEksekutifMahasiswaKeluargaMahasiswaInstitutTeknologi ${token} Himpunan Mahasiswa`, 255);
const TEAM_TITLE = pad(`Cari anggota ${UNBROKEN} untuk tim karya tulis`, 255);
const POST_TITLE = pad(`Tanya ${UNBROKEN} tentang syarat`, 120);

const octet = () => Math.floor(Math.random() * 250) + 1;
const freshIp = () => ({ extraHTTPHeaders: { 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` } });

async function overflowOf(page: Page): Promise<{ page: number; offenders: string[] }> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // Konten di dalam wadah yang memotong/menggulir (deretan chip, `truncate`, `line-clamp`) tidak terlihat
    // meluber selama wadahnya sendiri muat — yang dinilai wadahnya.
    // Dicek sampai ke atas: teks `sr-only` (pemotong 1px) di tab yang tergulir keluar layar tetap aman
    // selama bilah tab pembungkusnya (`overflow-x-auto`) muat.
    const clippedInside = (node: Node) => {
      for (let element = node.parentElement; element && element !== document.body; element = element.parentElement) {
        if (getComputedStyle(element).overflowX !== 'visible' && element.getBoundingClientRect().right <= width + 1) return true;
      }
      return false;
    };
    const offenders: string[] = [];
    for (const node of document.querySelectorAll('body *')) {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.right <= width + 1 || getComputedStyle(node).position === 'fixed') continue;
      if (node.closest('[aria-hidden="true"], .skip-link') || clippedInside(node)) continue;
      offenders.push(`${node.tagName.toLowerCase()}.${String(node.getAttribute('class') ?? '').split(' ').slice(0, 3).join('.')} → ${Math.round(box.right - width)}px`);
      if (offenders.length >= 5) break;
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode() && offenders.length < 8) {
      const text = walker.currentNode;
      const parent = text.parentElement;
      if (!parent || !text.textContent?.trim() || parent.closest('[aria-hidden="true"], .skip-link') || clippedInside(text)) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      const right = Math.max(0, ...[...range.getClientRects()].map((rect) => rect.right));
      if (right > width + 1) offenders.push(`teks "${(text.textContent ?? '').trim().slice(0, 40)}" di <${parent.tagName.toLowerCase()}> → ${Math.round(right - width)}px`);
    }
    return { page: document.documentElement.scrollWidth - width, offenders };
  });
}

/** `soft`: satu kali jalan memetakan SEMUA halaman yang meluber, bukan berhenti di yang pertama. */
async function expectNoOverflow(page: Page, label: string) {
  const result = await overflowOf(page);
  expect.soft(result, `${label}: ${JSON.stringify(result.offenders)}`).toEqual({ page: 0, offenders: [] });
}

async function narrowMember(browser: Browser, next: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true, ...freshIp() });
  const page = await context.newPage();
  await signInAsDemo(page, 'Mahasiswa', next);
  return page;
}

let eventPath = '';

test('kirim kegiatan berjudul 255 karakter → antrean moderator tetap rapi di 320px → disetujui', async ({ browser }) => {
  test.setTimeout(90_000);
  const sender = await narrowMember(browser, '/submit');
  await sender.getByLabel('Judul kegiatan').fill(TITLE);
  await sender.getByLabel('Penyelenggara', { exact: true }).fill(ORGANIZER);
  await sender.getByLabel('Jenis kegiatan').selectOption('LOMBA');
  await sender.getByLabel('Tautan pendaftaran').fill(`https://contoh.example/${token}/${'segmen-panjang-'.repeat(8)}daftar`);
  await sender.getByLabel('Tenggat pendaftaran').fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
  await sender.getByRole('checkbox', { name: 'D4/S1' }).check();
  await sender.getByRole('button', { name: 'Kirim untuk diverifikasi' }).click();
  await expect(sender).toHaveURL(/notice=submission_received$/);
  await expectNoOverflow(sender, '/submit (Kirimanmu)');

  const adminContext = await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true });
  const admin = await adminContext.newPage();
  await signInAsDemo(admin, 'Admin moderator', '/admin');
  const card = admin.getByRole('listitem').filter({ has: admin.getByRole('heading', { name: TITLE }) });
  await expect(card).toHaveCount(1);
  await expectNoOverflow(admin, '/admin (antrean)');
  await card.getByRole('button', { name: /Setujui/ }).click();
  await confirmDialog(admin, 'Ya, tayangkan');
  await expect(card).toHaveCount(0);

  await admin.goto(`/events?q=${token}`);
  await admin.getByRole('link', { name: TITLE, exact: true }).first().click();
  await expect(admin).toHaveURL(/\/events\/lomba-ekstrem/);
  eventPath = new URL(admin.url()).pathname;
  await Promise.all([sender.context().close(), adminContext.close()]);
});

test('katalog, detail, tracker, tim & Komunitas tidak meluber di 320px', async ({ browser }) => {
  test.skip(!eventPath, 'butuh kegiatan dari tes sebelumnya');
  // ±15 halaman dinamis + tiga form dalam satu alur.
  test.setTimeout(180_000);
  const slug = eventPath.split('/').pop()!;
  const page = await narrowMember(browser, `/events?q=${token}`);
  await expect(page.getByRole('link', { name: TITLE, exact: true }).first()).toBeVisible();
  await expectNoOverflow(page, '/events?q=');
  // Papan per jenis (ADR-039) punya tata letak sendiri, terpisah dari kartu umum.
  await page.goto(`/events?type=LOMBA&q=${token}`);
  await expect(page.getByRole('link', { name: TITLE, exact: true }).first()).toBeVisible();
  await expectNoOverflow(page, '/events?type=LOMBA&q=');

  for (const tab of ['', '?tab=tanya', '?tab=penyelenggara']) {
    await page.goto(`${eventPath}${tab}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(token);
    await expectNoOverflow(page, `${eventPath}${tab}`);
  }

  await page.goto(eventPath);
  await page.getByRole('button', { name: 'Simpan ke Tracker' }).click();
  await expect(page.getByRole('button', { name: 'Tersimpan di Tracker' })).toBeVisible();
  for (const route of ['/tracker', `/tracker/${slug}`, `${eventPath}/persiapan`, '/profile']) {
    await page.goto(route);
    await expectNoOverflow(page, route);
  }

  await page.goto(`/teams/baru?kegiatan=${slug}`);
  await page.getByLabel('Judul tim').fill(TEAM_TITLE);
  await page.getByRole('button', { name: 'Buka tim' }).click();
  await expect(page).toHaveURL(/\/teams\/[^/?]+\?notice=team_created$/);
  await expectNoOverflow(page, 'detail tim');
  for (const route of ['/teams', `/teams?kegiatan=${slug}`, `/lobi/${slug}`]) {
    await page.goto(route);
    await expectNoOverflow(page, route);
  }

  await page.goto(`/komunitas/baru?kegiatan=${slug}`);
  await expectNoOverflow(page, '/komunitas/baru?kegiatan=');
  await page.getByLabel('Judul').fill(POST_TITLE);
  await page.getByLabel('Isi').fill(`Ada yang tahu ${UNBROKEN} ini boleh lintas kampus? ${token}`);
  await page.getByRole('button', { name: 'Terbitkan' }).click();
  await expect(page).toHaveURL(/\/komunitas\/[0-9a-f-]{36}\?notice=community_post_created$/);
  await expectNoOverflow(page, 'utas Komunitas');
  for (const route of ['/komunitas', `/komunitas?kegiatan=${slug}`]) {
    await page.goto(route);
    await expectNoOverflow(page, route);
  }
  await page.context().close();
});

test('tamu: gerbang anggota dengan judul 255 karakter tetap rapi di 320px', async ({ browser }) => {
  test.skip(!eventPath, 'butuh kegiatan dari tes pertama');
  const context = await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  for (const route of [`/events?q=${token}`, eventPath, `${eventPath}?tab=tanya`]) {
    await page.goto(route);
    await expectNoOverflow(page, `tamu ${route}`);
  }
  await context.close();
});
