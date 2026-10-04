// Penelusur tautan internal: setiap halaman yang bisa dicapai dari beranda
// dibuka sebagai tamu dan sebagai tiap persona demo, lalu dicatat bila
// statusnya ≥ 400 (selain 404 yang memang disengaja), ada error konsol, atau
// ada exception di halaman.
//
// Pakai (server mode demo harus sudah jalan):
//   node scripts/crawl-links.mjs http://localhost:3100
// Opsional: CRAWL_LIMIT=300 (halaman per peran), PLAYWRIGHT_CHROMIUM_EXECUTABLE.
//
// Tautan yang SENGAJA tidak diikuti: /api/* (berkas & endpoint mesin),
// /events/*/daftar (pengalih keluar yang mencatat sinyal klik — ADR-032),
// /auth/* (callback OAuth), dan semua tautan ke host lain.
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const LIMIT = Number(process.env.CRAWL_LIMIT ?? 300);
const PERSONAS = [null, 'Mahasiswa', 'Siswa baru', 'Admin moderator', 'Penyelenggara'];
const SKIP = [/^\/api\//, /^\/events\/[^/]+\/daftar/, /^\/auth\//, /^\/_next\//];

function normalize(href) {
  try {
    const url = new URL(href, BASE);
    if (url.origin !== new URL(BASE).origin) return null;
    url.hash = '';
    if (SKIP.some((pattern) => pattern.test(url.pathname))) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
);
const problems = [];
let total = 0;

for (const persona of PERSONAS) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const label = persona ?? 'tamu';
  let current = '';
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`[${label}] ${current} konsol: ${message.text().slice(0, 180)}`);
  });
  page.on('pageerror', (error) => problems.push(`[${label}] ${current} exception: ${String(error).slice(0, 180)}`));

  if (persona) {
    await page.goto(`${BASE}/login`);
    await page.getByRole('button', { name: new RegExp(`^Masuk sebagai ${persona}:`) }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  }

  // Path yang belum pernah dibuka didahulukan; variasi query string (kombinasi
  // filter — ribuan) baru diambil setelahnya. Tanpa ini batas LIMIT habis di
  // kombinasi filter /events sebelum halaman detail sempat dibuka.
  const fresh = ['/'];
  const variants = [];
  const seen = new Set(fresh);
  const seenPaths = new Set(['/']);
  let visited = 0;
  while ((fresh.length > 0 || variants.length > 0) && visited < LIMIT) {
    visited += 1;
    current = fresh.shift() ?? variants.shift();
    const response = await page.goto(`${BASE}${current}`, { waitUntil: 'domcontentloaded' }).catch((error) => error);
    total += 1;
    if (response instanceof Error) {
      problems.push(`[${label}] ${current} gagal dibuka: ${response.message.slice(0, 120)}`);
      continue;
    }
    const status = response?.status() ?? 0;
    // 404 di halaman yang memang tidak ada sudah diuji terpisah; di sini 404
    // berarti TAUTAN di halaman lain menunjuk ke tempat yang salah.
    if (status >= 400) problems.push(`[${label}] ${current} → HTTP ${status}`);
    const hrefs = await page.$$eval('a[href]', (anchors) => anchors.map((anchor) => anchor.getAttribute('href')));
    for (const href of hrefs) {
      const next = normalize(href);
      if (next && !seen.has(next)) {
        seen.add(next);
        const path = next.split('?')[0];
        if (seenPaths.has(path)) variants.push(next);
        else {
          seenPaths.add(path);
          fresh.push(next);
        }
      }
    }
  }
  console.log(`${label}: ${visited} halaman dibuka (${seenPaths.size} path berbeda, ${seen.size} tautan unik)`);
  await context.close();
}

await browser.close();
console.log(`\n${total} halaman dibuka, ${problems.length} masalah.`);
for (const problem of [...new Set(problems)]) console.log(`  - ${problem}`);
process.exit(problems.length > 0 ? 1 : 0);
