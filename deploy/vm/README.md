# Runbook VM produksi (ADR-105)

Ringkas untuk operasi harian. Penjelasan lengkap, biaya, dan checklist
cutover: [`docs/deploy-vm.md`](../../docs/deploy-vm.md).

## Isi folder

| Berkas | Di VM (`/opt/studentfo`) | Siapa yang menulis |
|---|---|---|
| `docker-compose.yml`, `Caddyfile`, `deploy.sh` | disalin setiap deploy | workflow `deploy-vm.yml` |
| `.env` | `IMAGE_TAG`, `SITE_HOST`, batas RAM (contoh: `.env.example`) | `deploy.sh` (kunci lain tidak disentuh) |
| `app.env` | rahasia aplikasi, `chmod 600` (contoh: `app.env.example`) | **pemilik**, tangan |
| `releases.log` | riwayat rilis yang lolos health check | `deploy.sh` |
| `bootstrap.sh` | dijalankan sekali (dan setiap VM dibuat ulang) | pemilik |

## Perintah

Semua dari `/opt/studentfo` sebagai user `deploy`.

```bash
./deploy.sh --status                  # tag aktif, 10 rilis terakhir, status container
docker compose logs -f --tail 100 app # log aplikasi (galat = baris JSON "event":"request_error")
docker compose logs --tail 100 caddy  # sertifikat / TLS / proxy
docker stats --no-stream              # CPU & RAM sekarang
docker compose exec app wget -qO- http://127.0.0.1:3000/api/health   # health tanpa lewat Caddy
```

## Deploy

Otomatis: setiap push ke `main` yang CI-nya hijau. Manual: GitHub → Actions →
**Deploy VM** → Run workflow (cabang `main`, `image_tag` kosong).

## Rollback

| Cara | Kapan |
|---|---|
| Otomatis | Rilis baru tidak `healthy` dalam 180 dtk → `deploy.sh` kembali ke rilis sehat terakhir, job merah |
| `./deploy.sh --rollback` | Rilis sehat tapi ada bug fungsional. Image 3 rilis terakhir masih di disk, tanpa pull |
| Actions → Deploy VM → `image_tag=<sha>` | Kembali ke SHA tertentu (harus masih ada di ghcr.io) |

Jangan `docker compose down -v`: `-v` menghapus volume sertifikat Caddy dan
memaksa permintaan ulang ke Let's Encrypt (ada batas laju per domain).

## Rotasi rahasia

1. Buat nilai baru (`openssl rand -hex 32`) atau ambil dari penyedia.
2. `nano app.env` → simpan. Pastikan `chmod 600 app.env`.
3. `docker compose up -d app` (membaca ulang `app.env`; `restart` TIDAK).
4. Khusus `CRON_SECRET`: perbarui juga secret GitHub `CRON_SECRET`.

Efek samping: `RATE_LIMIT_SECRET` baru = penghitung batas laju & hash
pengunjung harian mulai dari nol. `EMAIL_LINK_SECRET` baru = tautan
berhenti-langganan di email lama tidak berlaku.

## Debug cepat

| Gejala | Periksa |
|---|---|
| Job deploy merah "TIDAK sehat" | 40 baris log di job; biasanya `app.env` salah/kurang atau Supabase tak terjangkau |
| Health `dataMode` bukan `supabase` | Image dibangun tanpa variabel `NEXT_PUBLIC_SUPABASE_*` — cek repository variables, deploy ulang |
| Semua form gagal (403/origin) | `NEXT_PUBLIC_SITE_URL` ≠ host yang dibuka pengunjung → bangun ulang image untuk host itu |
| Sertifikat gagal | DNS belum menunjuk ke IP VM, atau port 80 tertutup di NSG Azure/ufw |
| CAPTCHA selalu gagal | Hostname baru belum ditambahkan di dasbor Turnstile |
| Log `IP klien tidak terbaca` | `CLIENT_IP_HEADER` terisi padahal tidak ada Cloudflare di depan → kosongkan |
| Disk penuh | `docker system df`; `docker image prune -a` (rilis aktif tetap aman) |
| Container mati setelah reboot | `systemctl status docker`; `docker compose up -d` |
