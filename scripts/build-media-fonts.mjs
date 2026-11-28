#!/usr/bin/env node
/**
 * Tulis ulang src/lib/media-import/fonts.generated.ts dari @fontsource (ADR-104).
 *   npm run media:fonts
 * Jalankan setelah menaikkan versi @fontsource/plus-jakarta-sans; tes
 * fonts.test.ts gagal bila berkas hasil tidak sama dengan node_modules.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const WEIGHTS = [500, 700, 800];
const dir = 'node_modules/@fontsource/plus-jakarta-sans/files';
const lines = WEIGHTS.map((weight) => {
  const base64 = readFileSync(`${dir}/plus-jakarta-sans-latin-${weight}-normal.woff`).toString('base64');
  return `  ${weight}: '${base64}',`;
});
const out = `// BERKAS HASIL scripts/build-media-fonts.mjs — jangan diedit tangan (ADR-104).
// Plus Jakarta Sans latin WOFF (OFL) dari @fontsource, base64.
export const MEDIA_FONT_WOFF_BASE64: Record<500 | 700 | 800, string> = {
${lines.join('\n')}
};
`;
writeFileSync('src/lib/media-import/fonts.generated.ts', out);
console.log(`${WEIGHTS.length} font ditulis ke src/lib/media-import/fonts.generated.ts`);
