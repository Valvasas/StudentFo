import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MEDIA_FONT_WOFF_BASE64 } from './fonts.generated';

const FONT_DIR = join(process.cwd(), 'node_modules/@fontsource/plus-jakarta-sans/files');

describe('fonts.generated', () => {
  it.each([500, 700, 800] as const)('berat %i sama dengan @fontsource terpasang (jalankan npm run media:fonts bila gagal)', (weight) => {
    const file = readFileSync(join(FONT_DIR, `plus-jakarta-sans-latin-${weight}-normal.woff`));
    expect(MEDIA_FONT_WOFF_BASE64[weight]).toBe(file.toString('base64'));
  });
});
