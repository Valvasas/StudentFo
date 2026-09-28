/**
 * Aturan & kunci pembatas laju untuk Server Action.
 *
 * Penghitungnya ada di repository (`consumeRateLimit`): Postgres di produksi
 * (berlaku lintas instance), Map di mode seed. Berkas ini hanya menentukan
 * SIAPA dihitung dan SEBERAPA banyak.
 */

export interface RateLimitRule {
  /** Awalan ember; mengganti nama = mengosongkan semua hitungan lama. */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

/**
 * Angka dipilih supaya pengguna sungguhan tidak pernah menyentuhnya:
 * - Masuk per IP+email 5/15 menit menahan tebak-sandi terarah; per IP 30/15
 *   menit menahan penyemprotan banyak email dari satu mesin, sambil tetap
 *   memberi ruang satu jaringan kampus/warnet (NAT) yang berbagi IP.
 * - Tidak ada batas per EMAIL saja: itu membuat siapa pun bisa mengunci akun
 *   orang lain hanya dengan mengetik emailnya berulang kali.
 */
export const RATE_LIMITS = {
  signInPerIp: { name: 'signin-ip', limit: 30, windowSeconds: 15 * 60 },
  signInPerIpEmail: { name: 'signin-ip-email', limit: 5, windowSeconds: 15 * 60 },
  signUpPerIp: { name: 'signup-ip', limit: 5, windowSeconds: 60 * 60 },
  passwordResetPerIp: { name: 'reset-ip', limit: 5, windowSeconds: 60 * 60 },
  submissionPerIp: { name: 'submit-ip', limit: 5, windowSeconds: 60 * 60 },
  /** Sinyal rekomendasi: di atas ini, klik dianggap penggelembungan dan tidak dicatat (tetap dialihkan). */
  signalPerIp: { name: 'signal-ip', limit: 60, windowSeconds: 60 * 60 },
  /** Kunjungan halaman acara: di atas ini dianggap penggelembungan analitik, tidak dicatat (halaman tetap tampil). */
  eventViewPerIp: { name: 'view-ip', limit: 300, windowSeconds: 60 * 60 },} as const satisfies Record<string, RateLimitRule>;

export interface ClientIpOptions {
  /**
   * Header satu-nilai yang DITULIS platform dan tidak bisa dikirim klien
   * (mis. `cf-connecting-ip` di belakang Cloudflare). Hanya isi kalau proxy
   * terdepan memang menimpanya — di hosting lain header ini bisa dikarang.
   */
  readonly trustedHeader?: string | undefined;
}

/**
 * IP klien dari header proxy.
 *
 * Entri TERAKHIR `x-forwarded-for`, bukan yang pertama: proxy MENAMBAHKAN
 * alamat lawan bicaranya di ujung kanan dan meneruskan isi kiriman klien
 * apa adanya di sebelah kiri (Cloudflare, Nginx `proxy_add_x_forwarded_for`).
 * Memakai entri pertama berarti penyerang memilih IP-nya sendiri per request
 * — dan mengirim sampah (`x-forwarded-for: x`) menghasilkan "unknown", yang
 * mematikan batas per-IP sama sekali. Vercel menimpa header ini dengan satu
 * entri, jadi entri terakhir = entri pertama di sana.
 */
export function clientIpFrom(headers: Pick<Headers, 'get'>, { trustedHeader }: ClientIpOptions = {}): string {
  const raw = trustedHeader
    ? headers.get(trustedHeader)
    : (headers.get('x-forwarded-for')?.split(',').at(-1) ?? headers.get('x-real-ip'));
  const candidate = raw?.trim() ?? '';
  return /^[0-9a-f.:]{2,45}$/i.test(candidate) ? candidate.toLowerCase() : 'unknown';
}

/** HMAC-SHA256(secret, bagian…) sebagai 64 karakter hex. */
export async function hmacHex(secret: string, ...parts: readonly string[]): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(parts.join('\u0000')));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Tabel penghitung tidak pernah menyimpan IP/email mentah. */
export async function rateLimitBucket(
  rule: RateLimitRule,
  secret: string,
  ...parts: readonly string[]
): Promise<string> {
  return `${rule.name}:${await hmacHex(secret, ...parts)}`;
}

/**
 * Hash pengunjung unik untuk analitik acara (ADR-043). Hari WIB ikut
 * di-hash: orang yang sama menghasilkan hash BERBEDA besok, jadi tabel
 * dedup tidak bisa dipakai melacak seseorang lintas hari, dan IP tidak
 * pernah sampai ke database.
 */
export function eventVisitorHash(secret: string, day: string, ip: string, userAgent: string): Promise<string> {
  return hmacHex(secret, 'event-view', day, ip, userAgent.slice(0, 256));
}

/** Penghitung jendela geser in-memory — cermin `consume_rate_limit()` di SQL. */
export class MemoryRateLimiter {
  private readonly hits = new Map<string, number[]>();

  consume(bucket: string, limit: number, windowSeconds: number, now = Date.now()): boolean {
    const since = now - windowSeconds * 1000;
    const recent = (this.hits.get(bucket) ?? []).filter((at) => at >= since);
    if (recent.length >= limit) {
      this.hits.set(bucket, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(bucket, recent);
    return true;
  }
}
