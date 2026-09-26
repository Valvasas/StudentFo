import 'server-only';
import { headers } from 'next/headers';
import { getEventRepository } from '@/lib/data';
import { dataMode, env } from '@/lib/env';
import { clientIpFrom, rateLimitBucket, type RateLimitRule } from '@/lib/rate-limit';
import { TURNSTILE_RESPONSE_FIELD, verifyTurnstile } from '@/lib/turnstile';

const processSecret = crypto.randomUUID();

/**
 * Kunci HMAC ember. Di mode Supabase kuncinya WAJIB sama di semua instance —
 * tanpa RATE_LIMIT_SECRET dipakai service role key (sudah rahasia server, dan
 * HMAC tidak membocorkannya). Di mode seed penghitungnya memang per proses,
 * jadi kunci acak per proses cukup.
 */
function bucketSecret(): string {
  return env.RATE_LIMIT_SECRET ?? (dataMode === 'supabase' ? env.SUPABASE_SERVICE_ROLE_KEY : undefined) ?? processSecret;
}

export async function currentClientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

/**
 * `true` kalau SALAH SATU aturan terlampaui untuk IP ini. Setiap aturan
 * dihitung (tidak berhenti di yang pertama) supaya penolakan di satu ember
 * tidak membuat ember lain luput mencatat percobaan.
 *
 * IP tidak diketahui → tidak dibatasi. Kalau hosting tidak mengirim header IP,
 * semua pengunjung akan berbagi SATU ember "unknown" dan batas per-IP berubah
 * jadi batas global yang mengunci semua orang sekaligus.
 */
export async function isRateLimited(
  ip: string,
  checks: readonly (readonly [RateLimitRule, ...string[]])[],
): Promise<boolean> {
  if (ip === 'unknown') {
    warnUnknownIpOnce();
    return false;
  }
  const repository = await getEventRepository();
  const secret = bucketSecret();
  const results = await Promise.all(
    checks.map(async ([rule, ...parts]) =>
      repository.consumeRateLimit(await rateLimitBucket(rule, secret, ip, ...parts), rule.limit, rule.windowSeconds),
    ),
  );
  return results.some((allowed) => !allowed);
}

let warnedUnknownIp = false;
function warnUnknownIpOnce(): void {
  if (warnedUnknownIp) return;
  warnedUnknownIp = true;
  console.warn('[rate-limit] IP klien tidak terbaca (x-forwarded-for/x-real-ip kosong); batas per-IP nonaktif.');
}

export const isCaptchaEnabled = (): boolean => Boolean(env.TURNSTILE_SECRET_KEY);

/** Lolos otomatis kalau Turnstile tidak dikonfigurasi (dev, demo, CI). */
export async function passesCaptcha(formData: FormData, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  const token = formData.get(TURNSTILE_RESPONSE_FIELD);
  return verifyTurnstile({
    token: typeof token === 'string' ? token : '',
    secret: env.TURNSTILE_SECRET_KEY,
    remoteIp: ip,
  });
}
