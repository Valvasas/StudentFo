import { defineConfig, devices } from '@playwright/test';

/**
 * e2e mode Supabase (`npm run test:e2e:supabase`). Server dijalankan oleh
 * scripts/e2e-supabase.sh, bukan webServer di sini: urutannya (database →
 * PostgREST → stack auth → build → start) tidak muat di satu perintah.
 */
export default defineConfig({
  testDir: 'tests/e2e-supabase',
  // Satu database & satu Data Cache bersama: urutan uji penting.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3200',
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
      : {}),
  },
  projects: [{ name: 'supabase', use: { ...devices['Desktop Chrome'] } }],
});
