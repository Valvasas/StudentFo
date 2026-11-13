# Progres StudentFo — serah-terima sesi (13 Nov 2026)

> **Mulai sesi baru dengan pesan ini:**
> "Baca `docs/progres-sekarang.md`, lalu lanjutkan dari bagian *Menunggu jawaban pemilik*."
>
> Berkas ini ringkasan keadaan saat itu. Kebenaran tetap di `CHANGELOG.md`,
> `TASKS.md`, dan `DECISION.md` — perbarui berkas ini (atau hapus) bila sudah basi.

---

## 1. Keadaan kode

| Hal | Keadaan |
|---|---|
| Cabang kerja | `claude/brave-cray-xsqigf` — sudah memuat `main` (merge tanpa perubahan isi, tanpa force push) |
| `main` | `9935081` (PR #28: poster/slide/video ADR-079, logo ADR-080, cuplikan beranda ADR-081). **Tayang di produksi sejak 11 Nov 17:24 WIB** |
| Isi cabang yang BELUM di `main` | Lencana baru + animasi (ADR-082), foto profil & banner (ADR-083), poster saat kirim kegiatan (ADR-084), gerbang anggota (ADR-085), "Langkah awalmu" (ADR-086), **Komunitas** (ADR-087), audit skalabilitas & konten 255 karakter (ADR-088) |
| Tes terakhir (13 Nov, semua hijau) | `verify` 1.085 · `db:test` semua · integrasi PostgREST 113 (+5 butuh GoTrue/Storage sungguhan) · Playwright seed: lihat §6 |

## 2. Keadaan database & hosting (dicek langsung 13 Nov)

| Hal | Keadaan |
|---|---|
| Migration produksi & staging | Sama-sama **47** (`…20261109100001`), cocok dengan `supabase/APPLIED_MIGRATIONS.txt` |
| Migration menunggu persetujuan | `20261109100002_event_media`, `20261110100001_profile_media`, `20261112100001_submission_poster`, `20261112100002_community` — semuanya hanya ADD/CREATE OR REPLACE. Tanpa ini: poster/video tidak tampil (sudah tayang di `main`), dan setelah merge berikutnya foto profil, poster kiriman, & Komunitas menampilkan keadaan "belum aktif" — situs tetap jalan |
| Supabase produksi `urmmihzjkkbxcwfzvuao` | **0 akun, 0 admin, 0 acara, 0 kiriman**; ekstensi `http` masih ada |
| Vercel `studentfo` — Production | `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY` khusus Production (dibuat pemilik 10 Nov; isinya terenkripsi, tidak dibuka), `SUPABASE_SERVICE_ROLE_KEY` (Sensitive, diperbarui 10 Nov), `NEXT_PUBLIC_SITE_URL=https://studentfo.vercel.app` |
| Vercel — Preview & Development | URL & anon key **staging** (`iwttgkzxudhjatbvywke`) |
| Turnstile, secret GitHub Actions | Belum diisi (lihat §5) |
| Katalog | **0 acara tayang** — masih masalah produk nomor satu |

## 3. Tahap A: pindah situs ke Supabase produksi (dikerjakan pemilik)

### A1–A2. Kunci & env Vercel — ✅ selesai (10 Nov)
Env Production terpisah dari staging sudah ada. Bila ragu kuncinya cocok:
uji langsung (daftar akun di situs), bukan dari log — log Vercel Hobby hanya 1 jam.

> A3–A4 di bawah **tidak bisa dicek dari sesi Claude** (pengaturan Auth tidak
> terbaca lewat alat yang ada). Centang sendiri yang sudah.

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

### A4. Akun admin di produksi (bisa sekarang — produksi sudah tayang dengan env produksi)
Per 13 Nov produksi masih **0 akun**: belum ada yang berhasil mendaftar. Bila email konfirmasi tidak
sampai, hampir pasti A3a (SMTP) belum aktif — pengirim bawaan Supabase hanya mengirim ke anggota tim project.
- [ ] Daftar di `https://studentfo.vercel.app/register`, konfirmasi email
- [ ] SQL Editor produksi: `UPDATE public.users SET role = 'ADMIN' WHERE email = '<email-kamu>';`
- [ ] Buka `/admin` → pindai QR MFA dengan aplikasi autentikator

## 4. Menunggu jawaban pemilik (Claude yang mengerjakan)

1. **"Ya, terapkan migration"** → empat migration di §2 ke **staging** dulu (uji: unggah foto profil, kirim kegiatan berposter, tulis & balas di Komunitas, lapor 3×), lalu **produksi**; catat di `supabase/APPLIED_MIGRATIONS.txt` di commit yang sama.
2. **"Ya, PR & merge"** → PR `claude/brave-cray-xsqigf` → `main` (ADR-082–088), merge bila CI hijau; Vercel men-deploy `main` otomatis. Urutan 1 ↔ 2 aman dua-duanya (kode aman urutan deploy), tapi migration dulu = fitur langsung aktif saat tayang.
3. **"Tahap A selesai"** → cek situs langsung: daftar/konfirmasi email/masuk, `/admin` + MFA, kirim & setujui satu kegiatan, poster tampil.

## 5. Tahap berikutnya (setelah A)

- **B. Turnstile:** Cloudflare → Turnstile → Add widget (hostname `studentfo.vercel.app`, Managed) → Vercel env `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (Sensitive). CAPTCHA bawaan Supabase Auth tetap MATI.
- **C. Secret GitHub** (Settings → Secrets and variables → Actions): `SUPABASE_URL` = URL produksi, `SUPABASE_SERVICE_ROLE_KEY` = secret key `github-actions`, `ERROR_ALERT_WEBHOOK_URL` (opsional). Tanpa ini job harian (kedaluwarsa acara, notifikasi tenggat, watchdog) gagal.
- **D. Bersih-bersih (hanya pemilik, SQL Editor):** staging `DROP SCHEMA studentfo_migration_runner CASCADE; DROP EXTENSION http;` · produksi `DROP EXTENSION http;`
- **E. Isi katalog:** 10–20 lomba nyata lewat `/submit` → setujui di `/admin` → pasang poster dari Lencana & promosi. Atau pipeline: secret `GEMINI_API_KEY`, `GEMINI_MODEL` (model hidup; `gemini-2.0-flash` sudah mati), `PIPELINE_SOURCES_YAML`.
- **Sebelum publik:** domain `studentfo.com` → Resend + DNS (SPF/DKIM/DMARC) → `CRON_SECRET`, `EMAIL_LINK_SECRET` (`openssl rand -hex 32`); env hukum hanya setelah tinjauan penasihat hukum; PSE, DPIA; Supabase **Pro** (Free dijeda bila sepi seminggu).

## 6. Catatan untuk Claude di sesi baru

- Langkah 0 tetap berlaku: `git fetch origin && npm run check:sync -- --fetch`, baca `CHANGELOG.md`.
- **Jangan** menerapkan migration ke staging/produksi atau merge tanpa persetujuan eksplisit di chat.
- Push hanya ke cabang kerja di atas; **tanpa force push**; PR hanya bila diminta. Bila PR cabang ini sudah di-merge, `git merge origin/main` (bukan rebase + force push).
- Jangan pernah menulis/mencetak rahasia; kredensial lewat `request_credential`, bukan chat. Jangan membuka (decrypt) env Vercel.
- ID yang dipakai: Vercel project `prj_QyApCj5dlEIFlWAhDdjXsvISmJ9Q`, team `team_9idfLfrFbcUzRDswt4KjcAB6`; Supabase produksi `urmmihzjkkbxcwfzvuao`, staging `iwttgkzxudhjatbvywke`.
- Tes lokal: `npm run verify` · Postgres `service postgresql start` lalu `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run db:test` (juga `test:integration`) · `npx playwright test --trace off` (build produksi mode seed di port 3100).
- Aturan baru ADR-088: batas jendela daftar = konstanta bersama di `repository.ts`; "milik saya?" = lookup satu baris; teks pengguna di item flex/grid `min-w-0 [overflow-wrap:anywhere]`; halaman baru → `tests/e2e/extreme-content.spec.ts`.
- Lanjutan yang tercatat di `TASKS.md`: paging `/teams` > 60 tim, lencana "Penolong" & sunting di Komunitas, pemotong foto profil/poster.
