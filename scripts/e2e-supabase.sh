#!/usr/bin/env bash
# e2e build PRODUKSI Next.js dalam mode Supabase, di atas Postgres + PostgREST
# sungguhan (dijalankan lewat scripts/with-postgrest.sh — lihat
# `npm run test:e2e:supabase`). Membuktikan hal yang tidak bisa dibuktikan
# mode seed: Data Cache + revalidateTag, klien publik tanpa cookie di dalam
# unstable_cache, dan alur admin dengan sesi Supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STACK_PORT=54321
APP_PORT=3200
: "${INTEGRATION_JWT_SECRET:?jalankan lewat scripts/with-postgrest.sh}"

jwt() {
  node -e '
    const { createHmac } = require("node:crypto");
    const b = (v) => Buffer.from(v).toString("base64url");
    const h = b(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const p = b(JSON.stringify({ role: process.argv[1], aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 }));
    const s = createHmac("sha256", process.env.INTEGRATION_JWT_SECRET).update(h + "." + p).digest("base64url");
    process.stdout.write(h + "." + p + "." + s);
  ' "$1"
}

export NEXT_PUBLIC_SUPABASE_URL="http://localhost:${STACK_PORT}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(jwt anon)"
export SUPABASE_SERVICE_ROLE_KEY="$(jwt service_role)"
export NEXT_PUBLIC_SITE_URL="http://localhost:${APP_PORT}"
export NEXT_DIST_DIR=".next-supabase"
export STACK_URL="$NEXT_PUBLIC_SUPABASE_URL"
export APP_URL="$NEXT_PUBLIC_SITE_URL"

# Server lama yang masih memegang port = uji diam-diam berjalan terhadap
# build LAMA dan lolos karena alasan yang salah. Gagal keras, jangan menebak.
for port in "$STACK_PORT" "$APP_PORT"; do
  if curl -s -o /dev/null "http://localhost:${port}/"; then
    echo "Port ${port} sudah dipakai proses lain — hentikan dulu (server uji sebelumnya?)." >&2
    exit 1
  fi
done

STACK_PORT=$STACK_PORT node scripts/local-supabase-stack.mjs &
STACK_PID=$!
APP_PID=""
cleanup() {
  [[ -n "$APP_PID" ]] && kill "$APP_PID" 2>/dev/null || true
  kill "$STACK_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT

npx next build > /tmp/studentfo-e2e-supabase-build.log 2>&1 || { tail -30 /tmp/studentfo-e2e-supabase-build.log; exit 1; }
# `node …/next` langsung, BUKAN `npx next`: kill ke PID npx tidak menghentikan
# next-server anaknya, dan server yatim itu melayani run berikutnya.
node node_modules/next/dist/bin/next start --port "$APP_PORT" > /tmp/studentfo-e2e-supabase-server.log 2>&1 &
APP_PID=$!
for _ in $(seq 1 60); do curl -fs -o /dev/null "$APP_URL/" && break; sleep 0.5; done

npx playwright test --config playwright.supabase.config.ts "${@}"
