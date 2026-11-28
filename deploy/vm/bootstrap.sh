#!/usr/bin/env bash
# Menyiapkan VM Ubuntu 24.04 (x86_64) untuk StudentFo. IDEMPOTEN: aman
# dijalankan ulang kapan saja (mis. setelah VM dibuat ulang).
#
#   sudo DEPLOY_USER=deploy bash bootstrap.sh
#
# Opsi (variabel lingkungan):
#   DEPLOY_USER=deploy        user non-root yang dipakai GitHub Actions (SSH)
#   SSH_ALLOW_FROM=           CIDR yang boleh SSH (mis. 203.0.113.7/32). Kosong =
#                             semua IP dengan pembatas laju ufw. Lihat catatan
#                             runner GitHub di docs/deploy-vm.md § SSH.
#   SWAP_SIZE_GB=2            swap dibuat bila RAM < 2 GB
#   AUTO_REBOOT_UTC=20:30     reboot otomatis setelah patch kernel (03:30 WIB);
#                             kosongkan untuk mematikan
#   APP_DIR=/opt/studentfo
set -Eeuo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SSH_ALLOW_FROM="${SSH_ALLOW_FROM:-}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
AUTO_REBOOT_UTC="${AUTO_REBOOT_UTC-20:30}"
APP_DIR="${APP_DIR:-/opt/studentfo}"

log() { printf '\n[bootstrap] %s\n' "$*"; }
die() { printf '[bootstrap] GAGAL: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "jalankan dengan sudo"
[[ "$(uname -m)" == "x86_64" ]] || die "arsitektur $(uname -m): image dibangun untuk x86_64 (ADR-105)"
# shellcheck source=/dev/null
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || die "skrip ini untuk Ubuntu (terdeteksi: ${ID:-?})"

export DEBIAN_FRONTEND=noninteractive

log "Paket dasar"
apt-get update -q
apt-get install -yq ca-certificates curl gnupg ufw unattended-upgrades jq

log "Zona waktu UTC (tenggat WIB dihitung aplikasi sendiri, src/lib/deadline.ts)"
timedatectl set-timezone Etc/UTC

log "Docker Engine + compose plugin (repo resmi Docker)"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

log "Rotasi log Docker (default untuk semua container)"
daemon_json='{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}'
if [[ "$(cat /etc/docker/daemon.json 2>/dev/null)" != "$daemon_json" ]]; then
  mkdir -p /etc/docker
  printf '%s\n' "$daemon_json" > /etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker >/dev/null

log "User deploy: $DEPLOY_USER"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
# Anggota grup docker = setara root di mesin ini. Diterima: VM hanya
# menjalankan StudentFo dan kunci SSH user ini hanya ada di GitHub Secrets.
usermod -aG docker "$DEPLOY_USER"
install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

log "SSH: kunci saja, tanpa login root"
auth_keys="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)/.ssh/authorized_keys"
if [[ -s "$auth_keys" ]]; then
  cat > /etc/ssh/sshd_config.d/10-studentfo.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
SSHD
  sshd -t || die "konfigurasi sshd tidak valid — tidak dimuat ulang"
  systemctl reload ssh
else
  # Mematikan login sandi tanpa kunci terpasang = terkunci di luar VM.
  echo "PERINGATAN: $auth_keys kosong — pengerasan SSH DILEWATI. Pasang kunci publik lalu jalankan ulang."
fi

log "Firewall (ufw)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
if [[ -n "$SSH_ALLOW_FROM" ]]; then
  ufw allow from "$SSH_ALLOW_FROM" to any port 22 proto tcp >/dev/null
else
  ufw limit 22/tcp >/dev/null
fi
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ufw status verbose
# Catatan: port yang dipublikasikan Docker (80/443) melewati rantai ufw.
# Karena itu compose TIDAK mempublikasikan port 3000 sama sekali.

log "Pembaruan keamanan otomatis"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
APT
if [[ -n "$AUTO_REBOOT_UTC" ]]; then
  cat > /etc/apt/apt.conf.d/52studentfo-reboot <<APT
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "$AUTO_REBOOT_UTC";
APT
else
  rm -f /etc/apt/apt.conf.d/52studentfo-reboot
fi

log "Swap"
mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
if (( mem_kb < 2 * 1024 * 1024 )); then
  if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
    [[ -f /swapfile ]] || { fallocate -l "${SWAP_SIZE_GB}G" /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null; }
    swapon /swapfile
  fi
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-studentfo-swap.conf
  sysctl -q --system
  echo "RAM $((mem_kb / 1024)) MB → swap ${SWAP_SIZE_GB} GB aktif. Set APP_MEM_LIMIT=600m, APP_HEAP_MB=448 di $APP_DIR/.env."
else
  echo "RAM $((mem_kb / 1024)) MB — swap tidak perlu."
fi

log "Pembersihan image mingguan (rilis yang disimpan dijaga deploy.sh)"
cat > /etc/cron.d/studentfo-docker-prune <<'CRON'
# Hapus image menggantung & build cache tiap Minggu 19:00 UTC (02:00 WIB).
0 19 * * 0 root docker image prune -f >/dev/null 2>&1; docker builder prune -f >/dev/null 2>&1
CRON

log "Selesai. Langkah berikutnya (docs/deploy-vm.md § Cutover):"
echo "  1. sudo -u $DEPLOY_USER cp app.env.example $APP_DIR/app.env && chmod 600 $APP_DIR/app.env, lalu isi nilainya"
echo "  2. Jalankan workflow 'Deploy VM' di GitHub Actions"
