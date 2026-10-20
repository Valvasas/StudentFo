import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInAsDemo } from './helpers';

/**
 * Pencocokan tim (ADR-057), alur nyata di peramban. Data contoh dipakai
 * bersama semua tes yang berjalan paralel (tiap tes membuat kartunya sendiri
 * lewat akun Mahasiswa baru), jadi tidak ada tes yang bergantung pada
 * himpunan kandidat yang persis — hanya pada sifat hasilnya.
 */
const PAGE = '/teams/cocok';

async function openCard(page: Page, options: { seeking?: string[]; city?: string; skills?: string[] } = {}): Promise<void> {
  await signInAsDemo(page, 'Mahasiswa', PAGE);
  for (const slug of options.skills ?? ['web-aplikasi']) await page.locator(`input[name=skills][value=${slug}]`).check();
  for (const slug of options.seeking ?? ['ui-ux']) await page.locator(`input[name=seeking][value=${slug}]`).check();
  await page.getByLabel('Kota', { exact: true }).selectOption(options.city ?? 'Bandung');
  await page.getByRole('button', { name: /Simpan & mulai mencari/ }).click();
  await expect(page.getByRole('heading', { name: 'Pasangan timmu', level: 1 })).toBeVisible();
}

test('tamu dialihkan ke halaman masuk dengan tujuan kembali', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page).toHaveURL(/\/login\?next=%2Fteams%2Fcocok/);
});

test('kartu belum ada: tampil form, belum ada hasil', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', PAGE);
  await expect(page.getByRole('heading', { name: 'Cocokkan tim otomatis', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Simpan & mulai mencari/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toHaveCount(0);
});

test('isi kartu → hasil berperingkat: yang membawa keahlian dicari di puncak, dengan alasan & skor', async ({ page }) => {
  await openCard(page);
  await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeVisible();

  const featured = page.locator('article').first();
  await expect(featured.getByRole('img', { name: /^Kecocokan \d+ persen$/ })).toBeVisible();
  await expect(featured.getByRole('list', { name: 'Keahlian' })).toContainText('Desain UI/UX');
  await expect(featured.getByText('Kenapa cocok')).toBeVisible();

  // Skor menurun dari kartu pertama ke kartu terakhir.
  const scores = await page.getByRole('img', { name: /^Kecocokan \d+ persen$/ }).evaluateAll((nodes) =>
    nodes.map((node) => Number(/(\d+)/.exec(node.getAttribute('aria-label') ?? '')?.[1])),
  );
  expect(scores.length).toBeGreaterThan(1);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
});

test('privasi: tidak ada email atau alamat di halaman hasil', async ({ page }) => {
  await openCard(page);
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/@/);
  expect(await page.content()).not.toMatch(/nusantara\.test|demo\.studentfo/);
});

test('kartu tertutup tidak bisa mencari: kembali ke form', async ({ page }) => {
  await openCard(page);
  await page.getByRole('button', { name: 'Tutup kartu' }).click();
  await expect(page.getByRole('heading', { name: 'Cocokkan tim otomatis', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toHaveCount(0);
});

test('validasi server: membuka kartu tanpa keahlian ditolak dengan petunjuk di kolomnya', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', PAGE);
  await page.getByLabel('Kota', { exact: true }).selectOption('Bandung');
  await page.getByRole('button', { name: /Simpan & mulai mencari/ }).click();
  await expect(page).toHaveURL(/error=invalid_seeker_profile/);
  await expect(page.getByText('Pilih minimal satu keahlian untuk membuka kartu.')).toBeVisible();
});

test('batas enam keahlian: pilihan ketujuh dinonaktifkan', async ({ page }) => {
  await signInAsDemo(page, 'Mahasiswa', PAGE);
  const slugs = ['web-aplikasi', 'data-ai', 'iot-elektronika', 'ui-ux', 'grafis', 'video'];
  for (const slug of slugs) await page.locator(`input[name=skills][value=${slug}]`).check();
  await expect(page.locator('input[name=skills][value=manajemen-proyek]')).toBeDisabled();
  await expect(page.getByText('6 dari 6 dipilih').first()).toBeVisible();
});

test.describe('saringan = URL', () => {
  test('jarak ≤ 25 km tanpa daring: hanya yang satu kota atau kota tetangga', async ({ page }) => {
    // Persona demo (Bandung) sudah terhubung dengan dua orang Bandung; kandidat dekat lainnya
    // adalah orang contoh (Arif di Bandung, Yoga di Cimahi). Store demo hanya mencalonkan orang
    // contoh, jadi hasilnya persis dua dan tidak bergantung pada tes lain yang berjalan paralel.
    await signInAsDemo(page, 'Mahasiswa', PAGE);
    await page.locator('input[name=skills][value=web-aplikasi]').check();
    await page.locator('input[name=seeking][value=ui-ux]').check();
    await page.getByLabel('Kota', { exact: true }).selectOption('Bandung');
    await page.getByRole('button', { name: /Simpan & mulai mencari/ }).click();
    await expect(page.getByRole('heading', { name: 'Pasangan timmu', level: 1 })).toBeVisible();

    await page.goto(`${PAGE}?jarak=25&daring=0&cari=1`);
    const cards = page.locator('article');
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: 'Arif Setiawan' })).toContainText('Satu kota');
    const yoga = cards.filter({ hasText: 'Yoga Pratama' });
    await expect(yoga).toContainText('Cimahi');
    await expect(yoga).toContainText('Berdekatan');
    await expect(yoga).not.toContainText('Satu kota');
  });

  test('keahlian wajib: setiap kartu memuat keahlian itu', async ({ page }) => {
    await openCard(page);
    await page.goto(`${PAGE}?keahlian=hukum-kebijakan`);
    const cards = page.locator('article');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const card of await cards.all()) await expect(card.getByRole('list', { name: 'Keahlian' })).toContainText('Hukum & kebijakan');
  });

  test('"Pernah juara": setiap kartu memuat capaian juara, dan hasilnya tidak kosong di data contoh', async ({ page }) => {
    await openCard(page);
    await page.goto(`${PAGE}?portofolio=juara`);
    const cards = page.locator('article');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    for (const card of await cards.all()) await expect(card).toContainText(/terbaik Juara/);
  });

  test('saringan terlalu ketat: keadaan kosong yang menawarkan jalan keluar', async ({ page }) => {
    await openCard(page);
    await page.goto(`${PAGE}?jarak=25&daring=0&portofolio=juara&keahlian=hukum-kebijakan&jenjang=sama`);
    await expect(page.getByRole('heading', { name: 'Saringanmu terlalu ketat' })).toBeVisible();
    await page.getByRole('link', { name: 'Hapus semua saringan' }).first().click();
    await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeVisible();
  });

  test('form saringan menulis URL kanonik dan tetap berfungsi', async ({ page }) => {
    await openCard(page);
    await page.getByText('Saring & atur gaya tim').click();
    await page.getByLabel('≤ 100 km').check();
    await page.getByLabel('Sudah punya portofolio').check();
    await page.getByRole('button', { name: 'Cari sekarang' }).click();
    await expect(page).toHaveURL(/jarak=100/);
    await expect(page).toHaveURL(/portofolio=ada/);
    for (const card of await page.locator('article').all()) await expect(card).not.toContainText('Belum ada portofolio publik');
  });

  test('"Tampilkan lebih banyak" menambah kartu dan mempertahankan saringan', async ({ page }) => {
    // Data contoh menyediakan lebih dari satu halaman kandidat bagi persona demo (11 > 6), jadi
    // jalur ini selalu ada. Tes tidak boleh melewatinya diam-diam (dulu begitu, dan tak ketahuan).
    await openCard(page);
    const before = await page.locator('article').count();
    expect(before).toBe(6);
    await page.getByRole('link', { name: /^Tampilkan \d+ lagi$/ }).click();
    await expect(page).toHaveURL(/tampil=12/);
    expect(await page.locator('article').count()).toBeGreaterThan(before);
  });
});

test('ajak jadi partner: kabar hasil tampil dan kartu berubah jadi "terkirim"', async ({ page }) => {
  await openCard(page);
  const target = page.locator('article').filter({ has: page.getByRole('button', { name: 'Ajak jadi partner' }) }).first();
  const name = (await target.getByRole('heading', { level: 3 }).innerText()).trim();
  await target.getByRole('button', { name: 'Ajak jadi partner' }).click();

  await expect(page).toHaveURL(/notice=match_invited/);
  await expect(page.getByText('Ajakan jadi partner terkirim.')).toBeVisible();
  const same = page.locator('article').filter({ has: page.getByRole('heading', { level: 3, name }) });
  await expect(same.getByRole('link', { name: /Ajakan terkirim/ })).toBeVisible();
});

test('lewati: kartu hilang dari halaman dan fokus pindah ke hasil', async ({ page }) => {
  await openCard(page);
  const before = await page.locator('article').count();
  const first = page.locator('article').first();
  await first.getByRole('button', { name: /^Lewati/ }).click();
  await expect(page.locator('article')).toHaveCount(before - 1);
  await expect(page.locator('#hasil-pencocokan')).toBeFocused();
});

test.describe('animasi pemindaian', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('radar tampil dulu, lalu hasil muncul; URL dibersihkan dari cari=1', async ({ page }) => {
    await openCard(page);
    await page.goto(`${PAGE}?cari=1`);
    const overlay = page.locator('.scan-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('.radar-sweep')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeHidden();

    await expect(overlay).toBeHidden({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has('cari'), { timeout: 5000 }).toBe(false);
  });

  test('radar muncul di layar walau form disimpan dari dasar halaman (gulir diatur ulang)', async ({ page }) => {
    await signInAsDemo(page, 'Mahasiswa', PAGE);
    await page.locator('input[name=skills][value=web-aplikasi]').check();
    await page.getByLabel('Kota', { exact: true }).selectOption('Bandung');
    await page.getByRole('button', { name: /Simpan & mulai mencari/ }).click();
    const radar = page.locator('.scan-overlay .radar-sweep');
    await expect(radar).toBeInViewport();
  });
});

test.describe('tanpa JavaScript', () => {
  // Gerak MENYALA: yang dibuktikan di sini justru bahwa pemindaian murni CSS berakhir sendiri.
  test.use({ javaScriptEnabled: false, reducedMotion: 'no-preference' });

  test('pemindaian CSS berakhir sendiri, hasil tampil, dan tidak ada tombol mati', async ({ page, context, browser, baseURL }) => {
    // Masuk & buat kartu dengan JS (login demo dan form butuh sesi), lalu pindahkan sesinya ke konteks tanpa JS.
    const withJs = await browser.newContext({ baseURL: baseURL!, reducedMotion: 'reduce' });
    const setup = await withJs.newPage();
    await openCard(setup);
    await context.addCookies(await withJs.cookies());
    await withJs.close();

    await page.goto(`${PAGE}?cari=1`);
    await expect(page.locator('.scan-overlay')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeVisible({ timeout: 7000 });
    await expect(page.locator('.scan-overlay')).toBeHidden();
    await expect(page.getByRole('button', { name: /^Lewati/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajak jadi partner' }).first()).toBeVisible();
  });
});

test('reduced-motion (bawaan semua tes ini): hasil langsung, tanpa menunggu pemindaian', async ({ page }) => {
  await openCard(page);
  await page.goto(`${PAGE}?cari=1`);
  await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeVisible({ timeout: 1000 });
  await expect(page.locator('.scan-overlay')).toBeHidden();
});

test.describe('layar sempit', () => {
  test.use({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true });
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'terang', 'viewport diatur sendiri; cukup satu proyek');
  });

  const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  test('form dan hasil tanpa geser horizontal di 320px', async ({ page }) => {
    await signInAsDemo(page, 'Mahasiswa', PAGE);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.locator('input[name=skills][value=web-aplikasi]').check();
    await page.getByLabel('Kota', { exact: true }).selectOption('Bandung');
    await page.getByRole('button', { name: /Simpan & mulai mencari/ }).click();
    await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('layar sempit, gerak normal', () => {
  // Proyek menyalakan reduced-motion; di sana sapuan radar tidak berputar dan kebocorannya tak terlihat.
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' });
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'terang', 'viewport diatur sendiri; cukup satu proyek');
  });

  test('selama pemindaian berputar halaman tidak pernah melebar melewati layar', async ({ page }) => {
    await signInAsDemo(page, 'Mahasiswa', PAGE);
    await page.locator('input[name=skills][value=web-aplikasi]').check();
    await page.locator('input[name=seeking][value=ui-ux]').check();
    await page.getByLabel('Kota', { exact: true }).selectOption('Surabaya');
    await page.getByRole('button', { name: /Simpan & mulai mencari/ }).click();

    const widest = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let max = 0;
          const started = performance.now();
          const tick = () => {
            max = Math.max(max, document.documentElement.scrollWidth - document.documentElement.clientWidth);
            if (performance.now() - started > 4500) resolve(max);
            else requestAnimationFrame(tick);
          };
          tick();
        }),
    );
    expect(widest).toBeLessThanOrEqual(0);
  });
});

test('axe: form dan hasil bebas pelanggaran WCAG', async ({ page }) => {
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  const audit = async () => {
    await expect(page).toHaveTitle(/\S/);
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    expect(summary, summary.join('\n')).toEqual([]);
  };
  await signInAsDemo(page, 'Mahasiswa', PAGE);
  await audit();
  await page.locator('input[name=skills][value=web-aplikasi]').check();
  await page.getByLabel('Kota', { exact: true }).selectOption('Bandung');
  await page.getByRole('button', { name: /Simpan & mulai mencari/ }).click();
  await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeVisible();
  await audit();
});
