#!/usr/bin/env node
/**
 * Impor direktori tempat studi (ADR-076) dari hasil unduhan Data Referensi
 * Kemendikdasmen (referensi.data.kemendikdasmen.go.id — daftar satuan
 * pendidikan per kecamatan, publik, tanpa login) ke `src/data/institutions.json`.
 *
 *   node scripts/import-institutions.mjs <dikti.jsonl> <dikmen.jsonl>
 *
 * Format masukan: satu objek JSON per baris {id, name, status, regency,
 * province, ...} — keluaran crawler sopan yang dijalankan terpisah (bukan
 * bagian dari build). Singkatan PT TIDAK ada di sumber itu: diambil dari
 * `src/data/institution-aliases.json` yang dikurasi tangan; nama yang tidak
 * ditemukan dilaporkan supaya salah ketik terlihat, bukan diam-diam hilang.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [diktiPath, dikmenPath] = process.argv.slice(2);
if (!diktiPath || !dikmenPath) {
  console.error('Pakai: node scripts/import-institutions.mjs <dikti.jsonl> <dikmen.jsonl>');
  process.exit(1);
}

const readJsonl = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

// --- Wilayah: nama versi referensi → kode Kemendagri ---------------------
const wilayah = JSON.parse(readFileSync('src/data/wilayah/regions.json', 'utf8'));
const norm = (value) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\bkab\.\s*adm\.\s*/g, 'kabupaten administrasi ')
    .replace(/\bkota\s*adm\.\s*/g, 'kota administrasi ')
    .replace(/\bkab\.\s*/g, 'kabupaten ')
    .replace(/\bkep\.\s*/g, 'kepulauan ')
    .replace(/[^a-z0-9]+/g, '');
const regencyByName = new Map();
for (const [code, name] of wilayah.regencies) {
  const key = norm(name);
  regencyByName.set(key, regencyByName.has(key) ? null : code);
}
// Nama yang berubah sejak data referensi ditulis (Kepmendagri terbaru menang).
const RENAMED = {
  kabupatentobasamosir: 'kabupatentoba',
  kotabaubau: 'kotabaubau',
  kabupatenpangkajenekepulauan: 'kabupatenpangkajenedankepulauan',
  kabupatenfakfak: 'kabupatenfakfak',
};
const unmatchedRegions = new Map();
function regionCodeOf(row) {
  // Kep. Seribu Selatan dipakai sumbernya sebagai "lokasi belum diisi" untuk
  // PT (puluhan PT dari berbagai kota tercatat di sana) — tidak dipercaya.
  if (row.kind !== 'school' && /seribu/i.test(row.regency)) return null;
  const key = norm(row.regency);
  const code = regencyByName.get(RENAMED[key] ?? key);
  if (code) return code;
  unmatchedRegions.set(row.regency, (unmatchedRegions.get(row.regency) ?? 0) + 1);
  return null;
}

// --- Rapikan nama ---------------------------------------------------------
const KEEP_UPPER = new Set(
  'SMA SMAN SMAS SMK SMKN SMKS MA MAN MAS MAK SLB SLBN SLBS SMALB SMLB SMKLB PGRI YPI YPK YPPK BPK BOPKRI KORPRI TNI POLRI NU IT YAPI YAPIS PKU STT STMIK STIE STIKES STIKOM STAI STAIN IAIN UIN IKIP STKIP STISIP STIA STIH STIT STIQ STIBA AMIK ASMI IPTEK RI DKI DIY II III IV VI VII VIII IX XI XII XIII LPP LPKIA ABA ATK AKN ASM'.split(' '),
);
const LOWER = new Set(['dan', 'di', 'ke', 'dari', 'untuk', 'of', 'the', 'and']);
function titleCase(name) {
  if (name !== name.toUpperCase()) return name.replace(/\s+/g, ' ').trim();
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word, index) => {
      const bare = word.replace(/[^A-Z0-9]/g, '');
      if (KEEP_UPPER.has(bare) || /\d/.test(word) || bare.length <= 2) return word;
      const lower = word.toLowerCase();
      if (index > 0 && LOWER.has(lower)) return lower;
      return lower.replace(/(^|[-'(./])([a-z])/g, (_, lead, char) => lead + char.toUpperCase());
    })
    .join(' ');
}

// --- Jenis ----------------------------------------------------------------
function campusKind(row) {
  const prefix = row.id[0];
  if (row.status !== 'NEGERI') return 'PTS';
  // Kode PT 3xxxxx–5xxxxx = PT kementerian/lembaga lain (kedinasan).
  return prefix === '3' || prefix === '4' || prefix === '5' ? 'PTK' : 'PTN';
}
function schoolKind(name) {
  const head = name.toUpperCase().replace(/[^A-Z ]/g, ' ').trim().split(/\s+/)[0] ?? '';
  if (/^(SLB|SMALB|SMLB|SMKLB|SLBN|SLBS)/.test(head)) return 'SLB';
  if (/^SMK/.test(head) || head === 'SMKN' || head === 'SMKS') return 'SMK';
  if (/^SMA/.test(head)) return 'SMA';
  if (/^(MA|MAN|MAS|MAK)$/.test(head)) return 'MA';
  return null;
}

// --- Bangun ---------------------------------------------------------------
const aliases = JSON.parse(readFileSync('src/data/institution-aliases.json', 'utf8'));
const aliasByName = new Map(Object.entries(aliases.campuses).map(([name, short]) => [norm(name), short]));
const usedAliases = new Set();

const rows = [];
const seen = new Set();
const skipped = { foreign: 0, unknownKind: 0, duplicate: 0 };

for (const row of readJsonl(diktiPath)) {
  // Kode 9xxxxx = PT luar negeri (mitra/penyetaraan), bukan tempat studi di Indonesia.
  if (row.id.startsWith('9')) {
    skipped.foreign += 1;
    continue;
  }
  if (seen.has(row.id)) {
    skipped.duplicate += 1;
    continue;
  }
  seen.add(row.id);
  const name = titleCase(row.name);
  const short = aliasByName.get(norm(name)) ?? null;
  if (short) usedAliases.add(norm(name));
  const kind = campusKind(row);
  rows.push([row.id, name, kind, kind === 'PTS' ? 0 : 1, regionCodeOf({ ...row, kind: 'campus' }), short]);
}

for (const row of readJsonl(dikmenPath)) {
  const kind = schoolKind(row.name);
  if (!kind) {
    skipped.unknownKind += 1;
    continue;
  }
  if (seen.has(row.id)) {
    skipped.duplicate += 1;
    continue;
  }
  seen.add(row.id);
  rows.push([row.id, titleCase(row.name), kind, row.status === 'NEGERI' ? 1 : 0, regionCodeOf({ ...row, kind: 'school' }), null]);
}

rows.sort((a, b) => a[0].localeCompare(b[0]));
const source = 'Data Referensi Kemendikdasmen (referensi.data.kemendikdasmen.go.id), diunduh 2026-11; singkatan PT dikurasi StudentFo';
// SATU string TSV, bukan JSON: impor JSON 3+ MB membuat tsc menginferensi
// tipe tiap baris (+10 detik per pemeriksaan); string literal tidak.
const clean = (value) => String(value ?? '').replace(/[\t\n\r]/g, ' ');
const tsv = rows.map(([id, name, kind, negeri, region, short]) => [id, name, kind, negeri, region, short].map(clean).join('\t')).join('\n');
writeFileSync(
  'src/data/institutions.ts',
  `// Hasil scripts/import-institutions.mjs — JANGAN diedit tangan (ADR-076).\n// Kolom: id, nama, jenis, negeri (1/0), kode kab/kota, singkatan.\nexport const INSTITUTION_SOURCE = ${JSON.stringify(source)};\nexport const INSTITUTION_ROWS = ${JSON.stringify(tsv)};\n`,
);

const counts = rows.reduce((acc, row) => ({ ...acc, [row[2]]: (acc[row[2]] ?? 0) + 1 }), {});
console.log(`${rows.length} institusi`, counts, 'dilewati', skipped);
const missingAliases = [...aliasByName.keys()].filter((key) => !usedAliases.has(key));
if (missingAliases.length) console.log(`Singkatan tanpa padanan nama (${missingAliases.length}):`, missingAliases.join(', '));
if (unmatchedRegions.size) console.log('Kab/kota tak terpetakan:', [...unmatchedRegions.entries()].map(([name, n]) => `${name} (${n})`).join(', '));
