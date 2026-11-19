# Langkah konfigurasi untuk pemilik — versi pelan-pelan (19 Nov 2026)

Kerjakan **satu tahap sampai selesai dan terperiksa**, baru lanjut. Tiap tahap
berdiri sendiri — berhenti di tengah tidak merusak apa pun.

**Aturan emas:**

- Kunci/rahasia (API key, secret, URL webhook) **hanya ditempel di dasbor** (Vercel,
  GitHub, Supabase) — jangan pernah ditempel di chat, termasuk ke Claude.
- Env Vercel baru berlaku setelah **Redeploy**.
- Kalau situs rusak setelah redeploy: Vercel → project `studentfo` → **Deployments** →
  deployment sebelumnya yang *Ready* → **⋯ → Promote** (atau *Instant Rollback*).
  Situs kembali seperti semula dalam ±10 detik; perbaiki env-nya dengan tenang.

**Siapkan tiga tab:** GitHub (`github.com/Valvasas/StudentFo`), Vercel (project
`studentfo`), Supabase (project produksi `urmmihzjkkbxcwfzvuao`).

| Tahap | Isi | Waktu | Biaya |
|---|---|---|---|
| 1 | Tayangkan perbaikan (gabungkan cabang ke `main`) | 10–20 mnt | — |
| 2 | Notifikasi galat ke Discord | 10 mnt | gratis |
| 3 | CAPTCHA pendaftaran (Cloudflare Turnstile) | 15 mnt | gratis |
| 4 | Perbaiki "Masuk dengan Google" | 15–20 mnt | gratis |
| 5 | Katalog otomatis (scraper) | 30–60 mnt | gratis (kuota Gemini gratis) |
| — | Ditunda: domain, Vercel Pro, email pengingat, Supabase Pro, dokumen hukum | — | — |

---

## Tahap 1 — Tayangkan perbaikan (gabungkan cabang ke `main`)

Database produksi SUDAH diperbarui; yang belum tayang hanya kodenya (Buat acara
StudentFo, navigasi admin, perbaikan keamanan & tampilan). Vercel hanya
men-deploy cabang `main`.

1. Buka GitHub → repo **StudentFo** → tab **Pull requests**.
2. Klik **New pull request**.
3. Atur: **base:** `main` ← **compare:** `claude/practical-ritchie-emo0or`.
4. Klik **Create pull request** → judul bebas (mis. "Perbaikan pra-produksi 19 Nov") →
   **Create pull request** lagi.
5. Tunggu pemeriksaan **CI** di bawah PR berubah hijau ✅ (±15 menit). Kalau merah,
   jangan merge — kabari Claude dengan tautan PR-nya.
6. Klik **Merge pull request** → **Confirm merge**.
7. Buka Vercel → **Deployments**: muncul deployment baru dari `main` → tunggu *Ready*.

**Periksa:**

- `https://studentfo.vercel.app` terbuka normal.
- Masuk sebagai admin → beranda admin punya tombol **Buat acara StudentFo** dan panel
  **Cek pengiriman email** → tekan **Kirim email uji** → cek kotak masuk (dan Spam)
  emailmu dalam 1–2 menit. Kalau gagal, pesannya menunjuk pengaturan SMTP Supabase.

## Tahap 2 — Notifikasi galat ke Discord

Supaya kejadian seperti `/events` 18 Nov (11 pengunjung gagal, tidak ada yang tahu)
langsung sampai ke HP-mu.

1. Discord → ikon **+** di bilah kiri → **Create My Own** → **For me and my friends**
   → nama `StudentFo Ops` → **Create**.
2. Buat kanal teks `galat-studentfo` (klik **+** di samping *Text Channels*).
3. Arahkan ke kanal itu → ikon ⚙️ **Edit Channel** → **Integrations** → **Webhooks** →
   **New Webhook** → klik webhook yang muncul → **Copy Webhook URL**.
4. Vercel → **Settings → Environment Variables** → **Add**:
   - Key: `ERROR_ALERT_WEBHOOK_URL`
   - Value: tempel URL tadi
   - Environment: centang **Production** saja
   - Nyalakan **Sensitive** → **Save**
5. GitHub → **Settings → Secrets and variables → Actions** → **New repository secret**:
   nama `ERROR_ALERT_WEBHOOK_URL`, nilai URL yang sama → **Add secret**
   (dipakai *Ops watchdog* untuk melapor job harian yang mati).
6. Vercel → **Deployments** → deployment teratas → **⋯ → Redeploy**.

**Periksa (opsional, dari terminal):**

```bash
curl -H "Content-Type: application/json" -d '{"content":"Tes notifikasi StudentFo"}' "TEMPEL_URL_WEBHOOK_DI_SINI"
```

Pesan muncul di kanal = siap. Galat asli dibatasi maks. 10 pesan per 5 menit.

## Tahap 3 — CAPTCHA pendaftaran (Cloudflare Turnstile)

Sekarang akun palsu hanya dibatasi 5/jam per IP.

1. Daftar/masuk di `dash.cloudflare.com` (gratis, tidak perlu memindah domain).
2. Menu kiri **Turnstile** → **Add widget**:
   - Widget name: `StudentFo`
   - Hostname: `studentfo.vercel.app`
   - Widget mode: **Managed** → **Create**
3. Salin **Site Key** dan **Secret Key** (biarkan halaman ini terbuka).
4. Vercel → **Environment Variables** → tambahkan **DUA-DUANYA sebelum redeploy**
   (kalau hanya satu, aplikasi sengaja menolak start):
   - `TURNSTILE_SITE_KEY` = Site Key (Production)
   - `TURNSTILE_SECRET_KEY` = Secret Key (Production, **Sensitive**)
5. Supabase → **Authentication → Attack Protection** → pastikan **CAPTCHA protection
   MATI**. (StudentFo memverifikasi sendiri di server; kalau dua-duanya aktif, daftar gagal.)
6. Vercel → **Redeploy**.

**Periksa:** jendela samaran → `/register` → ada kotak verifikasi Cloudflare di atas tombol
Daftar → coba daftar dengan email cadangan → email konfirmasi datang.

## Tahap 4 — Perbaiki "Masuk dengan Google"

Log Auth: sejak 16 Nov ada 8 percobaan, semuanya berhenti di halaman galat Google.
Penyebab paling umum: aplikasi masih mode *Testing* atau alamat callback tidak sama persis.

1. `console.cloud.google.com` → pilih project yang dipakai untuk login StudentFo
   (pemilih project di bilah atas).
2. Menu **Google Auth Platform** (dulu: *APIs & Services → OAuth consent screen*) →
   **Audience** → *Publishing status*: kalau **Testing**, klik **Publish app** →
   **Confirm**. Harus menjadi **In production**.
   (Scope email/profil tidak butuh verifikasi Google.)
3. Masih di sana → **Clients** (dulu *Credentials*) → klik klien jenis *Web application*:
   - **Authorized redirect URIs** memuat PERSIS
     `https://urmmihzjkkbxcwfzvuao.supabase.co/auth/v1/callback`
     (tanpa garis miring di akhir, tanpa spasi).
   - **Authorized JavaScript origins**: `https://studentfo.vercel.app`
   - **Save**. Catat *Client ID*. Kalau *Client secret* tidak kamu simpan, buat baru di
     halaman yang sama (**Add secret**) dan salin.
4. Supabase → **Authentication → Sign In / Providers → Google** → **Enable** → tempel
   *Client ID* dan *Client Secret* → **Save**.
5. Supabase → **Authentication → URL Configuration**:
   - *Site URL*: `https://studentfo.vercel.app`
   - *Redirect URLs*: pastikan ada `https://studentfo.vercel.app/auth/callback`

**Periksa:** jendela samaran → `/login` → **Masuk dengan Google** → pilih akun → kembali ke
StudentFo dalam keadaan masuk.

| Pesan yang muncul | Artinya |
|---|---|
| `redirect_uri_mismatch` | Alamat di langkah 3 belum sama persis |
| "Akses diblokir" / "app is in testing" | Langkah 2 belum *In production* |
| Kembali ke `/login` dengan pesan galat | Client ID/Secret di langkah 4 tidak cocok |

## Tahap 5 — Katalog otomatis (scraper)

Scraper gagal tiap hari karena daftar sumbernya kosong. Hasilnya **tidak pernah tayang
sendiri** — semua masuk antrean `/admin` sebagai PENDING untuk kamu setujui.

**5a. Kunci Gemini (gratis)**

1. `aistudio.google.com` → **Get API key** → **Create API key** → salin.
2. GitHub → **Settings → Secrets and variables → Actions** → **New repository secret**:
   - `GEMINI_API_KEY` = kunci tadi
   - `GEMINI_MODEL` = `gemini-3.5-flash-lite` (cocokkan dengan daftar model di AI Studio;
     model seri 2.0 sudah dimatikan Google)

**5b. Daftar sumber** — bagian yang butuh keputusanmu.

1. Pilih 5–10 situs resmi yang rutin mengumumkan lomba/beasiswa (kampus, kementerian,
   lembaga). Kandidat ada di `docs/progres-sekarang.md` bagian E.
2. Salin isi `pipeline/config/sources.example.yaml`, satu blok `- id:` per situs, isi
   `start_url`, ubah `enabled: true`.
   Lebih mudah: kirim daftar alamat situsnya ke Claude — Claude memeriksa robots.txt &
   tata letaknya lalu menyusun YAML-nya. Kamu tinggal menempel.
3. GitHub → **New repository secret** → `PIPELINE_SOURCES_YAML` = seluruh isi YAML itu.
4. Pastikan secret `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` sudah ada di daftar yang
   sama (job lain sudah memakainya; kalau tidak ada, tambahkan).

**Periksa:** GitHub → **Actions** → **Scraper** → **Run workflow** → tunggu hijau ✅ →
buka `/admin`: hasil baru ada di "Kegiatan dari sumber otomatis".

---

## Ditunda (sengaja — StudentFo belum dikomersialkan)

| Apa | Kenapa ditunda | Akibatnya sekarang |
|---|---|---|
| Domain sendiri | Belum perlu | Tetap `studentfo.vercel.app` |
| Vercel Pro | Paket Hobby boleh untuk proyek non-komersial | Log hanya 1 jam → tutup dengan Tahap 2 (notifikasi Discord) |
| Email pengingat tenggat (Resend + `CRON_SECRET`) | Resend butuh domain terverifikasi | Opsi email di Pengaturan → Notifikasi otomatis disembunyikan; pengingat di lonceng tetap jalan |
| Supabase Pro (*Leaked password protection*) | Berbayar | Sandi minimal tetap divalidasi aplikasi |
| Dokumen hukum (`LEGAL_*`) | Butuh tinjauan penasihat hukum | Kebijakan privasi & S&K tetap berlabel DRAF |

> Catatan jujur soal hukum: UU PDP berlaku untuk data pribadi pelajar walau situsnya
> tidak komersial. Sebelum mengundang banyak pengguna umum (bukan teman/penguji),
> tuntaskan dulu dokumen hukum & pendaftaran PSE.

## Sudah dikerjakan dari sesi Claude (tidak perlu diulang)

| Apa | Status |
|---|---|
| Migration `20261116100001`, `20261119100001`, `20261119100002` | ✅ staging → produksi (SHA-256 dicocokkan dengan commit `e6bcabf`), 54 migration |
| `RATE_LIMIT_SECRET` di Vercel Production | ✅ diisi (dibuat acak di sesi Claude; boleh diganti nilai baru kapan saja — efeknya hanya mereset hitungan batas laju) |
| Security Advisor produksi | ✅ tanpa temuan baru di luar pola yang disengaja |
| Kode (cabang `claude/practical-ritchie-emo0or`) | ✅ `npm run verify` 1.151 tes, e2e 1.106 lulus — menunggu Tahap 1 |
