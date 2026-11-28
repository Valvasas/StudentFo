# Deploy ke VM Linux (Docker + Caddy) — ADR-105

Status 28 Nov 2026: **berkas & workflow siap, belum pernah jalan di VM sungguhan.**
Belum ada akun Azure/VM, jadi semua yang butuh VM nyata di bawah ini bertanda
⚪ belum teruji. Yang SUDAH diuji di lingkungan pengerjaan (Docker 29, Caddy 2)
dicatat di § Bukti uji.

Runbook harian (deploy, rollback, rotasi rahasia, debug): [`deploy/vm/README.md`](../deploy/vm/README.md).

Legenda: 👤 hanya pemilik · ⚠ cek dulu, jangan diasumsikan · ⚪ belum teruji.

---

## 1. Kenapa VM

| Pilihan | Penghalang |
|---|---|
| Vercel Hobby | Di-pause 28 Nov 2026: Fast Origin Transfer 11,63/10 GB, Fluid Active CPU 4j20m/4j. Melarang penggunaan komersial |
| Cloudflare Workers Free | CPU 10 ms/permintaan; terukur `/` ±43 ms, `/events` ±31 ms (Node, perkiraan) → Error 1102 di hampir semua halaman |
| Cloudflare Workers Paid | US$5/bulan — belum ada dana. Tetap jalur cadangan (ADR-103, [`deploy-cloudflare.md`](deploy-cloudflare.md)) |
| **VM + Docker + Caddy** | Tanpa kuota CPU-jam/transfer origin. Kredit mahasiswa (target Azure for Students). Harus dirawat sendiri |

Semua halaman dinamis (CSP bernonce per permintaan, ADR-027), jadi tiap
kunjungan = satu render penuh. Di VM itu tidak dihitung per eksekusi; bebannya
(±640K permintaan/bulan ≈ 0,25 permintaan/detik × ±24 ms CPU) hanya beberapa
persen satu vCPU.

## 2. Bentuknya

```
Pengunjung ──HTTPS──► Caddy :443 (TLS Let's Encrypt, HTTP→HTTPS, gzip/zstd)
                        │  Host asli diteruskan, X-Forwarded-For ditulis ulang
                        ▼
                      app :3000 (Next.js standalone, non-root, tidak dipublikasikan)
                        │
                        ▼
                      Supabase ap-southeast-1 (data, auth, storage)

GitHub Actions: CI hijau di main → Deploy VM: build image → ghcr.io → SSH → deploy.sh
GitHub Actions (cron, tidak berubah): send-deadline-emails & import-event-media → https://<host>/api/cron/*
```

VM **stateless**: semua data di Supabase. VM hilang = jalankan ulang
`bootstrap.sh`, salin `app.env`, jalankan workflow.

## 3. 👤 Menyiapkan Azure

### 3.1 Akun & batas
- Azure for Students (https://azure.microsoft.com/free/students) dengan email kampus.
  ⚠ Email Polindra belum terbukti lolos verifikasi. Gagal → GitHub Student
  Developer Pack → DigitalOcean (butuh kartu/PayPal). Oracle Always Free **tidak**
  cocok untuk produksi (instance idle bisa di-reclaim).
- ⚠ Baca ketentuan penggunaan komersial akun student. Sekarang StudentFo demo
  non-komersial; begitu ada monetisasi, evaluasi ulang hosting.
- ⚠ Region: akun student sering dibatasi (`RequestDisallowedByAzure`). Targetkan
  **Southeast Asia** (Singapura, sama dengan Supabase). Tidak boleh → region Asia
  terdekat yang diizinkan, lalu catat latensi ke Supabase di tabel § 9 (tiap
  halaman = beberapa panggilan PostgREST berurutan; latensi dikalikan).
- Pasang **budget alert** (Cost Management → Budgets) 50% & 80% kredit, plus
  pengingat kalender **bulan ke-10** untuk menyiapkan pindah saat kredit habis.

### 3.2 VM
- Ubuntu 24.04 LTS, **x86_64** (image dibangun `linux/amd64`; `bootstrap.sh` menolak ARM).
- ⚠ RAM: cek angka SKU di portal, jangan asumsikan. ≥ 2 GB lebih aman (Next.js +
  render poster PNG). 1 GB masih bisa: `bootstrap.sh` membuat swap 2 GB, lalu set
  `APP_MEM_LIMIT=600m` & `APP_HEAP_MB=448` di `/opt/studentfo/.env`.
- ⚠ Cek "Free services" akun student: apakah ada jatah jam VM gratis untuk SKU
  tertentu. Isi tabel biaya § 8 dengan angka dari portal.
- IP publik **Standard, statis** (A record tidak berubah). ⚠ IP Standard biasanya
  berbayar kecil per jam — masukkan ke hitungan.

```bash
az login
az vm list-skus -l southeastasia --size Standard_B -o table   # pilih yang tanpa "Restrictions"
az group create -n studentfo-rg -l southeastasia
az vm create -g studentfo-rg -n studentfo-vm \
  --image Ubuntu2404 --size <SKU x86 pilihan> \
  --admin-username deploy --ssh-key-values ~/.ssh/studentfo_deploy.pub \
  --public-ip-sku Standard --public-ip-address-dns-name studentfo-<unik>
az vm open-port -g studentfo-rg -n studentfo-vm --port 80  --priority 900
az vm open-port -g studentfo-rg -n studentfo-vm --port 443 --priority 901
```

Kunci SSH khusus deploy: `ssh-keygen -t ed25519 -f ~/.ssh/studentfo_deploy -C studentfo-deploy`
(tanpa passphrase karena dipakai Actions). Kunci **privat** hanya ke GitHub Secret
`VM_SSH_KEY`, tidak pernah ke repo/chat.

### 3.3 SSH & firewall — catatan runner GitHub
Runner GitHub-hosted berganti IP di tiap job (rentangnya ribuan dan berubah),
jadi **membatasi port 22 hanya ke IP pemilik akan memutus deploy**. Yang dipakai:
login kunci saja, tanpa root, tanpa sandi (`bootstrap.sh`), `ufw limit 22`
(pembatas laju), dan kunci host dipatok di Actions (`VM_SSH_KNOWN_HOSTS`).
Kalau ingin port 22 tertutup total: runner self-hosted atau Tailscale — di luar
lingkup sekarang.

Docker mempublikasikan 80/443 lewat iptables-nya sendiri (melewati ufw). Itu
sebabnya compose **tidak** mempublikasikan port 3000; NSG Azure tetap lapisan
luar.

### 3.4 Bootstrap
```bash
scp deploy/vm/bootstrap.sh deploy/vm/app.env.example deploy@<ip>:~
ssh deploy@<ip>
sudo DEPLOY_USER=deploy bash bootstrap.sh
cp app.env.example /opt/studentfo/app.env && chmod 600 /opt/studentfo/app.env
nano /opt/studentfo/app.env    # isi nilai, § 5
```
Yang dipasang: Docker Engine + compose plugin (repo resmi), rotasi log Docker
10 MB × 3, user `deploy` di grup docker, SSH kunci-saja, ufw (80/443 + 22
dibatasi laju), `unattended-upgrades` + reboot otomatis 20:30 UTC (03:30 WIB)
bila kernel diperbarui, swap 2 GB bila RAM < 2 GB, zona waktu UTC (tenggat WIB
dihitung aplikasi, `src/lib/deadline.ts`), pembersihan image mingguan.
Idempoten — aman diulang. Pengerasan SSH dilewati (dengan peringatan) bila
`authorized_keys` kosong, supaya tidak mengunci diri sendiri.

## 4. 👤 Domain & hostname — putuskan SEBELUM build pertama

`NEXT_PUBLIC_SITE_URL` dibekukan ke image saat build: tautan email, OAuth,
sitemap, OG, robots, dan `allowedOrigins` Server Action. Satu image = satu
hostname. Mengganti hostname nanti = build ulang + ubah Supabase Auth URL +
tautan di email lama rusak.

| Pilihan | Langkah |
|---|---|
| `studentfo.com` (⚠ TASKS mencatat belum dibeli; cek Vercel → Domains) | A record `@` → IP VM. `www`: A record ke IP yang sama, lalu buka blok `www` di `Caddyfile` |
| Belum punya domain | Label DNS Azure: `studentfo-<unik>.southeastasia.cloudapp.azure.com` (dari `--public-ip-address-dns-name`) |

Nama merek sedang dipertimbangkan diganti — jangan beli domain baru kalau tidak perlu.

## 5. Rahasia (👤, di `/opt/studentfo/app.env`)

Nilai lama di Vercel bertanda *Sensitive* tidak bisa dibaca lagi — kumpulkan
ulang di password manager. Daftar & komentar per variabel: `deploy/vm/app.env.example`.

| Variabel | Sumber | Catatan |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API keys (`sb_secret_…`) | wajib |
| `RATE_LIMIT_SECRET` | `openssl rand -hex 32` | nilai baru = bucket batas laju & hash pengunjung harian reset |
| `CRON_SECRET` | `openssl rand -hex 32` | **sama** dengan secret GitHub `CRON_SECRET` |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile | berpasangan; **tambahkan hostname baru** di widget |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_LINK_SECRET` | resend.com / `openssl rand -hex 32` | ketiganya atau tidak sama sekali (divalidasi saat start) |
| `ERROR_ALERT_WEBHOOK_URL` | Slack/Discord webhook | opsional |
| `LEGAL_OPERATOR_NAME`, `PRIVACY_CONTACT_EMAIL`, `PRIVACY_POLICY_EFFECTIVE_DATE`, `TERMS_EFFECTIVE_DATE` | pemilik | tanpa ini dokumen hukum berlabel DRAF |
| `CLIENT_IP_HEADER` | — | **kosong** (§ 7) |
| `ALLOW_DEMO_IN_PRODUCTION`, `DEMO_*` | — | **jangan ada**. `deploy.sh` menolak deploy bila menyala; health check juga |

`NEXT_PUBLIC_*` **tidak** di `app.env` — ikut dibekukan saat build dari
repository variables (§ 6).

## 6. 👤 GitHub, Supabase, Turnstile

**Settings → Secrets and variables → Actions:**

| Jenis | Nama | Isi |
|---|---|---|
| Variable | `NEXT_PUBLIC_SUPABASE_URL` | `https://urmmihzjkkbxcwfzvuao.supabase.co` |
| Variable | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | kunci anon/publishable (publik by design) |
| Variable | `NEXT_PUBLIC_SITE_URL` | `https://<host-final>` tanpa garis miring akhir |
| Variable | `DEPLOY_VM_ENABLED` | `true` — **terakhir**, setelah semua di atas siap |
| Variable (opsional) | `VM_APP_DIR`, `VM_SSH_PORT` | bawaan `/opt/studentfo`, `22` |
| Secret | `VM_HOST` | IP publik atau nama DNS VM |
| Secret | `VM_USER` | `deploy` |
| Secret | `VM_SSH_KEY` | isi `~/.ssh/studentfo_deploy` (privat) |
| Secret | `VM_SSH_KNOWN_HOSTS` | keluaran `ssh-keyscan -t ed25519 <ip-vm>` — jalankan dari jaringan tepercaya, cocokkan sidik jarinya dengan `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` di VM (konsol serial Azure) |
| Secret (ubah) | `SITE_URL` | `https://<host-final>` — dipakai `send-deadline-emails.yml` & `import-event-media.yml` |
| Secret | `CRON_SECRET` | sama dengan `app.env` |

Paket ghcr.io: ⚠ dibuat privat pada push pertama. Tidak perlu diubah — job
deploy meminjamkan `GITHUB_TOKEN`-nya (read:packages, kedaluwarsa saat job
selesai) ke VM untuk `docker pull`, lalu logout. Boleh juga dibuat publik
(isinya hanya nilai publik), tapi tidak wajib.

**Supabase → Authentication → URL Configuration:** Site URL = host baru; Redirect
URLs tambah `https://<host-baru>/auth/callback`. URL Vercel lama **dipertahankan**
selama masa cutover, hapus setelah stabil ≥ 48 jam. Redirect URI Google tetap
`https://urmmihzjkkbxcwfzvuao.supabase.co/auth/v1/callback` (tidak berubah).

**Turnstile:** tambahkan host baru di daftar hostname widget — tanpanya CAPTCHA
`/submit`, daftar, dan lupa sandi gagal.

**Resend** (bila email dinyalakan): domain pengirim terverifikasi SPF/DKIM/DMARC.

## 7. Jebakan khusus repo ini & cara ditangani

| # | Jebakan | Penanganan |
|---|---|---|
| 1 | `NEXT_PUBLIC_*` dibekukan saat build | Workflow memvalidasi ketiga variabel sebelum build; `SITE_HOST` Caddy diturunkan dari `NEXT_PUBLIC_SITE_URL` yang sama, jadi tidak bisa berbeda |
| 2 | CSRF Server Action (Origin vs Host) | Caddy meneruskan `Host` asli + `X-Forwarded-Host`. Terbukti lokal: Origin sama → aksi jalan; Origin asing → ditolak "Invalid Server Actions request" |
| 3 | IP klien & batas laju | Caddy (tanpa `trusted_proxies`) membuang `X-Forwarded-For` kiriman klien dan menulis IP koneksi; `clientIpFrom` membaca entri terakhir. Terbukti lokal: XFF palsu `6.6.6.6` tidak sampai ke aplikasi. `CLIENT_IP_HEADER` **kosong** |
| 3b | Cache data 300 dtk di memori proses | Satu container = satu cache, lebih efektif daripada isolate Workers. **Jangan** menjalankan >1 replika tanpa memikirkan cache & sesi lintas-instance |
| 4 | Demo menyala di produksi | Health check compose hanya "healthy" bila `"dataMode":"supabase"`; `deploy.sh` menolak `ALLOW_DEMO_IN_PRODUCTION=true`; workflow memeriksa health dari internet dengan `jq` |
| 5 | Render poster/slide PNG berat | `mem_limit` + `--max-old-space-size` di bawahnya (GC sebelum OOM-kill); pantau saat cron `:17` tiap jam |
| 6 | Unggah foto 32 MB | Caddy tidak membatasi badan permintaan; plafon dijaga Next |
| 7 | Workflow cron lain | `expire-events`, `deadline-notifications`, `ops-watchdog`, `scraper-cron` memanggil Supabase langsung → tidak berubah. Hanya `SITE_URL` untuk dua workflow yang perlu diganti |
| 8 | Turnstile | § 6 |
| 9 | Log memenuhi disk | json-file 10 MB × 3 per container (compose + `daemon.json`); `docker compose logs app` |
| 10 | Bot/crawler | `robots.ts` sudah menutup rute privat/berat (`/profile`, `/api/`, pengalih `/daftar`, dst.); tidak diubah. Bot nakal yang mengabaikan robots → Cloudflare di depan (di bawah) |
| 11 | Sitemap/robots/OG memakai `siteUrl` | Terbukti lokal: `Sitemap: https://<host>/sitemap.xml`, `<loc>` memakai host build |
| — | IPv6 | ⚠ Bila VM diberi IPv6 sementara Docker tidak, koneksi IPv6 lewat `docker-proxy` dan IP klien terlihat sebagai gateway → semua pengunjung IPv6 berbagi satu bucket batas laju. VM Azure bawaan hanya IPv4; jangan tambahkan IPv6 tanpa mengaktifkan IPv6 di Docker |

### Cloudflare di depan (opsional, gratis)
Proxy oranye Cloudflare (bukan Workers) menambah cache aset statis & penyaring
bot. Kalau dipasang: (1) `CLIENT_IP_HEADER=cf-connecting-ip` di `app.env`,
(2) **wajib** batasi 80/443 di NSG/ufw hanya ke rentang IP Cloudflare — tanpa
itu header bisa dipalsukan siapa pun yang mengakses IP VM langsung,
(3) SSL mode "Full (strict)". Belum dikerjakan.

## 8. Biaya (⚠ isi dari portal — angka di sini bukan janji)

| Pos | Tarif/bulan (dari portal) | Catatan |
|---|---|---|
| VM `<SKU>` | ⚠ | cek apakah termasuk jatah gratis akun student |
| Disk OS (managed disk) | ⚠ | |
| IP publik Standard statis | ⚠ | biasanya berbayar kecil walau VM gratis |
| Data keluar | ⚠ | ±12 GB/bulan dari data Vercel; cek kuota gratis |
| **Total** | ⚠ | Kredit USD 100 ÷ total = **bulan yang tersisa** |

## 9. Ukuran beban

| Ukuran | Lokal (Docker, mock Supabase, 4 vCPU) | VM sungguhan ⚪ |
|---|---|---|
| RAM app saat 50 permintaan berurutan | ±160 MiB | |
| CPU app saat itu | ±110% (satu inti penuh, permintaan berurutan) | |
| Rata-rata waktu respons `/` · `/events` | 64 ms · 41 ms (katalog kosong) | |
| Latensi VM → Supabase (`curl -w '%{time_total}' https://urmmihzjkkbxcwfzvuao.supabase.co/rest/v1/`) | — | |

Angka lokal memakai Supabase tiruan yang menjawab `[]`, jadi tidak ada data
untuk dirender dan tanpa latensi jaringan — hanya batas bawah. Ulangi di VM:
```bash
for p in / /events; do time (for i in $(seq 50); do curl -s -o /dev/null https://<host>$p; done); done &
docker stats --no-stream
```

## 10. Cutover (urutan aman)

Situs Vercel sedang di-pause, jadi tidak ada lalu lintas yang perlu dijaga.

1. 👤 VM + DNS siap; `bootstrap.sh` jalan; `app.env` terisi `chmod 600`.
2. 👤 Repository variables & secrets § 6 (`DEPLOY_VM_ENABLED=true` terakhir).
3. 👤 Supabase Redirect URL + Turnstile hostname.
4. Actions → **Deploy VM** → Run workflow (`main`). Deploy pertama: Caddy meminta
   sertifikat (DNS harus sudah menunjuk ke VM, port 80 terbuka); langkah
   "Periksa dari internet" menunggu hingga 3 menit.
5. Uji akseptansi § 11.
6. 👤 Secret `SITE_URL` → host baru; jalankan manual `send-deadline-emails` dan
   `import-event-media` (`workflow_dispatch`), baca log-nya (bukan hanya centangnya).
7. Stabil ≥ 48 jam: hapus Redirect URL Vercel lama, nonaktifkan project Vercel
   (opsional), monitor uptime eksternal (UptimeRobot/Better Stack free) yang
   menegaskan `"dataMode":"supabase"` dan memberi tahu pemilik.

## 11. Kriteria akseptansi

| Kriteria | Lokal (28 Nov) | VM ⚪ |
|---|---|---|
| `/api/health` → `{"status":"ok","dataMode":"supabase"}` | ✅ | |
| `/` 200, HSTS, CSP bernonce, tanpa `x-powered-by` & `Server`; HTTP → HTTPS (308) | ✅ | |
| `/`, `/events`, `/about`, `/login`, `/sitemap.xml`, `/robots.txt`, `/opengraph-image` 200, tanpa "demo/data contoh/fiktif" | ✅ (katalog kosong) | |
| `/events/<slug>` 200 | — (tiruan tanpa data) | |
| `/demo`, `/messages`, `/discussions` → 404 | ✅ | |
| Server Action: Origin sama jalan, Origin asing ditolak | ✅ | |
| XFF palsu tidak sampai ke aplikasi | ✅ | cek log `[rate-limit]`, tanpa "IP klien tidak terbaca" |
| `POST /api/cron/*` Bearer benar → 200/503-terkonfigurasi; salah/tanpa → 401 | ✅ | |
| Rilis rusak → rollback otomatis, job merah | ✅ | |
| `deploy.sh --rollback`, simpan 3 rilis, prune sisanya | ✅ | |
| Daemon Docker mati-hidup → app & caddy naik sendiri | ✅ | reboot VM sungguhan + sertifikat tetap valid |
| Sertifikat Let's Encrypt asli | — (lokal pakai CA internal Caddy) | |
| Daftar akun → email konfirmasi bertautan host final → callback | — | |
| Login sandi, login Google, keluar | — | |
| `/submit` dengan Turnstile asli + unggah foto ±5 MB | — | |
| Moderasi: PENDING → setujui → tampil di `/events` | — | |
| `docker stats` 50 permintaan | ✅ (§ 9) | |
| Monitor uptime eksternal | — | |
| Workflow `deploy-vm.yml` jalan di GitHub | — (butuh variables/secrets) | |

## 12. Bukti uji (lingkungan pengerjaan, 28 Nov 2026)

- Image dibangun dari `Dockerfile` repo (ditambah CA proxy lingkungan ini hanya
  untuk uji; Dockerfile repo tidak berubah). Build **gagal** dengan anon key < 20
  karakter (validasi env saat "Collecting page data") — karena itu workflow
  memeriksa panjangnya lebih dulu.
- Stack `deploy/vm/docker-compose.yml` + `Caddyfile` apa adanya, ditambah
  layanan Supabase tiruan (HTTP 200 `[]`) lewat override lokal; `SITE_HOST=sf.localhost`
  (CA internal Caddy).
- `deploy.sh`: deploy pertama sehat; rilis rusak (proses keluar) → rollback
  otomatis ke rilis sehat, keluar 1, image rusak dibersihkan; rollback manual;
  tolak `ALLOW_DEMO_IN_PRODUCTION=true`; tolak tag berkarakter shell.
- `shellcheck` bersih untuk `bootstrap.sh`, `deploy.sh`, dan semua langkah `run:`
  di workflow. `bootstrap.sh` **belum pernah dijalankan** (butuh Ubuntu 24.04 penuh
  dengan systemd) ⚪.
