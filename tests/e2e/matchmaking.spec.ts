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

const front = (page: Page) => page.locator('.deck-slot[data-depth="0"]');
const deckLive = (page: Page) => page.locator('.deck[data-live]');

/** Lewati kartu depan sampai yang tampil bisa diajak (kartu yang sudah mengajak kita hanya menawarkan "jawab"). */
async function toInvitable(page: Page): Promise<void> {
  await expect(deckLive(page)).toBeAttached();
  for (let step = 0; step < 6; step += 1) {
    if ((await front(page).getByRole('button', { name: 'Ajak jadi partner' }).count()) > 0) return;
    const before = await page.locator('article').count();
    await front(page).getByRole('button', { name: /^Lewati/ }).click();
    await expect(page.locator('article')).toHaveCount(before - 1);
  }
  throw new Error('tidak ada kartu yang bisa diajak di tumpukan');
}

/** Seret kartu depan dengan mouse dari area non-interaktif (kutipan/isi), `direction` -1 = kiri, 1 = kanan. */
async function dragFront(page: Page, direction: -1 | 1): Promise<void> {
  const grab = front(page).locator('.mc-quote, .mc-body').first();
  // Tengah layar: bilah navigasi lengket di ponsel menutupi bagian atas, dan seretan yang dimulai di bawahnya tak sampai ke kartu.
  await grab.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  const box = await grab.boundingBox();
  if (!box) throw new Error('area seret tidak punya kotak');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 14; step += 1) await page.mouse.move(x + direction * step * 18, y + step, { steps: 2 });
  await page.mouse.up();
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

test('ajak jadi partner: tombol hanya membuka lembar tinjau; ajakan terkirim lewat "Kirim ajakan"', async ({ page }) => {
  await openCard(page);
  await toInvitable(page);
  const card = front(page);
  await expect(card.locator('.mc')).toHaveAttribute('data-face', 'front');
  const name = ((await card.getByRole('heading', { level: 3 }).textContent()) ?? '').trim();
  expect(name).not.toBe('');
  await card.getByRole('button', { name: 'Ajak jadi partner' }).click();

  const sheet = page.getByRole('dialog', { name: new RegExp(`Ajak ${name}`) });
  await expect(sheet).toBeVisible();
  await expect(page).not.toHaveURL(/notice=match_invited/);
  await sheet.getByLabel(/Pesan pengantar/).fill('Halo, ayo satu tim!');
  await sheet.getByRole('button', { name: 'Kirim ajakan' }).click();

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

test.describe('tumpukan kartu (JS hidup)', () => {
  test('mode tumpukan: hanya kartu depan yang bisa dipakai, sisanya inert', async ({ page }) => {
    await openCard(page);
    await expect(page.locator('.deck[data-mode="stack"][data-live]')).toBeVisible();
    await expect(page.locator('article')).toHaveCount(6);
    const inertFlags = await page.locator('article').evaluateAll((nodes) => nodes.map((node) => node.closest('[inert]') !== null));
    expect(inertFlags).toEqual([false, true, true, true, true, true]);
  });

  test('seret kiri = lewati; seret kanan = buka lembar tinjau TANPA mengirim; Urungkan mengembalikan', async ({ page }) => {
    await openCard(page);
    await toInvitable(page);
    const before = await page.locator('article').count();

    await dragFront(page, 1);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).not.toHaveURL(/notice=match_invited/);
    await expect(page.locator('article')).toHaveCount(before);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    await dragFront(page, -1);
    await expect(page.locator('article')).toHaveCount(before - 1);
    await page.getByRole('button', { name: /^Urungkan/ }).click();
    await expect(page.locator('article')).toHaveCount(before);
  });

  test('papan ketik: ↓/↑ membalik, → membuka lembar (Esc menutup, fokus kembali), ← melewati', async ({ page }) => {
    await openCard(page);
    await toInvitable(page);
    const group = page.getByRole('group', { name: 'Kandidat partner, urut dari yang paling cocok' });
    await group.focus();

    await page.keyboard.press('ArrowDown');
    await expect(front(page).locator('.mc')).toHaveAttribute('data-face', 'back');
    await expect(front(page).getByText('Dari mana skornya')).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(front(page).locator('.mc')).toHaveAttribute('data-face', 'front');

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).not.toHaveURL(/notice=match_invited/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(group).toBeFocused();

    const before = await page.locator('article').count();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('article')).toHaveCount(before - 1);
  });

  test('balik kartu: punggung memuat skor & rincian, "Balik ke depan" mengembalikannya', async ({ page }) => {
    await openCard(page);
    await expect(deckLive(page)).toBeAttached();
    const card = front(page);
    // Lewat papan ketik: flap ada di muka depan yang disembunyikan, fokus harus pindah ke ringkasan punggung, bukan jatuh ke <body>.
    await card.getByRole('button', { name: /^Balik kartu/ }).focus();
    await page.keyboard.press('Enter');
    await expect(card.locator('.mc')).toHaveAttribute('data-face', 'back');
    await expect(card.locator('summary.mc-sum')).toBeFocused();
    await expect(card.getByText('Dari mana skornya')).toBeVisible();
    await expect(card.getByText('Skor kecocokan')).toBeVisible();
    await card.locator('summary.mc-sum').click();
    await expect(card.locator('.mc')).toHaveAttribute('data-face', 'front');
  });

  test('lewati bertahan setelah muat ulang (sessionStorage) dan "Kembalikan" memulihkannya', async ({ page }) => {
    await openCard(page);
    await expect(deckLive(page)).toBeAttached();
    // Muat ulang selagi URL masih `cari=1` = pemindaian baru (tumpukan baru); tunggu pemindaian ini selesai.
    await expect.poll(() => new URL(page.url()).searchParams.has('cari')).toBe(false);
    await front(page).getByRole('button', { name: /^Lewati/ }).click();
    await expect(page.locator('article')).toHaveCount(5);

    await page.reload();
    await expect(page.locator('article')).toHaveCount(5);
    await page.getByRole('button', { name: 'Kembalikan semua yang dilewati' }).click();
    await expect(page.locator('article')).toHaveCount(6);
  });

  test('"Semua kartu": semua kartu terbuka & bisa dipakai, pilihan tampilan bertahan setelah muat ulang', async ({ page }) => {
    await openCard(page);
    await expect(deckLive(page)).toBeAttached();
    await page.getByRole('button', { name: 'Semua kartu' }).click();
    await expect(page.locator('.deck[data-mode="grid"]')).toBeVisible();
    await expect(page.locator('article')).toHaveCount(6);
    expect(await page.locator('article').evaluateAll((nodes) => nodes.filter((node) => node.closest('[inert]')).length)).toBe(0);

    await page.reload();
    await expect(page.locator('.deck[data-mode="grid"]')).toBeVisible();
    await page.getByRole('button', { name: 'Tumpukan', exact: true }).click();
    await expect(page.locator('.deck[data-mode="stack"]')).toBeVisible();
  });

  test('tumpukan habis: kartu penutup menawarkan langkah berikutnya dan memulihkan yang dilewati', async ({ page }) => {
    await openCard(page);
    await expect(deckLive(page)).toBeAttached();
    for (let left = 6; left > 0; left -= 1) {
      await front(page).getByRole('button', { name: /^Lewati/ }).click();
      await expect(page.locator('article')).toHaveCount(left - 1);
    }
    await expect(page.getByRole('heading', { name: 'Tumpukan habis' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Tarik \d+ kartu lagi/ })).toBeVisible();
    await page.getByRole('button', { name: /^Kembalikan yang dilewati/ }).click();
    await expect(page.locator('article')).toHaveCount(6);
  });

  test('sentuhan jari: geser kiri melewati kartu (tangkapan implisit sentuhan tidak membatalkan seretan)', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'ponsel', 'butuh emulasi sentuh (Pixel 7)');
    await openCard(page);
    await expect(deckLive(page)).toBeAttached();
    const grab = front(page).locator('.mc-quote, .mc-body').first();
    await grab.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    const box = await grab.boundingBox();
    if (!box) throw new Error('area seret tidak punya kotak');
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 14; step += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 18, y: y + step }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('article')).toHaveCount(5);
  });

  test('"Cari ulang" = tumpukan baru: kartu yang dilewati kembali', async ({ page }) => {
    await openCard(page);
    await expect(deckLive(page)).toBeAttached();
    await front(page).getByRole('button', { name: /^Lewati/ }).click();
    await expect(page.locator('article')).toHaveCount(5);
    await page.getByRole('link', { name: 'Cari ulang' }).click();
    await expect(page.locator('article')).toHaveCount(6);
    await expect(page.getByText(/Dilewati \d/)).toHaveCount(0);
  });

  test('Kembali dari profil kandidat: bukan pemindaian baru — kartu yang dilewati tetap tersembunyi', async ({ page }) => {
    await openCard(page);
    await expect(deckLive(page)).toBeAttached();
    await expect.poll(() => new URL(page.url()).searchParams.has('cari')).toBe(false);
    await front(page).getByRole('button', { name: /^Lewati/ }).click();
    await expect(page.locator('article')).toHaveCount(5);

    await front(page).getByRole('heading', { level: 3 }).getByRole('link').click();
    await expect(page).toHaveURL(/\/orang\//);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeVisible();
    await expect(page.locator('#hasil-pencocokan')).toHaveAttribute('data-scan-done', '');
    await expect(page.locator('article')).toHaveCount(5);
  });

  test('"Kocok ulang tumpukan" dari kartu penutup: fokus papan ketik tidak jatuh ke <body>', async ({ page }) => {
    await openCard(page);
    await expect(deckLive(page)).toBeAttached();
    for (let left = 6; left > 0; left -= 1) {
      await front(page).getByRole('button', { name: /^Lewati/ }).click();
      await expect(page.locator('article')).toHaveCount(left - 1);
    }
    await page.getByRole('link', { name: 'Kocok ulang tumpukan' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('article')).toHaveCount(6);
    await expect(page.locator('#hasil-pencocokan')).toBeFocused();
  });

  test('"Tarik N kartu lagi" yang terakhir: tautannya hilang, fokus pindah ke area hasil (bukan <body>)', async ({ page }) => {
    // Data contoh: 11 kandidat lolos untuk persona demo, jadi tarikan dari 6 ke 12 adalah yang terakhir.
    await openCard(page);
    await expect(deckLive(page)).toBeAttached();
    for (let left = 6; left > 0; left -= 1) {
      await front(page).getByRole('button', { name: /^Lewati/ }).click();
      await expect(page.locator('article')).toHaveCount(left - 1);
    }
    await page.getByRole('link', { name: /^Tarik \d+ kartu lagi/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/tampil=12/);
    await expect(page.getByRole('link', { name: /^Tarik \d+ kartu lagi/ })).toHaveCount(0);
    await expect(page.locator('#hasil-pencocokan')).toBeFocused();
  });

  test('keadaan kosong menawarkan "Lepas … · +N orang" yang benar-benar mengembalikan hasil', async ({ page }) => {
    await openCard(page);
    await page.goto(`${PAGE}?jarak=25&daring=0&keahlian=hukum-kebijakan`);
    await expect(page.getByRole('heading', { name: 'Saringanmu terlalu ketat' })).toBeVisible();
    const relax = page.getByRole('link', { name: /^Lepas .+ · \+\d+ orang$/ });
    expect(await relax.count()).toBeGreaterThan(0);
    await relax.first().click();
    await expect(page.getByRole('heading', { name: 'Pasangan terbaik untukmu' })).toBeVisible();
    expect(await page.locator('article').count()).toBeGreaterThan(0);
  });
});

test.describe('form pembuat kartu', () => {
  test('matriks keahlian memuat 18 baris dan kartu hidup ikut berubah', async ({ page }) => {
    await signInAsDemo(page, 'Mahasiswa', PAGE);
    await expect(page.locator('.skill-matrix-row')).toHaveCount(18);
    await expect(page.locator('input[name=skills]')).toHaveCount(18);
    await expect(page.locator('input[name=seeking]')).toHaveCount(18);

    await page.locator('input[name=skills][value=web-aplikasi]').check();
    await page.locator('input[name=seeking][value=ui-ux]').check();
    const live = page.locator('.pcard');
    await expect(live).toContainText('Pemrograman web & aplikasi');
    await expect(live).toContainText('Desain UI/UX');

    await page.locator('input[name=open]').uncheck();
    await expect(live.locator('.pcard-faces')).toHaveAttribute('data-face', 'back');
    await page.locator('input[name=open]').check();
    await expect(live.locator('.pcard-faces')).toHaveAttribute('data-face', 'front');
  });

  test('galat validasi server tidak menghapus isian: kota, pengantar, dan keahlian dicari dipulihkan', async ({ page }) => {
    await signInAsDemo(page, 'Mahasiswa', PAGE);
    await page.getByLabel('Kota', { exact: true }).selectOption('Bandung');
    await page.locator('textarea[name=pitch]').fill('Cari desainer yang rewel soal detail.');
    await page.locator('input[name=seeking][value=ui-ux]').check();
    await page.getByRole('button', { name: /Simpan & mulai mencari/ }).click();

    await expect(page).toHaveURL(/error=invalid_seeker_profile/);
    await expect(page.getByText('Pilih minimal satu keahlian untuk membuka kartu.')).toBeVisible();
    await expect(page.getByLabel('Kota', { exact: true })).toHaveValue('Bandung');
    await expect(page.locator('textarea[name=pitch]')).toHaveValue('Cari desainer yang rewel soal detail.');
    await expect(page.locator('input[name=seeking][value=ui-ux]')).toBeChecked();

    // Peringatan turun begitu kolomnya diperbaiki; setelah tersimpan, draf tidak menginap di tab.
    await page.locator('input[name=skills][value=web-aplikasi]').check();
    await expect(page.getByText('Pilih minimal satu keahlian untuk membuka kartu.')).toHaveCount(0);
    await page.getByRole('button', { name: /Simpan & mulai mencari/ }).click();
    await expect(page.getByRole('heading', { name: 'Pasangan timmu', level: 1 })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('sf-seeker-draft'))))
      .toEqual([]);
  });
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
    // Radar aria-hidden: pembaca layar mendapat kabar selesai dari wilayah status.
    await expect(page.getByRole('status').filter({ hasText: /pasangan teratas siap/ })).toBeAttached();
  });

  test('"Cari ulang" dua kali berturut-turut: radar diputar lagi dan bilah pemuat tidak macet', async ({ page }) => {
    await openCard(page);
    const rescan = page.getByRole('link', { name: 'Cari ulang' });
    for (let round = 0; round < 2; round += 1) {
      await expect.poll(() => new URL(page.url()).searchParams.has('cari'), { timeout: 6000 }).toBe(false);
      await rescan.click();
      await expect(page.locator('.scan-overlay')).toBeVisible();
      await expect(page.locator('.progress-sheen')).toHaveCount(0, { timeout: 4000 });
    }
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

  test('rail: enam kartu terbaca semua, pesan pengantar tersedia, dan tombol Ajak langsung mengirim', async ({ page, context, browser, baseURL }) => {
    const withJs = await browser.newContext({ baseURL: baseURL!, reducedMotion: 'reduce' });
    const setup = await withJs.newPage();
    await openCard(setup);
    await context.addCookies(await withJs.cookies());
    await withJs.close();

    await page.goto(PAGE);
    await expect(page.locator('.deck')).toHaveAttribute('data-mode', 'rail');
    await expect(page.locator('.deck[data-live]')).toHaveCount(0);
    await expect(page.locator('article')).toHaveCount(6);
    for (const card of await page.locator('article').all()) await expect(card.getByText('Kenapa cocok')).toBeVisible();
    await expect(page.getByText('+ Tambah pesan pengantar').first()).toBeVisible();

    await page.getByRole('button', { name: 'Ajak jadi partner' }).first().click();
    await expect(page).toHaveURL(/notice=match_invited/);
    await expect(page.getByText('Ajakan jadi partner terkirim.')).toBeVisible();
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

  test('menyeret kartu di 390px tidak melebarkan halaman', async ({ page }) => {
    await openCard(page);
    await expect(page.locator('.scan-overlay')).toBeHidden({ timeout: 8000 });
    await expect(deckLive(page)).toBeAttached();
    await page.evaluate(() => {
      const w = window as unknown as { __widest: number };
      w.__widest = 0;
      const tick = () => {
        w.__widest = Math.max(w.__widest, document.documentElement.scrollWidth - document.documentElement.clientWidth);
        requestAnimationFrame(tick);
      };
      tick();
    });
    await dragFront(page, -1);
    await expect(page.locator('article')).toHaveCount(5);
    await toInvitable(page);
    await dragFront(page, 1);
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __widest: number }).__widest)).toBeLessThanOrEqual(0);
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

  await expect(deckLive(page)).toBeAttached();
  await front(page).getByRole('button', { name: /^Balik kartu/ }).click();
  await expect(front(page).locator('.mc')).toHaveAttribute('data-face', 'back');
  await audit();
  await front(page).locator('summary.mc-sum').click();

  await toInvitable(page);
  await front(page).getByRole('button', { name: 'Ajak jadi partner' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await audit();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Semua kartu' }).click();
  await expect(page.locator('.deck[data-mode="grid"]')).toBeVisible();
  await audit();

  await page.goto(`${PAGE}?jarak=25&daring=0&keahlian=hukum-kebijakan`);
  await expect(page.getByRole('heading', { name: 'Saringanmu terlalu ketat' })).toBeVisible();
  await audit();
});
