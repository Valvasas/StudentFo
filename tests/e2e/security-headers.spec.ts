import { expect, test } from '@playwright/test';

/**
 * CSP berbasis nonce baru terbukti benar kalau diuji di browser sungguhan:
 * header yang "kelihatan benar" tetap bisa memblokir skrip hidrasi Next.js
 * sendiri, dan hasilnya halaman tampil normal tapi setiap tombol mati.
 */
const ROUTES = ['/', '/events', '/login', '/submit', '/teams'];

for (const route of ROUTES) {
  test(`CSP bernonce terpasang & tidak memblokir apa pun: ${route}`, async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
    });
    await page.exposeFunction('reportCspViolation', (detail: string) => violations.push(detail));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { reportCspViolation: (d: string) => void }).reportCspViolation(
          `${event.violatedDirective} ${event.blockedURI}`,
        );
      });
    });

    const response = await page.goto(route);
    const csp = response?.headers()['content-security-policy'] ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];

    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(nonce, 'CSP tanpa nonce').toBeTruthy();
    // Skrip inline tema harus membawa nonce request ini, bukan nonce basi.
    const inlineNonces = await page.locator('script:not([src])').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLScriptElement).nonce),
    );
    expect(inlineNonces.length).toBeGreaterThan(0);
    for (const value of inlineNonces) expect(value).toBe(nonce);

    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
  });
}

test('nonce berbeda di setiap request', async ({ request }) => {
  const [a, b] = await Promise.all([request.get('/'), request.get('/')]);
  expect(a.headers()['content-security-policy']).not.toEqual(b.headers()['content-security-policy']);
});

test('JavaScript klien tetap hidup di bawah CSP (pengalih tema bekerja)', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /Ganti ke tema (gelap|terang)/ });
  await expect(toggle).toBeVisible();
  const before = await page.locator('html').getAttribute('data-theme');
  await toggle.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', before ?? '');
});

test('HSTS dua tahun + includeSubDomains + preload di build produksi', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['strict-transport-security']).toBe(
    'max-age=63072000; includeSubDomains; preload',
  );
});
