import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { createEvent, createUser } from '../integration/harness';
import { signJwt } from '../integration/jwt';

const STACK_URL = process.env.STACK_URL ?? 'http://localhost:54321';

async function listingHits(): Promise<number> {
  const stats = (await (await fetch(`${STACK_URL}/__stats`)).json()) as Record<string, number>;
  return stats['GET /events_listing'] ?? 0;
}

/** Cookie sesi @supabase/ssr untuk pengguna ini (token diverifikasi stack uji seperti GoTrue). */
async function signIn(context: BrowserContext, userId: string): Promise<void> {
  const email = `${userId}@uji.example`;
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signJwt({ role: 'authenticated', sub: userId, email }, process.env.INTEGRATION_JWT_SECRET!);
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
  await signIn(adminContext, createUser({ role: 'ADMIN', fullName: 'Admin E2E' }));
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
