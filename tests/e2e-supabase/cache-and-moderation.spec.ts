import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { createEvent, createUser } from '../integration/harness';
import { signJwt } from '../integration/jwt';

const STACK_URL = process.env.STACK_URL ?? 'http://localhost:54321';

/**
 * Query listing ke database: urutan relevansi (bawaan /events) lewat RPC
 * `list_personalized_events` sejak ADR-050, urutan lain lewat view.
 */
async function listingHits(): Promise<number> {
  const stats = (await (await fetch(`${STACK_URL}/__stats`)).json()) as Record<string, number>;
  return (stats['GET /events_listing'] ?? 0) + (stats['POST /rpc/list_personalized_events'] ?? 0);
}

/** Cookie sesi @supabase/ssr untuk pengguna ini (token diverifikasi stack uji seperti GoTrue). */
async function signIn(context: BrowserContext, userId: string, aal: 'aal1' | 'aal2' = 'aal1'): Promise<void> {
  const email = `${userId}@uji.example`;
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signJwt({ role: 'authenticated', aud: 'authenticated', sub: userId, email, aal }, process.env.INTEGRATION_JWT_SECRET!);
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 86_400,
    expires_at: now + 86_400,
    refresh_token: 'tidak-dipakai-di-uji',
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {} },
  };
  await context.addCookies([
    {
      name: `sb-${new URL(STACK_URL).hostname.split('.')[0]}-auth-token`,
      value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
      domain: 'localhost',
      path: '/',
    },
  ]);
}

// HARUS uji pertama di berkas ini: scripts/with-postgrest.sh membuat database
// baru tanpa satu kegiatan pun — keadaan situs di hari peluncuran.
test('katalog kosong: /about tidak memamerkan angka nol, /events menjelaskan keadaannya', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('kegiatan masih terbuka')).toHaveCount(0);
  await page.goto('/events');
  await expect(page.getByText('Belum ada kegiatan yang tayang')).toBeVisible();
});

test('listing publik dilayani Data Cache: kunjungan kedua tidak menyentuh database', async ({ page }) => {
  const token = `zc${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  createEvent({ title: `Lomba Cache Runtime ${token}` });

  const before = await listingHits();
  const first = await page.goto(`/events?q=${token}`);
  expect(first?.status()).toBe(200);
  await expect(page.getByText(`Lomba Cache Runtime ${token}`)).toBeVisible();
  const afterFirst = await listingHits();
  expect(afterFirst).toBeGreaterThan(before);

  await page.goto(`/events?q=${token}`);
  await expect(page.getByText(`Lomba Cache Runtime ${token}`)).toBeVisible();
  expect(await listingHits()).toBe(afterFirst);
});

test('persetujuan admin mencabut cache: event langsung tayang, bukan setelah TTL 5 menit', async ({ browser }) => {
  const token = `zm${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const title = `Beasiswa Moderasi ${token}`;
  const { slug } = createEvent({ title, status: 'PENDING', eventType: 'BEASISWA' });

  const guest = await browser.newPage();
  await guest.goto(`/events?q=${token}`);
  await expect(guest.getByText(title)).toHaveCount(0); // hasil kosong kini ter-cache
  // Tautan kegiatan yang dibagikan sebelum disetujui: 404, dan "tidak ada" itu ikut ter-cache.
  expect((await guest.goto(`/events/${slug}`))?.status()).toBe(404);

  const adminContext = await browser.newContext();
  // aal2 = sudah verifikasi dua langkah (ADR-062); alur MFA-nya sendiri di admin-mfa.spec.ts.
  await signIn(adminContext, createUser({ role: 'ADMIN', fullName: 'Admin E2E' }), 'aal2');
  const admin = await adminContext.newPage();
  await admin.goto('/admin');
  await expect(admin.getByRole('heading', { name: 'Antrean moderasi' })).toBeVisible();
  const card = admin.getByRole('listitem').filter({ has: admin.getByRole('heading', { name: title }) });
  await card.getByRole('button', { name: 'Setujui' }).click();
  await expect(card).toHaveCount(0);

  await guest.goto(`/events?q=${token}`);
  await expect(guest.getByText(title)).toBeVisible();
  // revalidatePath('/events') TIDAK mencakup /events/<slug>; hanya revalidateTag('events')
  // yang mencabut entri detail — tanpa itu tautan ini tetap 404 sampai TTL habis.
  expect((await guest.goto(`/events/${slug}`))?.status()).toBe(200);
  await expect(guest.getByRole('heading', { level: 1, name: title })).toBeVisible();

  await admin.goto('/admin/riwayat');
  await expect(admin.getByRole('listitem').filter({ hasText: title }).first()).toContainText('Admin E2E');
  await adminContext.close();
});

test('pengguna yang masuk tidak pernah menerima halaman milik orang lain dari cache', async ({ browser }) => {
  const event = createEvent({ title: `Lomba Privasi ${randomUUID().slice(0, 8)}` });
  const [alice, bob] = [createUser({ fullName: 'Alice Uji' }), createUser({ fullName: 'Bob Uji' })];

  for (const [userId, name] of [[alice, 'Alice Uji'], [bob, 'Bob Uji']] as const) {
    const context = await browser.newContext();
    await signIn(context, userId);
    const page = await context.newPage();
    await page.goto(`/events/${event.slug}`);
    await expect(page.locator(`summary[aria-label="Menu akun untuk ${name}"]`)).toBeVisible();
    const html = await page.content();
    expect(html).toContain(name);
    expect(html).not.toContain(name === 'Alice Uji' ? 'Bob Uji' : 'Alice Uji');
    await context.close();
  }
});

test.describe('login dari browser dalam aplikasi (Instagram)', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91 (iPhone14,5; iOS 17_5; id_ID)',
  });

  test('tombol Google (pasti 403 disallowed_useragent) diganti petunjuk "Buka di browser"; login email tetap ada', async ({ page }) => {
    for (const route of ['/login', '/register']) {
      await page.goto(route);
      await expect(page.getByRole('button', { name: /dengan Google/ })).toHaveCount(0);
      await expect(page.getByRole('note').filter({ hasText: 'Google tidak mengizinkan masuk dari dalam Instagram' })).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
    }
  });
});

test('browser biasa tetap melihat tombol Google', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Masuk dengan Google' })).toBeVisible();
});

/**
 * Form daftar hanya dirender di mode Supabase (mode seed menawarkan akun demo),
 * jadi di sinilah centang usia & persetujuan (ADR-060) diuji. Atribut
 * `required` hanya kenyamanan: Server Action adalah endpoint HTTP sendiri.
 */
test.describe('daftar: pernyataan usia dan persetujuan', () => {
  test('dua centang terpisah, menautkan S&K dan Kebijakan privasi', async ({ page }) => {
    await page.goto('/register');
    const age = page.getByRole('checkbox', { name: /berusia 18 tahun ke atas, atau 13–17 tahun/ });
    const consent = page.getByRole('checkbox', { name: /^Saya menyetujui Syarat & Ketentuan \(tab baru\) dan Kebijakan privasi \(tab baru\)/ });
    await expect(age).toHaveAttribute('required', '');
    await expect(consent).toHaveAttribute('required', '');
    await expect(page.locator('form a[href="/terms"]')).toHaveCount(1);
    await expect(page.locator('form a[href="/privacy-policy"]')).toHaveCount(1);
  });

  for (const [field, code, message] of [
    ['ageConfirm', 'age_required', /StudentFo untuk usia 13 tahun ke atas/],
    ['privacyConsent', 'consent_required', /Setujui Syarat & Ketentuan dan Kebijakan privasi/],
  ] as const) {
    test(`server menolak tanpa ${field}, walau atribut required dibuang`, async ({ page }) => {
      await page.goto('/register');
      await page.getByLabel('Nama lengkap').fill('Uji Persetujuan');
      await page.getByLabel('Email').fill(`persetujuan-${randomUUID()}@uji.example`);
      await page.locator('#password').fill('rahasia12345');
      for (const name of ['ageConfirm', 'privacyConsent']) {
        const box = page.locator(`input[name="${name}"]`);
        if (name === field) await box.evaluate((el) => el.removeAttribute('required'));
        else await box.check();
      }
      await page.getByRole('button', { name: 'Buat akun' }).click();
      await expect(page).toHaveURL(new RegExp(`error=${code}`));
      await expect(page.getByText(message)).toBeVisible();
    });

    test(`daftar dengan Google tanpa ${field} ditolak sebelum ke Google`, async ({ page }) => {
      await page.goto('/register');
      for (const name of ['ageConfirm', 'privacyConsent']) {
        const box = page.locator(`input[name="${name}"]`);
        if (name === field) await box.evaluate((el) => el.removeAttribute('required'));
        else await box.check();
      }
      // Nama/email/sandi kosong: tombol Google memakai formAction, jadi buang `required` mereka juga.
      await page.locator('form [required]').evaluateAll((nodes) => nodes.forEach((node) => node.removeAttribute('required')));
      await page.getByRole('button', { name: 'Daftar dengan Google' }).click();
      await expect(page).toHaveURL(new RegExp(`/register\\?.*error=${code}`));
    });
  }
});
