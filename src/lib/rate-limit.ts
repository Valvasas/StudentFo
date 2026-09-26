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
} as const satisfies Record<string, RateLimitRule>;

/**
 * IP klien dari header proxy.
 *
 * `x-forwarded-for` hanya bisa dipercaya kalau proxy terdepan MENIMPANYA
 * (Vercel, Cloudflare, Nginx dengan `proxy_set_header`). Di hosting yang
 * meneruskan header kiriman klien apa adanya, penyerang bisa mengarang IP
 * per request — batas per IP jadi tidak berarti, walau batas per IP+email
 * dan CAPTCHA tetap bekerja. Entri PERTAMA dipakai karena itu yang ditulis
 * proxy terdepan.
 */
export function clientIpFrom(headers: Pick<Headers, 'get'>): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || headers.get('x-real-ip')?.trim() || '';
  return /^[0-9a-f.:]{2,45}$/i.test(candidate) ? candidate.toLowerCase() : 'unknown';
}

/** HMAC-SHA256(secret, bagian…) — tabel penghitung tidak pernah menyimpan IP/email mentah. */
export async function rateLimitBucket(
  rule: RateLimitRule,
  secret: string,
  ...parts: readonly string[]
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(parts.join('\u0000')));
  const hex = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${rule.name}:${hex}`;
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
