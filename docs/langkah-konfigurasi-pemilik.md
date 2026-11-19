# Langkah konfigurasi untuk pemilik — 19 Nov 2026

Daftar ini HANYA berisi hal yang butuh akun, uang, atau keputusan pemilik —
yang bisa dikerjakan dari sesi Claude sudah dikerjakan (lihat bagian
"Sudah dikerjakan" di bawah). Urutan = prioritas. Setiap langkah ditutup
dengan cara memeriksa bahwa ia berhasil.

> Nama variabel di bawah dibaca `src/lib/env.ts`. Env Vercel baru berlaku
> setelah **Redeploy** (Vercel → Deployments → ⋯ → Redeploy).

---

## 0. Gabungkan cabang ke `main` (wajib, 5 menit)

Perbaikan sesi ini ada di cabang `claude/practical-ritchie-emo0or`. Produksi
(Vercel) hanya men-deploy `main`.

1. GitHub → repo `Valvasas/StudentFo` → **Pull requests** → **New pull request**.
2. base: `main`, compare: `claude/practical-ritchie-emo0or` → **Create pull request**.
3. Tunggu CI hijau → **Merge**.
4. **Periksa:** Vercel → Deployments: deployment baru `main` berstatus *Ready*.

Urutan aman: migration (bagian "Sudah dikerjakan") sudah terpasang di
database, jadi kode boleh menyusul kapan saja.

## 1. Notifikasi galat ke HP (10 menit) — `ERROR_ALERT_WEBHOOK_URL`

Insiden `/events` 18 Nov (11 pengunjung gagal) tidak diketahui siapa pun.

1. Discord: buat server pribadi → kanal `#galat-studentfo` → ⚙️ **Edit Channel**
   → **Integrations** → **Webhooks** → **New Webhook** → **Copy Webhook URL**.
   (Slack juga bisa: *Incoming Webhooks*.)
2. Vercel → project `studentfo` → **Settings → Environment Variables** →
   `ERROR_ALERT_WEBHOOK_URL` = URL tadi, Environment **Production**, tipe *Sensitive*.
3. Redeploy.
4. **Periksa:** buka `https://studentfo.vercel.app/events?page=abc` — tidak boleh
   galat (sudah diperbaiki); galat sungguhan berikutnya muncul di kanal itu,
   maksimal 10 pesan per 5 menit.

## 2. CAPTCHA pendaftaran (15 menit) — `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`

Tanpa ini akun palsu hanya dibatasi 5/jam per IP.

1. dash.cloudflare.com (akun gratis) → **Turnstile** → **Add widget**.
   Hostname: `studentfo.vercel.app` (+ domain sendiri bila ada). Mode: *Managed*.
2. Salin **Site Key** dan **Secret Key** → Vercel env (Production):
   `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (keduanya WAJIB diisi berpasangan,
   kalau hanya satu aplikasi menolak start).
3. Supabase → Authentication → **Attack Protection** → pastikan *CAPTCHA* **mati**
   (kita memverifikasi sendiri di server; dua-duanya aktif = daftar gagal).
4. Redeploy. **Periksa:** `/register` menampilkan kotak verifikasi Cloudflare.

## 3. Masuk dengan Google (15 menit)

Log Auth: 8 percobaan sejak 16 Nov, 0 kembali — Google berhenti di halaman galatnya.

1. console.cloud.google.com → **APIs & Services → OAuth consent screen**:
   *Publishing status* harus **In production** (bukan *Testing* — mode itu hanya
   untuk alamat penguji yang didaftarkan).
2. **Credentials → OAuth 2.0 Client IDs** → klien web StudentFo:
   *Authorized redirect URIs* = `https://urmmihzjkkbxcwfzvuao.supabase.co/auth/v1/callback`
   (persis, tanpa garis miring di akhir).
3. Supabase → Authentication → **Providers → Google**: Client ID & Secret sama
   dengan langkah 2, **Enabled**.
4. Supabase → Authentication → **URL Configuration**: *Site URL*
   `https://studentfo.vercel.app`; *Redirect URLs* memuat
   `https://studentfo.vercel.app/auth/callback`.
5. **Periksa:** jendela samaran → `/login` → *Masuk dengan Google* → kembali ke
   StudentFo dalam keadaan masuk.

## 4. Pengingat email tenggat (30 menit + domain)

Halaman `/profile/settings/notifikasi` menawarkan pengingat email, tetapi
produksi belum punya pengirim: workflow "Send deadline emails" hijau palsu
(dilewati). Butuh **domain sendiri** — Resend tidak bisa memverifikasi `vercel.app`.

1. resend.com → **Domains → Add domain** (mis. `studentfo.id`) → pasang 3 DNS
   record yang diminta → tunggu *Verified*.
2. **API Keys → Create** (izin *Sending access*).
3. Vercel env (Production): `RESEND_API_KEY`, `EMAIL_FROM` =
   `StudentFo <pengingat@studentfo.id>`.
4. Buat satu rahasia acak ≥ 32 karakter (`openssl rand -hex 32`) untuk `CRON_SECRET`.
   Isi **nilai yang sama** di dua tempat: Vercel env `CRON_SECRET` dan GitHub →
   repo → **Settings → Secrets and variables → Actions** → `CRON_SECRET`. Tambahkan
   juga secret GitHub `SITE_URL` = `https://studentfo.vercel.app`.
5. Redeploy. **Periksa:** GitHub → Actions → *Send deadline emails* → **Run workflow**
   → log menulis `sent`/`skipped`, bukan "dilewati".

## 5. Katalog otomatis (keputusan sumber) — scraper gagal setiap hari

1. Pilih 10+ sumber resmi (kandidat: `docs/progres-sekarang.md` §5 E).
2. GitHub secret `PIPELINE_SOURCES_YAML` = isi `pipeline/config/sources.yaml` versi
   produksi; `GEMINI_API_KEY`; variabel `GEMINI_MODEL` = `gemini-3.5-flash-lite`
   (model 2.0 sudah dimatikan Google).
3. **Periksa:** Actions → *Scraper* → Run → hasil masuk `/admin` sebagai PENDING.
   (Scraper TIDAK PERNAH menayangkan sendiri — semua tetap lewat persetujuanmu.)

## 6. Hosting untuk rilis publik

- **Vercel Pro** ($20/bulan): ketentuan paket Hobby melarang penggunaan
  komersial (StudentFo punya acara berbayar & promosi), dan log runtime Hobby
  hanya disimpan 1 jam — insiden 18 Nov sudah tak terbaca 6 jam kemudian.
  Alternatif log saja: *Log Drains* ke layanan gratis (Better Stack, Axiom).
- **Supabase Pro** ($25/bulan): baru bisa menyalakan *Leaked password protection*
  (Authentication → Attack Protection) dan backup harian 7 hari.
- **Domain sendiri** (`studentfo.id` / `.com`): urutan aman di
  `docs/kesiapan-hosting.md` (URL Supabase Auth dulu, baru `NEXT_PUBLIC_SITE_URL`).

## 7. Hukum (sebelum promosi publik)

Isi HANYA setelah ditinjau penasihat hukum (ADR-057/060), lalu Redeploy:
`LEGAL_OPERATOR_NAME`, `PRIVACY_CONTACT_EMAIL`, `PRIVACY_POLICY_EFFECTIVE_DATE`,
`TERMS_EFFECTIVE_DATE`. Sampai itu Kebijakan privasi & S&K tayang berlabel DRAF
(disengaja). Juga: pendaftaran PSE Lingkup Privat, DPIA (`docs/dpia-draf.md`),
DPA dengan Supabase/Vercel/Resend.

---

## Sudah dikerjakan dari sesi Claude (tidak perlu diulang)

Rincian & bukti: `CHANGELOG.md` entri 19 Nov dan `DECISION.md` ADR-093.

| Apa | Status | Bukti |
|---|---|---|
| Migration `20261116100001_event_engagement` (suka, komentar, "Lagi ramai", lomba mandiri) | ✅ staging → produksi | SHA-256 dicocokkan dengan commit `e6bcabf`; `APPLIED_MIGRATIONS.txt` = 54 |
| Migration `20261119100001` (tren tahan bot, koneksi bersama hormati blokir) | ✅ staging → produksi | uji SQL `120_trend_hardening` |
| Migration `20261119100002` (Buat acara StudentFo) | ✅ staging → produksi | uji asap di staging (di-rollback) + `121_admin_create_event` |
| `RATE_LIMIT_SECRET` (Vercel Production, *sensitive*) | ✅ diisi, berlaku di deploy berikutnya | — |
| Security Advisor produksi setelah migration | ✅ tanpa temuan baru di luar pola yang disengaja | ADR-093 |
| Kode: perbaikan, fitur admin, UI responsif | ✅ di cabang, **menunggu langkah 0 (merge)** | `npm run verify` 1.151 tes, e2e 1.106 lulus, sapuan 70 rute × 5 lebar |

Yang SENGAJA tidak disentuh: 7 acara PENDING di antrean (keputusanmu), dokumen hukum,
dan semua yang butuh akun pihak ketiga di atas.
