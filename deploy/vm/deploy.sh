#!/usr/bin/env bash
# Deploy satu rilis di VM, dengan rollback otomatis (ADR-105).
#
#   ./deploy.sh <tag> <site-host>    # dipanggil workflow deploy-vm.yml lewat SSH
#   ./deploy.sh --rollback           # kembali ke rilis sehat sebelumnya (manual)
#   ./deploy.sh --status             # tag aktif + riwayat
#
# Alur: pull image → app naik dengan tag baru → tunggu health "healthy"
# (DB terjangkau + dataMode supabase) → gagal = kembali ke tag sebelumnya dan
# keluar non-nol, jadi job Actions merah. Riwayat rilis sehat di releases.log;
# image tiga rilis terakhir disimpan di disk untuk rollback tanpa pull.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

RELEASES="$DIR/releases.log"
KEEP_RELEASES=3
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] GAGAL: %s\n' "$*" >&2; exit 1; }

# Satu deploy dalam satu waktu, juga terhadap rollback manual.
exec 9>"$DIR/.deploy.lock"
flock -n 9 || die "deploy lain sedang berjalan"

[[ -f app.env ]] || die "app.env belum ada — salin app.env.example, isi, chmod 600 (docs/deploy-vm.md)"
if [[ "$(stat -c '%a' app.env)" != "600" ]]; then
  log "PERINGATAN: app.env bukan chmod 600 — memperbaiki"
  chmod 600 app.env
fi
if grep -Eq '^[[:space:]]*ALLOW_DEMO_IN_PRODUCTION=[[:space:]]*(true|1)' app.env; then
  die "ALLOW_DEMO_IN_PRODUCTION menyala di app.env — produksi tidak boleh melayani data contoh"
fi

# Ubah satu kunci di .env tanpa menyentuh kunci lain (APP_MEM_LIMIT dsb.).
set_var() {
  local key="$1" value="$2"
  touch .env
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}
get_var() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }

current_tag() { get_var IMAGE_TAG; }
previous_healthy_tag() {
  local current="$1"
  [[ -f "$RELEASES" ]] || return 0
  awk '{print $2}' "$RELEASES" | grep -vx -- "$current" | tail -1 || true
}

wait_healthy() {
  local id status waited=0
  id="$(docker compose ps -q app)"
  [[ -n "$id" ]] || return 1
  while (( waited < HEALTH_TIMEOUT )); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo missing)"
    case "$status" in
      healthy) return 0 ;;
      unhealthy|missing) return 1 ;;
    esac
    sleep 3
    waited=$(( waited + 3 ))
  done
  return 1
}

start_tag() {
  set_var IMAGE_TAG "$1"
  docker compose up -d --remove-orphans
}

prune_images() {
  local image keep
  image="$(get_var IMAGE)"; image="${image:-ghcr.io/valvasas/studentfo}"
  [[ -f "$RELEASES" ]] || return 0
  keep="$(awk '{print $2}' "$RELEASES" | tail -n "$KEEP_RELEASES")"
  docker image ls "$image" --format '{{.Tag}}' | while read -r tag; do
    [[ -z "$tag" || "$tag" == "<none>" ]] && continue
    grep -qx -- "$tag" <<<"$keep" && continue
    [[ "$tag" == "$(current_tag)" ]] && continue
    docker image rm "$image:$tag" >/dev/null 2>&1 || true
  done
  docker image prune -f >/dev/null
}

record_release() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$RELEASES"; }

case "${1:-}" in
  --status)
    echo "Aktif: $(current_tag)"
    [[ -f "$RELEASES" ]] && tail -n 10 "$RELEASES"
    docker compose ps
    exit 0
    ;;
  --rollback)
    target="$(previous_healthy_tag "$(current_tag)")"
    [[ -n "$target" ]] || die "tidak ada rilis sehat sebelumnya di releases.log"
    log "rollback manual: $(current_tag) → $target"
    start_tag "$target"
    wait_healthy || die "rilis $target juga tidak sehat — periksa: docker compose logs app"
    record_release "$target"
    log "aktif: $target"
    exit 0
    ;;
  ''|-*)
    die "pemakaian: deploy.sh <tag> <site-host> | --rollback | --status"
    ;;
esac

new_tag="$1"
site_host="${2:-$(get_var SITE_HOST)}"
[[ "$new_tag" =~ ^[A-Za-z0-9_.-]{1,128}$ ]] || die "tag tidak valid: $new_tag"
[[ "$site_host" =~ ^[A-Za-z0-9.-]+$ ]] || die "SITE_HOST tidak valid/kosong: '$site_host'"

old_tag="$(current_tag)"
[[ -n "$(get_var IMAGE)" ]] || set_var IMAGE ghcr.io/valvasas/studentfo
set_var SITE_HOST "$site_host"

log "pull $new_tag"
set_var IMAGE_TAG "$new_tag"
docker compose pull app || { [[ -n "$old_tag" ]] && set_var IMAGE_TAG "$old_tag"; die "pull gagal"; }

log "menjalankan $new_tag (sebelumnya: ${old_tag:-tidak ada})"
start_tag "$new_tag"

if wait_healthy; then
  record_release "$new_tag"
  prune_images
  log "sehat: $new_tag"
  exit 0
fi

log "rilis $new_tag TIDAK sehat dalam ${HEALTH_TIMEOUT} dtk. 40 baris log terakhir:"
docker compose logs --no-color --tail 40 app >&2 || true

# Hanya rilis yang pernah lolos health check — tag yang sedang jalan belum
# tentu sehat (mis. deploy sebelumnya juga gagal tanpa cadangan).
rollback="$(previous_healthy_tag "$new_tag")"
if [[ -n "$rollback" ]]; then
  log "rollback otomatis → $rollback"
  start_tag "$rollback"
  if wait_healthy; then
    log "rollback sehat: $rollback (rilis $new_tag DITOLAK)"
  else
    log "rollback $rollback juga tidak sehat — kemungkinan Supabase/app.env, bukan image"
  fi
else
  log "tidak ada rilis sebelumnya untuk rollback (deploy pertama?)"
fi
exit 1
