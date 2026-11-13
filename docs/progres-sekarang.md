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
| `main` | `b48d0e9` — PR #29 (ADR-079–088) dan #30 (menu melayang ADR-089) di-merge pemilik 13 Nov; deploy produksi READY. CI push `main` hijau setelah satu rerun (unduhan Google Fonts saat build) |
| Cabang kerja | `claude/brave-cray-xsqigf` = `main` + dokumen ini + ADR-090 (klik "Daftar" → Papan lamaran) — PR Valvasas/StudentFo#31 |
| Tes terakhir (13 Nov) | `verify` 1.085 · `db:test` semua · integrasi PostgREST 113 (+5 butuh GoTrue/Storage sungguhan) · Playwright seed penuh 1.021 lulus / 18 gagal → 3 akar masalah tes diperbaiki, rerun spec terdampak 79/79 + `event-gate` setelah data dimutasi 21/21 |

## 2. Keadaan database & hosting (dicek langsung 13 Nov)

| Hal | Keadaan |
|---|---|
| Migration produksi & staging | **51** di keduanya (13 Nov, atas persetujuan pemilik): `event_media`, `profile_media`, `submission_poster`, `community` sudah diterapkan; sidik skema identik lokal = staging = produksi |
| Supabase produksi `urmmihzjkkbxcwfzvuao` | **1 akun** (pemilik, ADMIN, email terkonfirmasi, MFA TOTP ✅), 8 acara di-stage Claude 13 Nov malam (§5 E): **1 tayang** (Yenching, disetujui 22.49 WIB), 7 PENDING; ekstensi `http` masih ada |
| SMTP Auth | Dipasang pemilik 13 Nov dengan Gmail khusus, tetapi **ditolak Gmail**: log Auth 22.47 WIB `535 5.7.8 Username and Password not accepted` (BadCredentials) → belum ada email Auth yang terkirim (§5, butir 2) |
| Region | Supabase `ap-southeast-1` + fungsi Vercel `sin1` — klaim "Singapura" di kebijakan privasi akurat |
| Job terjadwal | **pg_cron 7 job aktif, 0 gagal** (kedaluwarsa acara, notifikasi tenggat, pembersihan data). GitHub: *Scraper* gagal tiap hari (secret `PIPELINE_SOURCES_YAML` kosong); *Ops watchdog* & *Send deadline emails* **hijau palsu** — log: "secret belum diisi — dilewati" |
| Domain | `studentfo.com` **masih tersedia** (US$12,03/thn di Vercel), sudah terpasang di project tapi belum dimiliki → "misconfigured" |
| Vercel `studentfo` — Production | `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY` khusus Production (dibuat pemilik 10 Nov; isinya terenkripsi, tidak dibuka), `SUPABASE_SERVICE_ROLE_KEY` (Sensitive, diperbarui 10 Nov), `NEXT_PUBLIC_SITE_URL=https://studentfo.vercel.app` |
| Vercel — Preview & Development | URL & anon key **staging** (`iwttgkzxudhjatbvywke`) |
| Env Production lain | Belum diisi: Turnstile, `ERROR_ALERT_WEBHOOK_URL`, `CRON_SECRET`, Resend/`EMAIL_*`, `LEGAL_*` (lihat §5). `RATE_LIMIT_SECRET` kosong = jatuh ke service role key (disengaja) |
| Katalog | **0 acara tayang** (8 menunggu persetujuan) — masih masalah produk nomor satu |

## 3. Tahap A: pindah situs ke Supabase produksi (dikerjakan pemilik)

### A1–A2. Kunci & env Vercel — ✅ selesai (10 Nov)
Env Production terpisah dari staging sudah ada. Bila ragu kuncinya cocok:
uji langsung (daftar akun di situs), bukan dari log — log Vercel Hobby hanya 1 jam.

> A3–A4 di bawah **tidak bisa dikerjakan dari sesi Claude**: konektor Supabase
> sesi ini ditolak API dengan `Missing required permission(s): auth_config_read`
> (13 Nov), dan pengaturan Auth tidak tersimpan di database. Supaya sesi berikutnya
> bisa mengerjakannya, sambungkan ulang konektor Supabase di
> https://claude.ai/customize/connectors dengan izin konfigurasi Auth (bila
> ditawarkan), lalu mulai sesi baru. Centang sendiri yang sudah.

**Urutan tercepat (±10 menit):**
1. **A3b dulu** — Site URL & Redirect URLs. Tanpa ini tautan konfirmasi email
   mendarat di `localhost`.
2. **A4 tanpa menunggu SMTP** — daftar memakai **email akun Supabase-mu**:
   pengirim bawaan Supabase hanya mengirim ke anggota tim project, dan kamu
   anggotanya. Buka tautan konfirmasi di peramban yang sama (alur PKCE). Lalu
   bilang ke Claude "sudah daftar" — Claude yang menjalankan `UPDATE … role = 'ADMIN'`.
3. **A3a SMTP → A3c template → A3d MFA** — supaya pendaftar LAIN juga menerima email.

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

1. ✅ **Migration** — empat migration diterapkan ke staging (diuji, di-rollback bersih) lalu produksi, 13 Nov.
2. ✅ **PR & merge** — Valvasas/StudentFo#29 di-merge 13 Nov; deploy produksi `11fa26a` READY. Uji asap situs langsung: `/`, `/komunitas`, `/teams`, `/submit` 200 tanpa galat, navigasi memuat Komunitas, langkah "Media kegiatan" tampil di `/submit`.
3. **"Tahap A selesai"** → cek situs langsung: daftar/konfirmasi email/masuk, `/admin` + MFA, kirim & setujui satu kegiatan, poster tampil.

## 5. Tahap berikutnya (diperbarui 13 Nov malam)

Membeli domain **bukan** go-live — situs sudah publik di `studentfo.vercel.app`, dan
domain justru prasyarat Resend, alamat kontak privasi, PSE, dan Search Console.
Yang ditunda adalah *mengumumkan* situs (lihat "Sebelum diumumkan").

### Bisa dari HP sekarang (pemilik)

1. **MFA admin** di `/admin/mfa` — di ponsel, tombol "Buka di aplikasi autentikator" langsung membuka aplikasinya. Pakai autentikator yang punya cadangan/sinkron akun: HP hilang tanpa cadangan = akses admin hilang. Tanpa MFA, `/admin` menolak sesi (`checkAdminAccess` → `mfa-required`).
2. **SMTP Gmail sementara:** sandi aplikasi di `myaccount.google.com/apppasswords` (butuh Verifikasi 2 Langkah) → Supabase → Authentication → Emails → SMTP Settings: `smtp.gmail.com`, port 465, username & sender = alamat Gmail, nama `StudentFo`. Tanpa SMTP sendiri, email bawaan Supabase hanya terkirim ke anggota tim project — orang lain tidak bisa mendaftar. **Status 13 Nov 22.47: ditolak Gmail (`535 BadCredentials`).** Penyebab yang lazim: sandi akun biasa dipakai alih-alih sandi aplikasi, sandi aplikasi diketik dengan spasi, atau username bukan alamat lengkap. Halaman lupa sandi sengaja seragam (ADR-011), jadi kegagalan ini hanya terlihat di log Auth (`auth_logs`, cari `535`).
3. **Tinjau & setujui 8 acara PENDING** di `/admin` (daftar di E).
4. (Opsional) **Beli `studentfo.com`** di Vercel → Domains (sudah terpasang di project, DNS otomatis).

### Menunggu laptop

- **B. Turnstile:** Cloudflare → Turnstile → Add widget (Managed) dengan hostname `studentfo.vercel.app` **dan** `studentfo.com` → Vercel env `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (Sensitive) → redeploy. Tanpa kunci, `verifyCaptcha` lolos otomatis (`rate-limit-server.ts`) — form daftar & `/submit` hanya dijaga rate limit. CAPTCHA bawaan Supabase Auth tetap MATI.
- **C. Secret GitHub** (Settings → Secrets and variables → Actions): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret key terpisah bernama `github-actions`, bukan key Vercel), `ERROR_ALERT_WEBHOOK_URL` (webhook Discord/Slack; isi juga di env Vercel agar galat server ikut terkirim — log Vercel Hobby hanya ±1 jam). **Ralat versi sebelumnya:** job harian inti jalan di **pg_cron** dan sehat; secret ini untuk watchdog (sekarang dilewati), scraper, dan email tenggat.
- **Template email Auth:** `npm run email:templates` → tempel 8 berkas `supabase/templates/*.html` ke Supabase (konektor Claude tidak punya izin `auth_config`).
- **D. Bersih-bersih (hanya pemilik, SQL Editor):** staging `DROP SCHEMA studentfo_migration_runner CASCADE; DROP EXTENSION http;` · produksi `DROP EXTENSION http;`
- **E. Katalog.**
  - **8 PENDING** (di-stage lewat `stage_scraped_event`, tiap tanggal dikonfirmasi dari domain resmi penyelenggara): Yenching Academy PKU (30 Nov 08.00 WIB) · HKPFS 2027/28 (1 Des 11.00 WIB) · Gates Cambridge (8 Des; sebagian prodi 6 Jan — ditampilkan yang lebih awal, jam konservatif 19.00 WIB) · KAIST Undergraduate Regular + KAIST Scholarship (14 Jan 16.00 WIB) · Swedish Institute SGP (University Admissions 15 Jan; portal beasiswa 8–24 Feb) · Fulbright Master's & Doctoral AMINEF (15 Feb 23.59 WIB) · Microsoft Imagine Cup 2027 (1 Mar 12.59 WIB; khusus startup berbadan hukum).
  - **Pantau, belum dimasukkan** (belum ada pengumuman resmi siklus 2027): Türkiye Bursları (situs resmi: jendela tahunan 10 Jan–20 Feb), Stipendium Hungaricum 2027/28, Beasiswa Garuda 2027, Coding Camp DBS 2027, kalender lomba Puspresnas/Belmawa 2027. Lomba kampus bertenggat Des–Jan hampir semuanya hanya diumumkan di Instagram — itu celah yang harus diisi kiriman komunitas/penyelenggara, bukan scraper.
  - **Pipeline:** secret `GEMINI_API_KEY`, `GEMINI_MODEL`, `PIPELINE_SOURCES_YAML` (scraper gagal tiap hari karena yang terakhir kosong). Model hidup per halaman *deprecations* resmi 13 Nov: `gemini-3.8-flash` (atau `gemini-3.5-flash-lite`, lebih hemat) — tetap konfirmasi lewat `models.list`. **Memilih sumber = keputusan pemilik** (DECISION.md, pipeline). Kandidat untuk dinilai (robots.txt, ToS, selector): berita AMINEF, portal Simbelmawa Kemdiktisaintek, Beasiswa Garuda, berita LPDP, halaman "info lomba" kemahasiswaan kampus (mis. UNAND, UNHAS), situs LLDIKTI.

### Hari domain dibeli (urutan penting)

1. Supabase Auth → URL Configuration: Site URL `https://studentfo.com`, Redirect URLs tambah `https://studentfo.com/**` (alamat vercel.app jangan dihapus beberapa hari). **Dahulukan** — kalau env diganti lebih dulu, tautan email bisa mendarat di host lain dan sesinya hilang.
2. Vercel env `NEXT_PUBLIC_SITE_URL=https://studentfo.com` → **redeploy** (dibakar saat build; sitemap, robots, OG, canonical, tautan email membacanya).
3. Redirect 308 `www.studentfo.com` dan `studentfo.vercel.app` → `studentfo.com` (hindari situs kembar di Google).
4. Resend: verifikasi domain (SPF, DKIM, DMARC `p=none` dulu) → env `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_LINK_SECRET` (`openssl rand -hex 32`) → SMTP Supabase pindah dari Gmail ke Resend.
5. `CRON_SECRET` (nilai sama) di Vercel + secret GitHub `CRON_SECRET` & `SITE_URL` — baru setelah ini email tenggat benar-benar terkirim.
6. Turnstile tambah hostname (bila belum), Search Console (TXT) + kirim `/sitemap.xml`, penerusan email untuk `privasi@`, auto-renew domain + 2FA akun Vercel.

### Sebelum diumumkan ke publik

- **Supabase Pro** (Free dijeda bila sepi; perlindungan kata sandi bocor & cadangan harian hanya di Pro). **Vercel Pro** begitu promosi berbayar (ADR-049) dibuka — Hobby khusus non-komersial.
- **Hukum:** tinjauan penasihat hukum atas tiga dokumen → env `LEGAL_*` (sekarang nama pengelola masih placeholder); penilaian PP 17/2025 **sebelum** rilis karena bisa mengubah batas usia & fitur kontak orang asing; DPIA (`docs/dpia-draf.md`); PSE dengan URL final; DPA; putuskan pengelola atas nama pribadi atau badan usaha.
- **Beta tertutup** 10–20 mahasiswa (±2 minggu): ukur % tamu yang mendaftar di gerbang anggota (ADR-085), % yang menyimpan ≥1 acara ke Tracker, % yang kembali di minggu ke-2 — lalu putuskan longgar/ketatnya gerbang dengan data.

## 6. Catatan untuk Claude di sesi baru

- Langkah 0 tetap berlaku: `git fetch origin && npm run check:sync -- --fetch`, baca `CHANGELOG.md`.
- **Jangan** menerapkan migration ke staging/produksi atau merge tanpa persetujuan eksplisit di chat.
- Push hanya ke cabang kerja di atas; **tanpa force push**; PR hanya bila diminta. Bila PR cabang ini sudah di-merge, `git merge origin/main` (bukan rebase + force push).
- Jangan pernah menulis/mencetak rahasia; kredensial lewat `request_credential`, bukan chat. Jangan membuka (decrypt) env Vercel.
- ID yang dipakai: Vercel project `prj_QyApCj5dlEIFlWAhDdjXsvISmJ9Q`, team `team_9idfLfrFbcUzRDswt4KjcAB6`; Supabase produksi `urmmihzjkkbxcwfzvuao`, staging `iwttgkzxudhjatbvywke`.
- Tes lokal: `npm run verify` · Postgres `service postgresql start` lalu `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run db:test` (juga `test:integration`) · `npx playwright test --trace off` (build produksi mode seed di port 3100).
- Aturan baru ADR-088: batas jendela daftar = konstanta bersama di `repository.ts`; "milik saya?" = lookup satu baris; teks pengguna di item flex/grid `min-w-0 [overflow-wrap:anywhere]`; halaman baru → `tests/e2e/extreme-content.spec.ts`.
- Lanjutan yang tercatat di `TASKS.md`: paging `/teams` > 60 tim, lencana "Penolong" & sunting di Komunitas, pemotong foto profil/poster.
- Menambah katalog dari riset: jaringan sesi memblokir WebFetch ke situs luar, tetapi WebSearch dengan `allowed_domains` = domain resmi penyelenggara bisa dipakai untuk mengonfirmasi tanggal. Masukkan HANYA lewat `select public.stage_scraped_event(p)` (status PENDING, hash dedup dihitung SQL) — jangan pernah menulis APPROVED; penerbitan = keputusan pemilik di `/admin`. Tanggal tanpa jam resmi → pilih waktu yang lebih awal dari kemungkinan sebenarnya.
