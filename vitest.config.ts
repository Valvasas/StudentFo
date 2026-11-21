import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next menyediakan `server-only` lewat aliasnya sendiri; di Vitest (Node) modul server boleh diimpor.
      'server-only': fileURLToPath(new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)),
    },
  },
  // tsconfig memakai `jsx: preserve` (Next yang mengompilasi); tes yang menggambar
  // poster Satori (ADR-095) mengimpor .tsx, jadi Vitest perlu transform JSX sendiri.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
