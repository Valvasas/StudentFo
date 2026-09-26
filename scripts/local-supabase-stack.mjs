// Tumpukan "Supabase" mini untuk e2e mode produksi (npm run test:e2e:supabase).
//
//   /rest/v1/*     → PostgREST sungguhan (POSTGREST_URL), request dihitung
//   /auth/v1/user  → verifikasi JWT HS256 seperti GoTrue getUser()
//   /__stats       → hitungan request per tabel/RPC (untuk membuktikan cache)
//
// BUKAN pengganti Supabase: tidak ada pendaftaran, sandi, OAuth, atau
// refresh token. Cukup untuk menjalankan build produksi Next.js dalam mode
// Supabase dengan pengguna yang "sudah masuk" lewat cookie sesi bertanda tangan.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.STACK_PORT ?? 54321);
const POSTGREST_URL = process.env.POSTGREST_URL ?? 'http://127.0.0.1:3900';
const SECRET = process.env.INTEGRATION_JWT_SECRET;
if (!SECRET) throw new Error('INTEGRATION_JWT_SECRET wajib diisi.');

const stats = new Map();

function verifyJwt(token) {
  const [header, payload, signature] = (token ?? '').split('.');
  if (!header || !payload || !signature) return null;
  const expected = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return claims.exp && claims.exp * 1000 < Date.now() ? null : claims;
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/__stats') {
    if (req.method === 'DELETE') stats.clear();
    return json(res, 200, Object.fromEntries(stats));
  }

  if (url.pathname === '/auth/v1/user') {
    const claims = verifyJwt(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!claims?.sub) return json(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    return json(res, 200, {
      id: claims.sub,
      aud: 'authenticated',
      role: 'authenticated',
      email: claims.email ?? `${claims.sub}@uji.example`,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    });
  }

  if (url.pathname.startsWith('/rest/v1')) {
    const target = url.pathname.slice('/rest/v1'.length) || '/';
    const key = `${req.method} ${target}`;
    stats.set(key, (stats.get(key) ?? 0) + 1);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    const upstream = await fetch(`${POSTGREST_URL}${target}${url.search}`, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    const outHeaders = Object.fromEntries(
      [...upstream.headers].filter(([name]) => !['content-encoding', 'transfer-encoding', 'content-length'].includes(name)),
    );
    res.writeHead(upstream.status, outHeaders);
    return res.end(body);
  }

  json(res, 404, { msg: `tidak didukung stack uji: ${url.pathname}` });
}).listen(PORT, () => console.log(`[stack] http://localhost:${PORT} → ${POSTGREST_URL}`));
