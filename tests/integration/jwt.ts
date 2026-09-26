import { createHmac } from 'node:crypto';

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** JWT HS256 seperti yang diterbitkan Supabase Auth — cukup untuk PostgREST memilih peran. */
export function signJwt(claims: Record<string, unknown>, secret: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, ...claims }),
  );
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}
