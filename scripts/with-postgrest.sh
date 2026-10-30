#!/usr/bin/env bash
# Siapkan Postgres (database baru + semua migration) dan PostgREST
# SUNGGUHAN, jalankan perintah yang diberikan, lalu bereskan. Dipakai oleh:
#   npm run test:integration   (Vitest, SupabaseEventRepository)
#   npm run test:e2e:supabase  (build produksi Next.js dalam mode Supabase)
#   npm run test:integration:services — sama dengan test:integration, ditambah
#     GoTrue & Storage SUNGGUHAN (Docker) yang membuat skema `auth`/`storage`
#     lebih dulu, seperti di Supabase. Membuktikan penangguhan (banned_until),
#     hapus akun (cascade skema auth asli), dan hapus berkas Storage (ADR-061).
#
# Kenapa bukan `supabase start`: repository hanya berbicara ke PostgREST
# (tidak memanggil Auth API), dan Postgres + satu binary PostgREST jauh lebih
# ringan & bisa jalan di mana pun `db:test` jalan. Batas `max_rows` disamakan
# dengan Supabase (1000) supaya bug pemotongan diam-diam ikut tertangkap.
#
# Pakai:  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
#           bash scripts/with-postgrest.sh <perintah…>
# Butuh: psql, Postgres >= 15, curl + tar (unduh PostgREST sekali ke .cache/).
set -euo pipefail

ADMIN_URL="${DATABASE_URL:?Set DATABASE_URL ke server Postgres (database apa saja).}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DB="studentfo_integration_test"
PGRST_VERSION="v12.2.3"
PGRST_PORT="${PGRST_PORT:-3900}"
PGRST_BIN="${POSTGREST_BIN:-$ROOT/.cache/postgrest/$PGRST_VERSION/postgrest}"
# Rahasia khusus uji; token dibuat ulang tiap proses oleh config Vitest.
export INTEGRATION_JWT_SECRET="studentfo-integration-secret-min-32-characters!!"
PSQL=(psql --quiet --no-psqlrc --set ON_ERROR_STOP=1)
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

base="${ADMIN_URL%%\?*}"
query=""
[[ "$ADMIN_URL" == *\?* ]] && query="?${ADMIN_URL#*\?}"
TEST_URL="${base%/*}/${TEST_DB}${query}"
# PostgREST login sebagai `authenticator` (pola Supabase), lalu SET ROLE sesuai JWT.
hostpart="${base#*://}"; hostpart="${hostpart#*@}"; hostpart="${hostpart%%/*}"
AUTHENTICATOR_URL="postgresql://authenticator:authenticator@${hostpart}/${TEST_DB}${query}"

if [[ ! -x "$PGRST_BIN" ]]; then
  echo "Mengunduh PostgREST ${PGRST_VERSION}…"
  mkdir -p "$(dirname "$PGRST_BIN")"
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/${PGRST_VERSION}/postgrest-${PGRST_VERSION}-linux-static-x64.tar.xz" \
    | tar -xJ -C "$(dirname "$PGRST_BIN")"
fi

"${PSQL[@]}" "$ADMIN_URL" \
  -c "DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)" -c "CREATE DATABASE ${TEST_DB}" >/dev/null
SERVICES_STARTED=0
if [[ "${WITH_SUPABASE_SERVICES:-0}" == "1" ]]; then
  # Urutan Supabase: GoTrue & Storage memigrasikan skemanya sendiri DULU, baru
  # migration aplikasi (bucket `payment-proofs` dibuat hanya bila storage ada).
  GOTRUE_IMAGE="${GOTRUE_IMAGE:-supabase/gotrue:v2.170.0}"
  STORAGE_IMAGE="${STORAGE_IMAGE:-supabase/storage-api:v1.14.5}"
  GOTRUE_PORT="${GOTRUE_PORT:-9999}"
  STORAGE_PORT="${STORAGE_PORT:-5000}"
  "${PSQL[@]}" "$ADMIN_URL" >/dev/null <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin;
  END IF;
  -- Dibuat di sini juga (stub membuatnya lagi secara idempoten): GRANT skema
  -- storage di bawah butuh role API sudah ada sebelum Storage bermigrasi.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END$$;
-- Selalu disetel ulang: role bisa tersisa dari run lain dengan sandi berbeda.
ALTER ROLE supabase_auth_admin LOGIN SUPERUSER PASSWORD 'supabase_auth_admin';
ALTER ROLE supabase_storage_admin LOGIN SUPERUSER PASSWORD 'supabase_storage_admin';
-- Seperti di Supabase: Storage menulis nama tabel tanpa skema.
ALTER ROLE supabase_storage_admin SET search_path = storage;
SQL
  # Meniru skrip init platform Supabase: tanpa USAGE + default privileges ini,
  # Storage API (yang `SET ROLE service_role` per request) tidak melihat
  # `buckets` sama sekali — "relation does not exist", bukan "permission denied".
  "${PSQL[@]}" "$TEST_URL" >/dev/null <<'SQL'
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
SQL
  jwt_for() {
    node -e 'const {createHmac}=require("node:crypto");const b=v=>Buffer.from(v).toString("base64url");const h=b(JSON.stringify({alg:"HS256",typ:"JWT"}));const p=b(JSON.stringify({role:process.argv[1],exp:Math.floor(Date.now()/1000)+86400}));process.stdout.write(h+"."+p+"."+createHmac("sha256",process.env.INTEGRATION_JWT_SECRET).update(h+"."+p).digest("base64url"))' "$1"
  }
  hostdb="${base#*://}"; hostdb="${hostdb#*@}"; hostdb="${hostdb%%/*}"
  docker rm -f sf-it-gotrue sf-it-storage >/dev/null 2>&1 || true
  docker run -d --name sf-it-gotrue --network host \
    -e GOTRUE_API_HOST=127.0.0.1 -e PORT="$GOTRUE_PORT" -e API_EXTERNAL_URL="http://127.0.0.1:${GOTRUE_PORT}" \
    -e GOTRUE_DB_DRIVER=postgres \
    -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:supabase_auth_admin@${hostdb}/${TEST_DB}?search_path=auth" \
    -e GOTRUE_SITE_URL=http://localhost:3000 -e GOTRUE_JWT_SECRET="$INTEGRATION_JWT_SECRET" -e GOTRUE_JWT_EXP=3600 \
    -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role -e GOTRUE_MAILER_AUTOCONFIRM=true \
    -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
    -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
    -e GOTRUE_LOG_LEVEL=warn "$GOTRUE_IMAGE" >/dev/null
  docker run -d --name sf-it-storage --network host \
    -e SERVER_PORT="$STORAGE_PORT" -e ANON_KEY="$(jwt_for anon)" -e SERVICE_KEY="$(jwt_for service_role)" \
    -e PGRST_JWT_SECRET="$INTEGRATION_JWT_SECRET" -e AUTH_JWT_SECRET="$INTEGRATION_JWT_SECRET" \
    -e DATABASE_URL="postgres://supabase_storage_admin:supabase_storage_admin@${hostdb}/${TEST_DB}" \
    -e DB_INSTALL_ROLES=false -e FILE_SIZE_LIMIT=52428800 -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/tmp/storage \
    -e TENANT_ID=stub -e REGION=local -e GLOBAL_S3_BUCKET=stub -e ENABLE_IMAGE_TRANSFORMATION=false "$STORAGE_IMAGE" >/dev/null
  SERVICES_STARTED=1
  for _ in $(seq 1 120); do
    curl -fs -o /dev/null "http://127.0.0.1:${GOTRUE_PORT}/health" && curl -fs -o /dev/null "http://127.0.0.1:${STORAGE_PORT}/status" && break
    sleep 0.5
  done
  curl -fs -o /dev/null "http://127.0.0.1:${GOTRUE_PORT}/health" || { echo "GoTrue tidak menyala:" >&2; docker logs sf-it-gotrue 2>&1 | tail -20 >&2; exit 1; }
  curl -fs -o /dev/null "http://127.0.0.1:${STORAGE_PORT}/status" || { echo "Storage tidak menyala:" >&2; docker logs sf-it-storage 2>&1 | tail -20 >&2; exit 1; }
  # Pengguna yang dibuat uji lewat SQL (createUser) harus terbaca GoTrue seperti
  # buatannya sendiri: instance_id UUID nol (kunci pencarian), aud/role, waktu,
  # dan kolom token string yang GoTrue tulis '' (Go menolak memindai NULL).
  "${PSQL[@]}" "$TEST_URL" >/dev/null <<'SQL'
DO $$
DECLARE
  col TEXT;
BEGIN
  ALTER TABLE auth.users ALTER COLUMN instance_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
  ALTER TABLE auth.users ALTER COLUMN aud SET DEFAULT 'authenticated';
  ALTER TABLE auth.users ALTER COLUMN role SET DEFAULT 'authenticated';
  ALTER TABLE auth.users ALTER COLUMN created_at SET DEFAULT now();
  ALTER TABLE auth.users ALTER COLUMN updated_at SET DEFAULT now();
  FOREACH col IN ARRAY ARRAY['confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                             'email_change_token_current', 'reauthentication_token', 'phone_change', 'phone_change_token'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = col) THEN
      EXECUTE format('ALTER TABLE auth.users ALTER COLUMN %I SET DEFAULT %L', col, '');
    END IF;
  END LOOP;
END$$;
SQL
  export GOTRUE_URL="http://127.0.0.1:${GOTRUE_PORT}"
  export STORAGE_URL="http://127.0.0.1:${STORAGE_PORT}"
fi

"${PSQL[@]}" "$TEST_URL" -f "$ROOT/supabase/tests/00_supabase_stub.sql" >/dev/null
for migration in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" "$TEST_URL" -f "$migration" >/dev/null || { echo "GAGAL ${migration#"$ROOT"/}" >&2; exit 1; }
done
"${PSQL[@]}" "$TEST_URL" >/dev/null <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN PASSWORD 'authenticator' NOINHERIT;
  END IF;
END$$;
GRANT anon, authenticated, service_role TO authenticator;
SQL

PGRST_DB_URI="$AUTHENTICATOR_URL" \
PGRST_DB_SCHEMAS=public \
PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET="$INTEGRATION_JWT_SECRET" \
PGRST_DB_MAX_ROWS=1000 \
PGRST_SERVER_PORT="$PGRST_PORT" \
PGRST_LOG_LEVEL=crit \
  "$PGRST_BIN" &
PGRST_PID=$!
cleanup() {
  kill "$PGRST_PID" 2>/dev/null || true
  wait "$PGRST_PID" 2>/dev/null || true
  [[ "$SERVICES_STARTED" == "1" ]] && docker rm -f sf-it-gotrue sf-it-storage >/dev/null 2>&1 || true
  [[ "${KEEP_DB:-0}" == "1" ]] || "${PSQL[@]}" "$ADMIN_URL" -c "DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)" >/dev/null
}
trap cleanup EXIT

for _ in $(seq 1 50); do
  curl -fs -o /dev/null "http://127.0.0.1:${PGRST_PORT}/" && break
  sleep 0.2
done

export POSTGREST_URL="http://127.0.0.1:${PGRST_PORT}"
export INTEGRATION_DATABASE_URL="$TEST_URL"
"$@"
