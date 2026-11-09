#!/usr/bin/env node
/**
 * Impor data wilayah administratif (ADR-074) dari paket `idn-area-data`
 * (data ODbL 1.0, bersumber Kepmendagri terbaru) ke JSON ringkas di
 * `src/data/wilayah/`. Sengaja BUKAN dependensi npm: data dibekukan di repo,
 * jadi pembaruannya terlihat sebagai diff yang bisa ditinjau.
 *
 *   npm pack idn-area-data@4.0.1 && tar xzf idn-area-data-4.0.1.tgz
 *   node scripts/import-wilayah.mjs package/data
 *
 * Kode wilayah hierarkis (32 → 32.73 → 32.73.01), jadi induk tidak perlu
 * disimpan: cukup potong kodenya.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Pakai: node scripts/import-wilayah.mjs <folder data idn-area-data>');
  process.exit(1);
}

function parseCsv(path) {
  const [header, ...lines] = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const columns = header.split(',');
  return lines.map((line) => {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (quoted && char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        cells.push(cell);
        cell = '';
      } else {
        cell += char;
      }
    }
    cells.push(cell);
    return Object.fromEntries(columns.map((column, index) => [column, (cells[index] ?? '').trim()]));
  });
}

const CODE = { p: /^\d{2}$/, r: /^\d{2}\.\d{2}$/, d: /^\d{2}\.\d{2}\.\d{2}$/ };
function rows(file, pattern) {
  const out = parseCsv(join(dir, file)).map((row) => [row.code, row.name.replace(/\s+/g, ' ')]);
  const bad = out.filter(([code, name]) => !pattern.test(code) || !name || name.length > 80);
  if (bad.length) throw new Error(`${file}: ${bad.length} baris tidak sah, mis. ${JSON.stringify(bad[0])}`);
  return out.sort(([a], [b]) => a.localeCompare(b));
}

const provinces = rows('provinces.csv', CODE.p);
const regencies = rows('regencies.csv', CODE.r);
const districts = rows('districts.csv', CODE.d);

const source = 'idn-area-data 4.0.1 (ODbL 1.0) — github.com/fityannugroho/idn-area-data, bersumber Kepmendagri';
writeFileSync('src/data/wilayah/regions.json', `${JSON.stringify({ source, provinces, regencies })}\n`);
writeFileSync('src/data/wilayah/districts.json', `${JSON.stringify({ source, districts })}\n`);
console.log(`${provinces.length} provinsi, ${regencies.length} kab/kota, ${districts.length} kecamatan`);
