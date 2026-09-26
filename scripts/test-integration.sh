#!/usr/bin/env bash
# Integration test SupabaseEventRepository terhadap Postgres + PostgREST
# SUNGGUHAN (komponen yang sama yang dipanggil supabase-js di produksi).
#
# Kenapa bukan `supabase start`: repository hanya berbicara ke PostgREST
# (tidak memanggil Auth API), dan Postgres + satu binary PostgREST jauh lebih
# ringan & bisa jalan di mana pun `db:test` jalan. Batas `max_rows` disamakan
# dengan Supabase (1000) supaya bug pemotongan diam-diam ikut tertangkap.
#
# Pakai:  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
#           npm run test:integration
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
  [[ "${KEEP_DB:-0}" == "1" ]] || "${PSQL[@]}" "$ADMIN_URL" -c "DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)" >/dev/null
}
trap cleanup EXIT

for _ in $(seq 1 50); do
  curl -fs -o /dev/null "http://127.0.0.1:${PGRST_PORT}/" && break
  sleep 0.2
done

export POSTGREST_URL="http://127.0.0.1:${PGRST_PORT}"
export INTEGRATION_DATABASE_URL="$TEST_URL"
VITE_CONFIG_NATIVE_IGNORE_WARNING=true npx vitest run --config vitest.integration.config.ts "$@"
