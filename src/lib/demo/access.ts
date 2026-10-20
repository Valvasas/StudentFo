import { createHash, timingSafeEqual } from 'node:crypto';

/** "Demo.Contoh.id:443, preview.contoh.id" → ["demo.contoh.id", "preview.contoh.id"]. */
export function parseHostList(raw: string | undefined): readonly string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => hostnameOf(entry))
    .filter((entry): entry is string => entry !== null);
}

/** Nama host huruf kecil tanpa port; `null` bila kosong. IPv6 bertanda kurung ikut ditangani. */
export function hostnameOf(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) return null;
  const hostname = trimmed.startsWith('[') ? trimmed.slice(0, trimmed.indexOf(']') + 1) : (trimmed.split(':')[0] ?? '');
  return hostname || null;
}

export interface DemoHostInput {
  readonly isProduction: boolean;
  readonly allowedHosts: readonly string[];
  readonly host: string | null | undefined;
}

/**
 * Apakah deploy ini boleh menyajikan akun demo.
 *
 * Di produksi, `ALLOW_DEMO_IN_PRODUCTION=true` saja tidak cukup: flag itu
 * mudah ikut menyala di deploy yang salah, dan akibatnya akun demo (termasuk
 * moderasi) terbuka di domain sungguhan. Karena itu daftar host wajib diisi
 * dan harus cocok; kosong = menolak (gagal tertutup), bukan mengizinkan semua.
 * Di luar produksi (`npm run dev`) selalu diizinkan supaya `npm install && npm
 * run dev` tetap berjalan tanpa konfigurasi (AGENTS.md).
 */
export function isDemoHostAllowed({ isProduction, allowedHosts, host }: DemoHostInput): boolean {
  if (!isProduction) return true;
  const hostname = hostnameOf(host);
  return hostname !== null && allowedHosts.includes(hostname);
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export interface DemoAdminInput {
  readonly isProduction: boolean;
  readonly configuredKey: string | undefined;
  readonly presentedKey: string | undefined;
}

/**
 * Persona Admin tidak pernah ditawarkan di halaman publik. Dengan kunci
 * terpasang, ia hanya terbuka bagi yang membawa kunci itu (tautan khusus yang
 * dikirim ke calon pengguna tertentu). Tanpa kunci: terbuka di luar produksi
 * (pengembangan lokal), tertutup di produksi.
 *
 * Dibandingkan lewat hash supaya waktu banding tidak bergantung pada berapa
 * karakter awal yang cocok, dan panjang kunci tidak bocor.
 */
export function isDemoAdminAllowed({ isProduction, configuredKey, presentedKey }: DemoAdminInput): boolean {
  if (!configuredKey) return !isProduction;
  if (!presentedKey) return false;
  return timingSafeEqual(digest(configuredKey), digest(presentedKey));
}
