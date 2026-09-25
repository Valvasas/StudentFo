#!/usr/bin/env bash
# Terapkan SEMUA migration ke database kosong, lalu jalankan test SQL.
#
# Kenapa ada: migration 0001 pernah gagal total di Postgres modern
# (konfigurasi FTS `indonesian`, DEVIATIONS.md #1) tanpa ada yang tahu,
# karena tidak ada satu pun proses yang benar-benar menjalankannya.
#
# Pakai:  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
#           npm run db:test
# Butuh `psql` dan Postgres >= 15 (samakan dengan versi Supabase).
set -euo pipefail

ADMIN_URL="${DATABASE_URL:?Set DATABASE_URL ke server Postgres (database apa saja).}"
TEST_DB="studentfo_migration_test"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql --quiet --no-psqlrc --set ON_ERROR_STOP=1)
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

# Ganti nama database di ujung URL, pertahankan query string (?sslmode=…).
base="${ADMIN_URL%%\?*}"
query=""
[[ "$ADMIN_URL" == *\?* ]] && query="?${ADMIN_URL#*\?}"
TEST_URL="${base%/*}/${TEST_DB}${query}"

"${PSQL[@]}" "$ADMIN_URL" -c "DROP DATABASE IF EXISTS ${TEST_DB}" -c "CREATE DATABASE ${TEST_DB}" >/dev/null

run() {
  local file="$1"
  if ! "${PSQL[@]}" "$TEST_URL" -f "$file" >/dev/null; then
    echo "GAGAL  ${file#"$ROOT"/}" >&2
    exit 1
  fi
  echo "ok     ${file#"$ROOT"/}"
}

run "$ROOT/supabase/tests/00_supabase_stub.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do run "$migration"; done
for test in "$ROOT"/supabase/tests/[1-9]*.test.sql; do
  [[ -e "$test" ]] && run "$test"
done

"${PSQL[@]}" "$ADMIN_URL" -c "DROP DATABASE IF EXISTS ${TEST_DB}" >/dev/null
echo "Semua migration & test SQL lolos."
