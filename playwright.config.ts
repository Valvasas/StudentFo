import { defineConfig, devices } from '@playwright/test';

/**
 * Audit aksesibilitas otomatis (`npm run test:a11y`). Terpisah dari
 * `npm run verify` karena butuh build produksi + browser sungguhan.
 *
 * Diuji terhadap build produksi di mode seed, bukan `next dev`: overlay
 * error dev menyuntikkan elemen yang ikut diaudit axe, dan halaman tanpa
 * kredensial Supabase memang harus berjalan penuh (AGENTS.md).
 */
const PORT = 3100;

export default defineConfig({
  testDir: 'tests/a11y',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Kartu `.reveal` memudar masuk selama 200ms. Tanpa ini axe mengukur
    // kontras di tengah animasi (opasitas < 1) dan melaporkan pelanggaran
    // palsu. Keadaan akhirnya identik dengan mode gerak normal.
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'terang', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'gelap', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    { name: 'ponsel', use: { ...devices['Pixel 7'], colorScheme: 'light' } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Kosongkan env Supabase supaya selalu mode seed, walau .env.local ada.
    env: { NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  },
});
