/**
 * Tint catatan tempel (ADR-054): satu dari lima warna pastel yang diturunkan
 * dari sebuah id. Deterministik dan murni — server & klien menghasilkan tint
 * yang sama (tanpa ketidakcocokan hidrasi), dan orang yang sama berwarna
 * sama di /connections, /teams, maupun kotak masuk.
 *
 * Warnanya identitas, bukan makna: tidak ada tint yang berarti "baru",
 * "penting", atau "panitia". Jangan memetakan status ke tint.
 */
export const TINTS = ['sun', 'mint', 'peach', 'sky', 'lilac'] as const;
export type Tint = (typeof TINTS)[number];

/**
 * FNV-1a 32-bit. Bukan untuk keamanan — hanya sebaran yang rata untuk id
 * pendek berurutan (`seed-user-1`, `seed-user-2`, …) yang dengan jumlah
 * kode karakter biasa akan menumpuk di tint yang sama.
 */
function hash(seed: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export function tintOf(seed: string): Tint {
  return TINTS[hash(seed) % TINTS.length] ?? 'sun';
}

/**
 * Tint sampul untuk kartu yang juga memuat avatar ber-`tintOf(seed)` yang
 * sama: selalu dua langkah dari tint avatarnya, supaya avatar tidak lebur
 * ke latar sampulnya sendiri.
 */
export function coverTintOf(seed: string): Tint {
  return TINTS[(TINTS.indexOf(tintOf(seed)) + 2) % TINTS.length] ?? 'sky';
}
