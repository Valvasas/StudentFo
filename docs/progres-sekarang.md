# Progres StudentFo — serah-terima sesi (10 Nov 2026)

> **Mulai sesi baru dengan pesan ini:**
> "Baca `docs/progres-sekarang.md`, lalu lanjutkan dari bagian *Sedang dikerjakan*."
>
> Berkas ini ringkasan keadaan saat itu. Kebenaran tetap di `CHANGELOG.md`,
> `TASKS.md`, dan `DECISION.md` — perbarui berkas ini (atau hapus) bila sudah basi.

---

## 1. Keadaan kode

| Hal | Keadaan |
|---|---|
| Cabang kerja | `claude/registration-form-competition-features-sptvfz` @ `9c6e410` (+ commit berkas ini) |
| `main` | `8f42cd1` (PR #27). **Cabang kerja BELUM digabung ke `main`** |
| Isi cabang yang belum di `main` | Poster, slide & video kegiatan (ADR-079): poster = foto galeri bertanda, slide di tab Ringkasan, video YouTube/Vimeo (pemutar baru dimuat setelah Putar), thumbnail poster di kartu & papan, og:image, kelola di studio + `/admin/media/[slug]`, isian video di `/submit` |
| Tes terakhir (semua hijau) | `verify` 996 · `db:test` · integrasi PostgREST 113 · Playwright seed 954 (+470 ulang) · e2e Supabase 13 |

## 2. Keadaan database & hosting (dicek langsung 10 Nov)

| Hal | Keadaan |
|---|---|
| Migration `20261109100002_event_media` | **Belum diterapkan** di staging maupun produksi (menunggu persetujuan pemilik). Tanpa ini poster & video tidak tampil, situs tetap jalan |
| Supabase produksi `urmmihzjkkbxcwfzvuao` ("StudentFo") | 47 migration, **0 akun, 0 acara**, ekstensi `http` masih ada |
| Supabase staging `iwttgkzxudhjatbvywke` | 4 akun, 0 acara, skema `studentfo_migration_runner` + ekstensi `http` masih ada |
| Vercel `studentfo` | Hanya 4 env: `NEXT_PUBLIC_SUPABASE_URL` & `_ANON_KEY` (**masih staging**), `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL=https://studentfo.vercel.app` |
| Turnstile (anti-bot) | Belum diisi |
| Secret GitHub Actions | Belum dicek; anggap belum ada |
| Katalog | **0 acara tayang** — masalah produk nomor satu |

## 3. Sedang dikerjakan — Tahap A: pindah situs ke Supabase produksi

Dikerjakan **pemilik** di dasbor; Claude menunggu kabar. Centang yang sudah:

### A1. Kunci project produksi
Supabase → project **StudentFo** → **Project Settings → API Keys**
- [ ] Salin **Publishable key** (`sb_publishable_…`)
- [ ] Buat secret key `vercel-produksi`
- [ ] Buat secret key `github-actions` (untuk Tahap C)

### A2. Env Vercel (Settings → Environment Variables)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` lama: Edit → hilangkan centang **Production**
- [ ] Add New `NEXT_PUBLIC_SUPABASE_URL` = `https://urmmihzjkkbxcwfzvuao.supabase.co`, **Production saja**
- [ ] Sama untuk `NEXT_PUBLIC_SUPABASE_ANON_KEY` = publishable key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` → Edit → secret key `vercel-produksi`
- [ ] **Jangan redeploy dulu** — Claude menerapkan migration ke produksi, lalu redeploy

### A3a. SMTP — POSISI SEKARANG
Supabase tidak mengizinkan edit template tanpa SMTP sendiri, dan pengirim
bawaannya hanya mengirim ke anggota tim project (pendaftar lain tidak
menerima email konfirmasi). Pilihan sementara: Gmail khusus StudentFo.
- [ ] Buat akun Gmail baru khusus StudentFo (bukan Gmail pribadi)
- [ ] myaccount.google.com → Keamanan → nyalakan **Verifikasi 2 Langkah**
- [ ] myaccount.google.com/apppasswords → nama "Supabase" → salin kode 16 huruf (**jangan kirim ke chat**)
- [ ] Supabase produksi → **Authentication → Emails → SMTP Settings** → Enable custom SMTP:
      Sender email = Gmail baru · Sender name = `StudentFo` · Host `smtp.gmail.com` · Port `465` ·
      Username = Gmail baru · Password = kode 16 huruf → **Save**

Nanti (sebelum promosi) ganti ke Resend + domain `studentfo.com`:
Host `smtp.resend.com`, Port `465`, Username `resend`, Password = API key Resend.

### A3b. Alamat situs
**Authentication → URL Configuration**
- [ ] Site URL = `https://studentfo.vercel.app`
- [ ] Redirect URLs → Add URL → `https://studentfo.vercel.app/**`

### A3c. Template email (setelah SMTP aktif)
**Authentication → Emails → Templates** → klik template → isi Subject → buka berkasnya
di GitHub → ikon **Copy raw file** → di Supabase *Message body*: Ctrl+A, Delete, Ctrl+V → **Save**.

| Template | Subject | Berkas |
|---|---|---|
| Confirm sign up | `Satu langkah lagi: konfirmasi email StudentFo-mu` | [confirmation.html](https://github.com/Valvasas/StudentFo/blob/main/supabase/templates/confirmation.html) |
| Invite user | `Kamu diundang bergabung ke StudentFo` | [invite.html](https://github.com/Valvasas/StudentFo/blob/main/supabase/templates/invite.html) |
| Magic link | `Tautan masuk ke StudentFo` | [magic_link.html](https://github.com/Valvasas/StudentFo/blob/main/supabase/templates/magic_link.html) |
| Change email address | `Konfirmasi alamat email baru StudentFo-mu` | [email_change.html](https://github.com/Valvasas/StudentFo/blob/main/supabase/templates/email_change.html) |
| Reset password | `Setel ulang kata sandi StudentFo` | [recovery.html](https://github.com/Valvasas/StudentFo/blob/main/supabase/templates/recovery.html) |
| Reauthentication | `Kode verifikasi StudentFo` | [reauthentication.html](https://github.com/Valvasas/StudentFo/blob/main/supabase/templates/reauthentication.html) |
| Password changed (Security notifications — nyalakan sakelarnya dulu) | `Kata sandi StudentFo-mu baru saja diganti` | [password_changed_notification.html](https://github.com/Valvasas/StudentFo/blob/main/supabase/templates/password_changed_notification.html) |
| Email address changed (Security notifications) | `Email akun StudentFo-mu sudah diganti` | [email_changed_notification.html](https://github.com/Valvasas/StudentFo/blob/main/supabase/templates/email_changed_notification.html) |

- [ ] 8 template terpasang

### A3d. MFA
- [ ] **Authentication → Multi-Factor**: TOTP **Enabled** (biasanya sudah)

### A4. Akun admin di produksi (setelah Claude redeploy)
- [ ] Daftar di `https://studentfo.vercel.app/register`, konfirmasi email
- [ ] SQL Editor produksi: `UPDATE public.users SET role = 'ADMIN' WHERE email = '<email-kamu>';`
- [ ] Buka `/admin` → pindai QR MFA dengan aplikasi autentikator

## 4. Menunggu jawaban pemilik (Claude yang mengerjakan)

1. **"Ya, terapkan migration"** → `20261109100002_event_media` ke staging lalu produksi (hanya ADD / CREATE OR REPLACE), catat di `supabase/APPLIED_MIGRATIONS.txt`.
2. **"Ya, PR & merge"** → buka PR cabang kerja → `main`, merge bila CI hijau.
3. **"Tahap A selesai"** → redeploy produksi, cek login/daftar/email konfirmasi/`/admin`/poster di situs langsung.

## 5. Tahap berikutnya (setelah A)

- **B. Turnstile:** Cloudflare → Turnstile → Add widget (hostname `studentfo.vercel.app`, Managed) → Vercel env `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (Sensitive). CAPTCHA bawaan Supabase Auth tetap MATI.
- **C. Secret GitHub** (Settings → Secrets and variables → Actions): `SUPABASE_URL` = URL produksi, `SUPABASE_SERVICE_ROLE_KEY` = secret key `github-actions`, `ERROR_ALERT_WEBHOOK_URL` (opsional). Tanpa ini job harian (kedaluwarsa acara, notifikasi tenggat, watchdog) gagal.
- **D. Bersih-bersih (hanya pemilik, SQL Editor):** staging `DROP SCHEMA studentfo_migration_runner CASCADE; DROP EXTENSION http;` · produksi `DROP EXTENSION http;`
- **E. Isi katalog:** 10–20 lomba nyata lewat `/submit` → setujui di `/admin` → pasang poster dari Lencana & promosi. Atau pipeline: secret `GEMINI_API_KEY`, `GEMINI_MODEL` (model hidup; `gemini-2.0-flash` sudah mati), `PIPELINE_SOURCES_YAML`.
- **Sebelum publik:** domain `studentfo.com` → Resend + DNS (SPF/DKIM/DMARC) → `CRON_SECRET`, `EMAIL_LINK_SECRET` (`openssl rand -hex 32`); env hukum hanya setelah tinjauan penasihat hukum; PSE, DPIA; Supabase **Pro** (Free dijeda bila sepi seminggu).

## 6. Catatan untuk Claude di sesi baru

- Langkah 0 tetap berlaku: `git fetch origin && npm run check:sync -- --fetch`, baca `CHANGELOG.md`.
- **Jangan** menerapkan migration ke staging/produksi atau merge tanpa persetujuan eksplisit di chat.
- Push hanya ke cabang kerja di atas; tanpa force push; PR hanya bila diminta.
- Jangan pernah menulis/mencetak rahasia; kredensial lewat `request_credential`, bukan chat.
- ID yang dipakai: Vercel project `prj_QyApCj5dlEIFlWAhDdjXsvISmJ9Q`, team `team_9idfLfrFbcUzRDswt4KjcAB6`; Supabase produksi `urmmihzjkkbxcwfzvuao`, staging `iwttgkzxudhjatbvywke`.
- Log runtime Vercel (paket Hobby) hanya tersimpan 1 jam — cek kecocokan kunci lewat uji langsung, bukan log lama.
- Tes lokal: `npm run verify` · `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run db:test` (juga `test:integration`, `test:e2e:supabase`) · `npx playwright test --trace off`. Postgres lokal: `service postgresql start`.
- Usulan lanjutan di `TASKS.md` § ADR-079: pemotong poster 4:5, urutkan ulang foto galeri.
