import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { signJwt } from './tests/integration/jwt';

/**
 * Integration test repository Supabase (`npm run test:integration`), dijalankan
 * oleh scripts/test-integration.sh yang menyiapkan Postgres + PostgREST.
 * Terpisah dari `npm test` karena butuh database sungguhan.
 */
const secret = process.env.INTEGRATION_JWT_SECRET ?? 'belum-diset-jalankan-lewat-scripts-test-integration';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/integration/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    // Satu database bersama: berkas uji dijalankan berurutan, bukan paralel.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.integration.test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: signJwt({ role: 'anon' }, secret),
      SUPABASE_SERVICE_ROLE_KEY: signJwt({ role: 'service_role' }, secret),
      INTEGRATION_JWT_SECRET: secret,
    },
  },
});
