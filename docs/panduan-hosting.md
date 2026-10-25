# Panduan hosting StudentFo — langkah demi langkah

Untuk pemilik proyek yang meng-hosting StudentFo pertama kali. Kerjakan
**berurutan**: setiap fase hanya bergantung pada fase sebelumnya. Perkiraan
waktu total 3–5 jam, dan bisa dicicil per fase.

Yang kamu punya di akhir: situs di `https://domainmu`, database Supabase di
Singapura, server tanpa satu pun port web terbuka, CAPTCHA, monitor uptime,
dan rutinitas update + backup.

Dokumen pendamping: `docs/kesiapan-hosting.md` (audit & penghalang produk),
`deploy/` (berkas konfigurasi), `supabase/templates/` (template email).

> **Yang sudah diuji di sesi pembuatan panduan ini** (2026-10-25): image Docker
> dibangun dan dijalankan lewat `deploy/docker-compose.yml` (read-only,
> non-root, healthcheck `healthy`) terhadap Postgres + PostgREST lokal; perintah
> migrasi & backup di fase 3 dan 9 dijalankan terhadap database kosong; uji
> beban di § 0.3. **Belum pernah diuji**: project Supabase sungguhan, Cloudflare
> Tunnel, pengiriman email, dan penyedia VPS tertentu — tidak ada akses ke
> layanan itu dari lingkungan uji. Kalau satu langkah gagal, berhenti di situ
> dan catat pesan galatnya.

---

## 0. Rekomendasi & alasannya

### 0.1 Arsitektur yang direkomendasikan

```
Pengunjung ──HTTPS──▶ Cloudflare (DNS, TLS, WAF, CAPTCHA Turnstile) — gratis
                          │  Cloudflare Tunnel (koneksi KELUAR dari server)
                          ▼
              VPS Singapura 2 GB, Ubuntu 24.04 — tanpa port 80/443 terbuka
              └─ Docker Compose: app (Next.js) + cloudflared
                          │  HTTPS
                          ▼
              Supabase Singapura (Postgres, Auth, Storage)
```

Kenapa Singapura: setiap halaman dirender di server dengan beberapa panggilan
database berurutan, jadi aplikasi dan database **harus satu region**, dan
Singapura adalah region Supabase terdekat ke Indonesia.

Kenapa Cloudflare Tunnel: server tidak membuka port web sama sekali — tidak ada
yang bisa menyerang aplikasi tanpa lewat Cloudflare. Bonusnya, TLS/sertifikat
diurus Cloudflare (tidak perlu Nginx/Certbot), dan IP pengunjung yang dipakai
pembatas laju login/daftar tidak bisa dipalsukan.

### 0.2 Biaya

| Komponen | Pilihan | Biaya per bulan |
|---|---|---|
| Server | VPS 2 vCPU / 2 GB **di Singapura** (mis. IDCloudHost lokasi Singapura, ±Rp149 ribu; DigitalOcean 2 GB SGP1, ±$12) | ±Rp150–200 ribu |
| Database & auth | Supabase **Free** untuk mulai → **Pro $25** begitu ada data pengguna sungguhan | Rp0 → ±$25 |
| DNS, TLS, Tunnel, WAF, Turnstile | Cloudflare Free | Rp0 |
| Domain | `.com`/`.id`/`.my.id` (`.id` butuh dokumen identitas) | dibayar tahunan |
| Email transaksional (SMTP) | Resend / Brevo / sejenis — ada paket gratis untuk volume kecil | Rp0 di awal |
| Monitor uptime | UptimeRobot / Better Stack paket gratis | Rp0 |

Harga dari pencarian Oktober 2026 (sebagian dari agregator pihak ketiga) —
**cek halaman resmi sebelum membayar**. Sumber di § 13.

### 0.3 Berapa trafik yang sanggup ditangani — diukur, bukan ditebak

Build produksi dipatok ke **1 core CPU**, lalu dibanjiri 20 koneksi tanpa henti
selama 15 detik per rute (autocannon), 0 galat di semua rute:

| Rute | Permintaan/detik (jenuh) | Latensi p50 / p99 saat jenuh |
|---|---|---|
| `/` beranda tamu | 37 | 517 / 950 ms |
| `/events` | 36 | 530 / 711 ms |
| detail kegiatan | 55 | 346 / 513 ms |
| `/` beranda pengguna masuk | 44 | 436 / 605 ms |
| `/tracker`, `/connections` | 80 | ±240 / ±410 ms |
| `/api/health` | 403 | 47 / 103 ms |

Tanpa antrean (1 pengguna), render halaman 14–22 ms. RAM proses ±240 MB saat
diam, **±650 MB saat dibanjiri** (stabil, tidak terus naik). `next build`
memakai puncak **±1,76 GB**.

Artinya:
- Satu proses aplikasi ≈ ±36 halaman/detik di rute terberat ≈ ±700 orang yang
  aktif bersamaan (asumsi satu klik per 20 detik). Jauh di atas kebutuhan awal
  agregator pelajar; lonjakan viral tetap dilayani (melambat, bukan galat).
- Next.js berjalan sebagai **satu proses = satu core**. vCPU kedua dipakai OS,
  cloudflared, GC, dan build — bukan untuk melipatgandakan throughput.
- Paket **512 MB tidak cukup** (habis memori saat ramai). 1 GB minimum,
  **2 GB disarankan** + swap untuk build.
- Diukur di mode data contoh (tanpa jeda database). Di produksi, latensi
  database Singapura menambah waktu tunggu, bukan beban CPU.

### 0.4 Alternatif — dan kenapa bukan pilihan utama

| Opsi | Kenapa tidak dipilih |
|---|---|
| Vercel Hobby (gratis) | Ketentuannya melarang penggunaan komersial; StudentFo punya promosi & pembayaran → wajib Pro $20/orang/bln. Fungsi juga dibatasi ±4,5 MB per permintaan (unggahan tanpa JS gagal) dan region fungsi harus diubah manual ke `sin1` |
| Render Starter ($7) | 512 MB — kurang dari ±650 MB yang terukur. Yang cukup: Standard 2 GB $25 |
| Fly.io / Railway | Bisa (Docker, ada region Asia). Fly.io menaikkan harga RAM per Oktober 2026 dan mesin 512 MB-nya terlalu kecil; ketersediaan Singapura di paket Hobby Railway belum pasti. Biaya akhir mendekati VPS |
| Hetzner Singapura | Naik jadi ±€15,49/bln (Juni 2026) — tidak lagi murah |

Kalau tidak mau mengurus server sama sekali: **Vercel Pro + region `sin1`**
adalah jalan paling sederhana, dengan biaya ±$20 + Supabase. Panduan ini
memilih VPS karena paling murah untuk kapasitas yang sama, dan konfigurasinya
sudah teruji.

---

## 1. Persiapan (±30 menit)

### 1.1 Akun yang dibutuhkan

GitHub (sudah ada), Supabase, Cloudflare, penyedia VPS, registrar domain,
penyedia SMTP, monitor uptime.

**Wajib: aktifkan 2FA (aplikasi authenticator, bukan SMS) di SEMUA akun di
atas**, terutama GitHub, Supabase, Cloudflare, dan email yang dipakai untuk
mendaftar akun-akun itu. Akun Cloudflare yang dibobol = domainmu diambil alih;
akun Supabase yang dibobol = seluruh data pengguna.

### 1.2 Pengelola kata sandi

Pakai pengelola kata sandi (Bitwarden gratis, 1Password, dst). Semua rahasia di
panduan ini disimpan di sana, **bukan** di catatan HP, chat, atau screenshot.

### 1.3 Buat rahasia acak

Di terminal mana pun yang punya `openssl` (macOS, Linux, Git Bash Windows):

```bash
openssl rand -hex 32   # → RATE_LIMIT_SECRET
openssl rand -hex 32   # → CRON_SECRET (hanya kalau nanti bot pengingat dipakai)
```

Simpan keduanya di pengelola kata sandi.

### 1.4 Domain

Beli domain, **belum perlu** diatur apa pun — DNS-nya nanti dipindah ke
Cloudflare (fase 5).

---

## 2. VPS: buat & kunci (±60 menit)

### 2.1 Kunci SSH di laptopmu

```bash
ssh-keygen -t ed25519 -C "laptop-studentfo"   # Enter untuk lokasi bawaan, isi passphrase
cat ~/.ssh/id_ed25519.pub                      # ini yang ditempel ke penyedia VPS
```

### 2.2 Pesan VPS

- Sistem operasi **Ubuntu 24.04 LTS**, lokasi **Singapura**, 2 vCPU / 2 GB RAM.
- Metode login: **SSH key** (tempel isi `id_ed25519.pub`), bukan kata sandi.
- Kalau penyedia punya *cloud firewall*: izinkan **hanya port 22** masuk.

### 2.3 Login pertama, buat pengguna non-root

```bash
ssh root@IP_VPS
apt update && apt -y full-upgrade
adduser deploy                       # isi kata sandi kuat (untuk sudo), simpan di pengelola sandi
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

**Buka terminal BARU** dan pastikan ini berhasil sebelum lanjut — kalau tidak,
kamu bisa terkunci dari server sendiri:

```bash
ssh deploy@IP_VPS
sudo whoami     # harus mencetak: root
```

### 2.4 Kunci SSH (tanpa root, tanpa kata sandi)

Masih sebagai `deploy`:

```bash
sudo tee /etc/ssh/sshd_config.d/99-studentfo.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
EOF
sudo sshd -t && sudo systemctl restart ssh
```

Tes lagi dari terminal baru (`ssh deploy@IP_VPS` harus tetap bisa;
`ssh root@IP_VPS` harus ditolak).

### 2.5 Firewall, fail2ban, update otomatis

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
sudo apt -y install fail2ban unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # pilih "Yes"
```

Tidak ada port 80/443 yang dibuka — sengaja. Situs masuk lewat Cloudflare
Tunnel, koneksi yang dibuka server KE LUAR.

> ⚠️ Docker melewati UFW untuk port yang di-*publish*. Karena itu
> `deploy/docker-compose.yml` sengaja tidak punya `ports:`. **Jangan
> menambahkannya** — itu membuka aplikasi langsung ke internet dan membuat
> `CLIENT_IP_HEADER` bisa dipalsukan.

### 2.6 Swap 4 GB (wajib untuk build di VPS 2 GB)

Build butuh ±1,76 GB, aplikasi yang sedang jalan ±650 MB:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h     # baris Swap: 4.0Gi
```

### 2.7 Docker

Ikuti instalasi resmi untuk Ubuntu (repositori apt Docker):
<https://docs.docker.com/engine/install/ubuntu/>. Lalu:

```bash
sudo usermod -aG docker deploy
exit        # login ulang supaya grup berlaku
ssh deploy@IP_VPS
docker run --rm hello-world
docker compose version
```

Catatan keamanan: anggota grup `docker` setara root. Di server satu-admin ini
diterima; jangan menambahkan pengguna lain ke grup itu.

### 2.8 Ambil kode

Repo publik:

```bash
git clone https://github.com/Valvasas/StudentFo.git ~/StudentFo
```

Repo privat — pakai *deploy key* hanya-baca (bukan token akun pribadimu):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/studentfo_deploy -N "" -C "vps-deploy"
cat ~/.ssh/studentfo_deploy.pub
# GitHub → repo → Settings → Deploy keys → Add deploy key → tempel, JANGAN centang "Allow write access"
cat >> ~/.ssh/config <<'EOF'
Host github-studentfo
  HostName github.com
  User git
  IdentityFile ~/.ssh/studentfo_deploy
  IdentitiesOnly yes
EOF
git clone git@github-studentfo:Valvasas/StudentFo.git ~/StudentFo
```

Deploy dari branch `main` (gabungkan PR kesiapan hosting dulu).

---

## 3. Supabase: project & skema (±45 menit)

### 3.1 Buat project

Supabase → New project:
- Nama `studentfo`, region **Southeast Asia (Singapore)**.
- *Database password*: buat dengan pengelola sandi (panjang, acak), **simpan**.

Dua project lama di akunmu sedang dijeda (Seoul & Tokyo) — jangan dipakai;
regionnya jauh dari Indonesia.

> Sangat disarankan: lakukan fase 3 sekali dulu di project **uji** (paket Free
> mengizinkan 2 project aktif), hapus setelah semua migration lolos, baru ulangi
> di project produksi. Migration ini belum pernah diterapkan ke Supabase
> sungguhan.

### 3.2 Catat kunci

Project Settings → **API Keys**, tab *Publishable and secret API keys* (klik
*Create new API keys* bila belum ada):

| Nilai | Masuk ke | Sifat |
|---|---|---|
| Project URL `https://<ref>.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` | publik |
| Publishable key `sb_publishable_…` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publik (dilindungi RLS) |
| Secret key `sb_secret_…` | `SUPABASE_SERVICE_ROLE_KEY` | **RAHASIA** — mem-bypass RLS |

Pakai kunci format baru: kunci lama `anon`/`service_role` **berhenti berfungsi
akhir 2026** (dokumentasi resmi Supabase). Aplikasi (supabase-js 2.117) sudah
mendukung format baru. Pengecualian: pipeline scraper Python masih
`supabase==2.11.0`, yang **menolak** format baru — lihat § 11.

### 3.3 Terapkan 32 migration

Connection string: tombol **Connect** di dashboard → **Session pooler** (IPv4;
koneksi *direct* hanya IPv6, banyak VPS tidak mendukungnya) → salin dan ganti
`[YOUR-PASSWORD]` dengan password database.

Jalankan di VPS. Migration dijalankan dengan `psql` versi 17 dari image Docker
resmi (versi 16 bawaan Ubuntu terlalu tua untuk Postgres 17 Supabase):

```bash
cd ~/StudentFo
read -rsp "Tempel connection string Session pooler: " DB_URL; echo
export DB_URL
docker run --rm -i -e DB_URL -v "$PWD/supabase/migrations:/m:ro" postgres:17-alpine \
  sh -c 'for f in /m/*.sql; do echo ">> $(basename "$f")"; psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" || exit 1; done; echo SELESAI'
```

`read -rs` menjaga password keluar dari riwayat shell. Harus berakhir dengan
`SELESAI`. Pesan `NOTICE` normal. Kalau berhenti dengan `ERROR`: **jangan**
mengulang dari awal atau mengedit migration — catat nama berkas & pesannya.

Periksa hasil:

```bash
docker run --rm -e DB_URL postgres:17-alpine psql "$DB_URL" -c \
  "select (select count(*) from public.categories) as kategori,
          (select string_agg(id, ', ') from storage.buckets) as bucket,
          (select count(*) from cron.job) as job_terjadwal"
unset DB_URL
```

Harapan: kategori > 0, bucket `event-photos, payment-proofs`, job terjadwal **4**.

**Kalau `job_terjadwal` = 0**: migration pg_cron melewati penjadwalan tanpa galat
(hanya `NOTICE: pg_cron tidak tersedia`) bila ekstensinya tidak terbaca aktif.
Akibatnya kegiatan lewat tenggat tidak pernah ditutup dan pengingat H-3/H-1 tidak
terbit — diam-diam. Perbaiki: Database → **Extensions** → aktifkan `pg_cron`,
lalu di **SQL Editor**:

```sql
create extension if not exists pg_cron;
select cron.schedule('studentfo-expire-past-events', '5 17 * * *', 'SELECT public.expire_past_events()');
select cron.schedule('studentfo-deadline-notifications', '0 0 * * *', 'SELECT public.create_deadline_notifications()');
select cron.schedule('studentfo-purge-rate-limit-hits', '17 18 * * *', 'SELECT public.purge_rate_limit_hits()');
select cron.schedule('studentfo-purge-event-view-dedup', '23 18 * * *', 'SELECT public.purge_event_view_dedup()');
select jobname, schedule from cron.job;   -- harus 4 baris
```

Jadwal dalam UTC (17:05 UTC = 00:05 WIB). Aman diulang: nama yang sama menimpa
jadwal lama.

Lalu dashboard → **Advisors → Security Advisor** → jalankan. Tidak boleh ada
temuan level *ERROR* (mis. "RLS disabled"). Catat temuan *WARN*.

---

## 4. Supabase: autentikasi & email (±45 menit)

### 4.1 URL

Authentication → **URL Configuration**:
- *Site URL*: `https://domainmu` — **persis** sama dengan `NEXT_PUBLIC_SITE_URL`
  (tanpa garis miring akhir; pilih satu: dengan atau tanpa `www`).
- *Redirect URLs*: `https://domainmu/auth/callback**`

Jangan menambahkan `http://localhost…` ke project produksi.

### 4.2 Aturan akun

Authentication → **Providers → Email**: *Confirm email* ON, *Secure email
change* ON, *Minimum password length* **8**, *Password requirements* **Letters
and digits** (sama dengan validasi aplikasi di `src/lib/password-rules.ts`).

Authentication → **Attack Protection**: *CAPTCHA* **OFF** — aplikasi
memverifikasi Turnstile sendiri (ADR-056); menyalakan keduanya membuat setiap
pendaftaran gagal. *Leaked password protection*: nyalakan begitu tersedia di
paketmu.

### 4.3 Template email (penting!)

Authentication → **Emails → Templates**:

| Template | Subjek | Isi |
|---|---|---|
| Confirm signup | `Konfirmasi akun StudentFo` | salin seluruh `supabase/templates/konfirmasi-daftar.html` |
| Reset password | `Atur ulang kata sandi StudentFo` | salin seluruh `supabase/templates/reset-kata-sandi.html` |

Kenapa wajib diganti: tautan bawaan Supabase (PKCE) hanya berhasil di peramban
yang sama tempat mendaftar. Mahasiswa yang daftar di laptop lalu membuka email
di HP akan gagal konfirmasi. Template di repo memakai `token_hash`, yang
berhasil di perangkat mana pun dan sudah didukung `/auth/callback`.

### 4.4 SMTP sendiri

SMTP bawaan Supabase hanya untuk uji (beberapa email per jam) — pendaftaran
di hari peluncuran akan langsung tertahan.

1. Daftar di penyedia SMTP (Resend, Brevo, dst), tambahkan domainmu, salin
   rekaman DNS (SPF, DKIM, dan DMARC bila diminta) ke Cloudflare DNS (setelah
   fase 5.1), tunggu terverifikasi.
2. Authentication → **Emails → SMTP Settings**: isi host/port/user/sandi,
   pengirim `noreply@domainmu`, nama `StudentFo`.
3. Authentication → **Rate Limits**: naikkan batas email sesuai kuota penyedia.

### 4.5 Google (opsional)

Ikuti `README.md` § Autentikasi bagian Google. Bisa menyusul — tanpa ini, daftar
lewat email tetap berjalan.

---

## 5. Cloudflare (±45 menit + menunggu DNS)

### 5.1 Pindahkan DNS

Cloudflare → *Add a domain* → paket **Free** → ganti *nameserver* di
registrar ke dua nameserver Cloudflare → tunggu status **Active** (menit sampai
24 jam).

Lalu:
- SSL/TLS → *Edge Certificates*: **Always Use HTTPS** ON, **Minimum TLS** 1.2.
- DNS → *Settings*: **DNSSEC** ON (ikuti petunjuk ke registrar).
- **HSTS di Cloudflare biarkan OFF** — aplikasi sudah mengirim HSTS 2 tahun
  dengan `includeSubDomains; preload`. Konsekuensinya: setiap subdomain
  domainmu wajib HTTPS. Jangan mendaftarkan domain ke hstspreload.org sebelum
  yakin.

### 5.2 Tunnel

Zero Trust → **Networks → Tunnels → Create a tunnel** → *Cloudflared* → nama
`studentfo-vps` → lingkungan **Docker** → salin token (string panjang setelah
`--token`) → simpan di pengelola sandi. **Jangan** jalankan perintah docker
yang ditampilkan; Compose yang menjalankannya.

Tab **Public Hostname** (di dashboard versi baru bernama *Published application
routes*) → *Add*:
- Subdomain kosong, domain `domainmu`
- Service: **HTTP**, URL: **`app:3000`**

(`app` = nama layanan di `deploy/docker-compose.yml`; cloudflared menjangkaunya
lewat jaringan internal Docker.)

Opsional `www`: tambahkan hostname `www` dengan service yang sama, lalu Rules →
*Redirect Rules* → template "Redirect from WWW to root".

### 5.3 Turnstile

Cloudflare → **Turnstile → Add widget** → hostname `domainmu` → mode
*Managed* → salin **Site key** dan **Secret key**.

### 5.4 Keamanan tepi

- Security → WAF: aturan terkelola gratis aktif bawaan; biarkan.
- **Bot Fight Mode: biarkan OFF dulu** — ia bisa menantang monitor uptime dan
  bot pengingat yang memanggil `/api/*`. Aplikasi sudah punya pembatas laju
  sendiri + Turnstile.

---

## 6. Deploy (±20 menit, build ±5–10 menit)

```bash
cd ~/StudentFo
cp deploy/env.example deploy/.env && chmod 600 deploy/.env
nano deploy/.env
```

Isi sesuai komentar di berkasnya: `NEXT_PUBLIC_SITE_URL`, dua kunci publik
Supabase (§ 3.2), `SUPABASE_SERVICE_ROLE_KEY` (kunci secret), `RATE_LIMIT_SECRET`
(§ 1.3), dua kunci Turnstile (§ 5.3), `CLIENT_IP_HEADER=cf-connecting-ip` (sudah
terisi). **Biarkan kosong** semua `DEMO_*` dan `ALLOW_DEMO_IN_PRODUCTION`, juga
`PRIVACY_*` (§ 10).

```bash
cp deploy/tunnel.env.example deploy/tunnel.env && chmod 600 deploy/tunnel.env
nano deploy/tunnel.env        # TUNNEL_TOKEN=<token dari § 5.2>

docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml ps
```

Tunggu kolom STATUS `app` menjadi `(healthy)` (±30–60 detik setelah build).
Melihat log:

```bash
docker compose -f deploy/docker-compose.yml logs -f --tail=50 app
docker compose -f deploy/docker-compose.yml logs --tail=20 cloudflared   # cari "Registered tunnel connection"
```

Kenapa token tunnel di berkas terpisah: aplikasi yang suatu saat dibobol tidak
bisa membaca token itu dan membajak tunnel-mu.

---

## 7. Verifikasi (±30 menit)

Dari laptop:

```bash
curl -s https://domainmu/api/health                       # {"status":"ok","dataMode":"supabase"}
curl -sI https://domainmu/ | grep -iE "content-security-policy|strict-transport"
curl -s -o /dev/null -w '%{http_code}\n' https://domainmu/demo    # 404
curl -sI https://domainmu/favicon.ico | head -1           # 200
```

`dataMode` **harus** `supabase`. Kalau `seed`, ada `ALLOW_DEMO_IN_PRODUCTION`
yang terisi — situs menyajikan data fiktif. Matikan segera.

Uji manual, sebaiknya dari dua perangkat:
1. Daftar akun email di laptop → buka email konfirmasi **di HP** → harus
   mendarat di situs dalam keadaan masuk dengan sambutan "email terkonfirmasi".
2. Keluar → "Lupa kata sandi" → email → atur sandi baru → masuk.
3. Kirim satu kegiatan lewat `/submit` (Turnstile muncul).
4. Buka tautan situs dari Instagram/TikTok: muncul petunjuk "Buka di browser",
   form email tetap ada.
5. Scan <https://securityheaders.com> dan <https://www.ssllabs.com/ssltest/>.

---

## 8. Jadikan dirimu admin

Setelah akunmu terdaftar & terkonfirmasi, Supabase → **SQL Editor**:

```sql
UPDATE public.users SET role = 'ADMIN' WHERE email = 'emailmu@contoh.com';
```

Tidak ada jalur dari aplikasi untuk ini, dengan sengaja. Akun admin = kunci
moderasi seluruh katalog: sandi unik & panjang, dan email akun itu ber-2FA.
Setujui kiriman di `/admin` → kegiatan tayang di `/events`.

---

## 9. Monitor & backup

### 9.1 Monitor uptime

UptimeRobot atau Better Stack (gratis) → monitor tipe **keyword**:
- URL `https://domainmu/api/health`, interval 5 menit
- Kata kunci yang **harus ada**: `"dataMode":"supabase"`
- Notifikasi ke email/Telegram

Ini menangkap tiga kegagalan sekaligus: server mati, database tidak terjangkau
(503), dan situs yang diam-diam jatuh ke data contoh.

### 9.2 Backup

Supabase **Free tidak punya backup otomatis**. Sampai pindah ke Pro (backup
harian, simpan 7 hari), backup manual mingguan dari VPS:

```bash
cd ~ && mkdir -p backup
read -rsp "Connection string Session pooler: " DB_URL; echo; export DB_URL
docker run --rm -e DB_URL -v "$HOME/backup:/out" postgres:17-alpine \
  pg_dump "$DB_URL" -Fc -f "/out/studentfo-$(date +%F).dump"
unset DB_URL; ls -lh ~/backup
```

Unduh ke laptop (`scp deploy@IP_VPS:backup/*.dump .`), simpan terenkripsi, dan
hapus salinan lama di VPS. Isinya data pribadi (UU PDP): jangan diunggah ke
penyimpanan publik/drive bersama tanpa enkripsi.

Pindah ke **Supabase Pro** begitu ada pendaftar & bukti bayar sungguhan:
backup harian, tidak ada jeda karena tidak aktif, dan project Free yang dijeda
= situs mati.

---

## 10. Rutinitas update & sebelum dibuka ke publik

### 10.1 Update kode

```bash
cd ~/StudentFo
git pull
docker compose -f deploy/docker-compose.yml up -d --build
docker image prune -f
```

Situs tetap melayani selama build; container baru menggantikan yang lama di
akhir (jeda beberapa detik).

**Ada migration baru?** Terapkan dulu (§ 3.3, hanya berkas yang baru), baru
deploy kode — urutan rilis repo ini selalu *migration dulu, baru kode*.

**Rollback** kode: `git checkout <commit-sebelumnya>` lalu `up -d --build`.
Migration tidak di-rollback; perbaikannya selalu migration baru.

### 10.2 Sebelum mengumumkan situs

- [ ] 30–50 kegiatan awal sudah tayang (pipeline belum bisa diandalkan, § 11).
- [ ] Kebijakan privasi ditinjau → isi `PRIVACY_CONTACT_EMAIL` &
      `PRIVACY_POLICY_EFFECTIVE_DATE` di `deploy/.env` → `docker compose -f
      deploy/docker-compose.yml up -d --force-recreate app` (tanpa build: bukan
      kunci `NEXT_PUBLIC_*`).
- [ ] Syarat & Ketentuan (halaman belum ada).
- [ ] Semua butir § 12.

---

## 11. Pipeline scraper (boleh menyusul)

Tidak dibutuhkan untuk peluncuran — kegiatan bisa masuk lewat `/submit` +
`/admin`. Sebelum menyalakannya (`.github/workflows/scraper-cron.yml`):

- `GEMINI_MODEL` wajib diisi model yang masih hidup (bawaan
  `gemini-2.0-flash` sudah dimatikan Google 1 Juni 2026).
- `supabase==2.11.0` di `pipeline/requirements.txt` **menolak kunci
  `sb_secret_…`** (dicek dari kode sumbernya: regex wajib format JWT). Sampai
  pipeline di-upgrade, secret GitHub `SUPABASE_SERVICE_ROLE_KEY` untuk pipeline
  harus kunci **legacy `service_role`** — yang berhenti berfungsi akhir 2026.
  Upgrade `supabase` (terakhir 2.33.0) ikut menaikkan `pydantic` &
  `google-genai`; uji dengan kunci Gemini sungguhan.
- GitHub → Settings → Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GEMINI_API_KEY`, `GEMINI_MODEL`, `PIPELINE_SOURCES_YAML`, dan Telegram
  (opsional).

---

## 12. Daftar periksa keamanan

**Akun**
- [ ] 2FA (authenticator) di GitHub, Supabase, Cloudflare, penyedia VPS,
      registrar domain, penyedia SMTP, dan email induknya.
- [ ] Semua rahasia di pengelola kata sandi; tidak ada di chat/screenshot/repo.
- [ ] GitHub repo: *Branch protection* untuk `main` (wajib PR + CI hijau),
      *Dependabot alerts* & *Secret scanning* ON.

**Rahasia aplikasi**
- [ ] `deploy/.env` & `deploy/tunnel.env` `chmod 600`, tidak pernah di-commit
      (sudah di `.gitignore`; tidak ikut ke image lewat `.dockerignore`).
- [ ] Kunci secret Supabase hanya di `deploy/.env` (dan secret GitHub untuk
      pipeline). Bocor? Supabase → API Keys → buat kunci baru → ganti di
      `deploy/.env` → `up -d --force-recreate app` → hapus kunci lama.
- [ ] `ALLOW_DEMO_IN_PRODUCTION` & `DEMO_*` kosong; monitor menegaskan
      `dataMode: supabase`.

**Supabase**
- [ ] Security Advisor tanpa temuan ERROR (ulangi setiap ada migration baru).
- [ ] Database → Settings → **Enforce SSL** ON.
- [ ] Database → **Network Restrictions**: batasi koneksi Postgres langsung ke
      IP VPS & IP-mu saja. Aplikasi memakai API HTTPS, jadi tidak terpengaruh.
- [ ] Auth: konfirmasi email ON, sandi min. 8 huruf+angka, CAPTCHA Supabase
      OFF (Turnstile di aplikasi), Site URL & Redirect URL hanya domain produksi.
- [ ] Template email `token_hash` terpasang; SMTP sendiri dengan SPF/DKIM.
- [ ] Peran ADMIN hanya untuk akun yang perlu; tinjau berkala:
      `select email from public.users where role = 'ADMIN';`

**Server**
- [ ] Login hanya SSH key sebagai `deploy`; root & kata sandi ditolak.
- [ ] UFW: hanya OpenSSH masuk. `deploy/docker-compose.yml` tanpa `ports:`.
- [ ] fail2ban & unattended-upgrades aktif; reboot bila diminta
      (`/var/run/reboot-required`).
- [ ] Container berjalan non-root, filesystem read-only, `no-new-privileges`,
      tanpa capability (sudah di compose).

**Cloudflare**
- [ ] Always Use HTTPS, TLS ≥ 1.2, DNSSEC ON.
- [ ] Turnstile terpasang (muncul di `/submit`, daftar, lupa sandi).
- [ ] Setiap subdomain HTTPS (konsekuensi HSTS `includeSubDomains`).

**Pemantauan**
- [ ] Monitor keyword `/api/health` aktif dan notifikasinya sampai (uji dengan
      `docker compose ... stop app`, lalu `start`).
- [ ] Backup terakhir < 7 hari, dan pernah dicoba dipulihkan ke project uji.

---

## 13. Bila ada masalah

| Gejala | Penyebab paling mungkin | Tindakan |
|---|---|---|
| `app` terus restart, log "Kredensial Supabase kosong di produksi" | Kunci Supabase kosong/salah ketik di `deploy/.env` | Perbaiki, `up -d --build` (kunci publik dibekukan saat build) |
| Halaman Cloudflare "Error 1033" / 502 | cloudflared tidak tersambung | `logs cloudflared`; cek `TUNNEL_TOKEN`; Public Hostname harus `http://app:3000` |
| Build berhenti "Killed" / exit 137 | Kehabisan memori | Swap 4 GB (§ 2.6) |
| Build gagal di `next/font` | VPS tidak bisa menjangkau fonts.googleapis.com | Cek koneksi keluar VPS, ulangi build |
| Semua form ditolak setelah ganti domain | `NEXT_PUBLIC_SITE_URL` lama (dipakai pengaman CSRF Server Action, dibekukan saat build) | Perbaiki, `up -d --build` |
| Tautan email → "tautan tidak valid/kedaluwarsa" | Template bawaan masih dipakai, atau Site URL ≠ domain | § 4.1 & § 4.3 |
| Semua orang kena batas laju bersamaan | `CLIENT_IP_HEADER` kosong di belakang Cloudflare | Isi `cf-connecting-ip`, `up -d --force-recreate app` |
| `/api/health` 503 | Supabase dijeda (Free, 7 hari tanpa aktivitas) atau gangguan | Dashboard Supabase → *Restore*; pertimbangkan Pro |

Sumber harga & fakta platform (diambil Oktober 2026; verifikasi di halaman resmi):
[Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) ·
[Migrasi kunci API Supabase](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) ·
[Supabase pricing (UI Bakery)](https://uibakery.io/blog/supabase-pricing) ·
[Vercel Hobby non-komersial (costbench)](https://costbench.com/software/developer-tools/vercel/) ·
[Render pricing (srvrlss)](https://www.srvrlss.io/provider/render/) ·
[Fly.io pricing](https://fly.io/docs/about/pricing/) ·
[Railway pricing (costbench)](https://costbench.com/software/developer-tools/railway/) ·
[Hetzner price adjustment 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) ·
[DigitalOcean droplet pricing](https://docs.digitalocean.com/products/droplets/details/pricing/) ·
[IDCloudHost (whtop)](https://www.whtop.com/id/plans/idcloudhost.com/148734) ·
[Biznet Gio pricelist](https://biznetgio.com/pricelist)
