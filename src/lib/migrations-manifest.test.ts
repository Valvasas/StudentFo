import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Kode tidak boleh tertinggal dari database-nya sendiri (CHANGELOG.md, ADR-069).
 * Setiap migration yang tercatat sudah diterapkan ke produksi WAJIB ada
 * berkasnya di cabang ini. Gagal di sini = cabang ini dibangun dari versi
 * lama: gabungkan main (atau cabang yang menerapkan migration itu) dulu.
 */
const root = new URL('../../supabase/', import.meta.url);
const applied = readFileSync(new URL('APPLIED_MIGRATIONS.txt', root), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const files = readdirSync(new URL('migrations/', root)).filter((name) => name.endsWith('.sql'));

describe('supabase/APPLIED_MIGRATIONS.txt', () => {
  it('setiap baris berbentuk "<versi 14 digit> <nama>" dan urut tanpa duplikat', () => {
    for (const line of applied) expect(line).toMatch(/^\d{14} [a-z0-9_]+$/);
    const versions = applied.map((line) => line.split(' ')[0]);
    expect([...versions].sort()).toEqual(versions);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('setiap migration yang sudah di produksi ada berkasnya di repo ini', () => {
    const missing = applied.filter((line) => !files.includes(`${line.replace(' ', '_')}.sql`));
    expect(missing, `Produksi punya migration yang tidak ada di cabang ini: ${missing.join(', ')}`).toEqual([]);
  });
});
