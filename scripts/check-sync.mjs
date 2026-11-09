#!/usr/bin/env node
/**
 * Pemeriksaan WAJIB di awal setiap sesi kerja (AGENTS.md § Langkah 0):
 * "apakah aku sedang membangun di atas versi terbaru?"
 *
 * Lahir dari kejadian nyata (ADR-066, ADR-069): migration diterapkan ke
 * Supabase produksi dari cabang yang tidak pernah digabung, sesi berikutnya
 * mulai dari main yang tertinggal, lalu fitur yang SUDAH ada dibuat ulang
 * dari nol (pintu daftar penyelenggara) atau ditafsirkan ulang (lobi = /teams).
 *
 *   npm run check:sync            # pakai ref lokal
 *   npm run check:sync -- --fetch # ambil ref terbaru dari origin dulu
 *
 * Gagal (exit 1) bila: cabang ini tidak memuat origin/main, atau produksi
 * punya migration yang berkasnya tidak ada di sini. Peringatan (exit 0) bila:
 * ada cabang remote lain dengan commit migration yang belum masuk main.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const failures = [];
const warnings = [];

if (process.argv.includes('--fetch')) {
  try {
    git('fetch', '--prune', 'origin');
  } catch (error) {
    warnings.push(`git fetch gagal (${error.message.split('\n')[0]}) — memakai ref lokal yang mungkin basi.`);
  }
}

// 1. Cabang ini harus memuat main terbaru.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
try {
  git('rev-parse', '--verify', 'origin/main');
  try {
    git('merge-base', '--is-ancestor', 'origin/main', 'HEAD');
  } catch {
    const behind = git('rev-list', '--count', 'HEAD..origin/main');
    failures.push(`Cabang "${branch}" tertinggal ${behind} commit dari origin/main. Gabungkan main dulu: git merge origin/main`);
  }
} catch {
  warnings.push('origin/main tidak ditemukan — jalankan dengan --fetch.');
}

// 2. Kode tidak boleh tertinggal dari database produksi.
const manifest = readFileSync('supabase/APPLIED_MIGRATIONS.txt', 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const files = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql'));
const missing = manifest.filter((line) => !files.includes(`${line.replace(' ', '_')}.sql`));
if (missing.length) failures.push(`Produksi punya migration yang tidak ada di cabang ini:\n    ${missing.join('\n    ')}`);
const appliedFiles = new Set(manifest.map((line) => `${line.replace(' ', '_')}.sql`));
const pending = files.filter((name) => !appliedFiles.has(name));

// 3. Cabang remote lain dengan migration yang belum masuk main = kemungkinan
//    sudah diterapkan ke produksi tanpa kodenya di main.
try {
  const remotes = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin')
    .split('\n')
    .filter((ref) => ref && ref !== 'origin/main' && ref !== 'origin/HEAD' && ref !== `origin/${branch}`);
  for (const ref of remotes) {
    const changed = git('log', '--format=', '--name-only', `origin/main..${ref}`, '--', 'supabase/migrations')
      .split('\n')
      .filter(Boolean);
    const unmerged = [...new Set(changed)].filter((path) => !files.includes(path.split('/').pop()));
    if (unmerged.length) warnings.push(`${ref} punya migration yang tidak ada di sini: ${unmerged.map((path) => path.split('/').pop()).join(', ')}`);
  }
} catch (error) {
  warnings.push(`Tidak bisa memeriksa cabang remote: ${error.message.split('\n')[0]}`);
}

console.log(`Cabang: ${branch}`);
console.log(`Migration: ${files.length} berkas, ${manifest.length} sudah di produksi, ${pending.length} belum diterapkan${pending.length ? `:\n    ${pending.join('\n    ')}` : ''}`);
for (const warning of warnings) console.log(`PERINGATAN  ${warning}`);
for (const failure of failures) console.log(`GAGAL       ${failure}`);
if (failures.length) {
  console.log('\nJangan mulai mengubah kode sebelum ini beres — kamu sedang membangun di atas versi lama. Lihat CHANGELOG.md.');
  process.exit(1);
}
console.log(warnings.length ? '\nTidak ada yang menghalangi, tapi baca peringatan di atas sebelum mulai.' : '\nSinkron: aman mulai bekerja.');
