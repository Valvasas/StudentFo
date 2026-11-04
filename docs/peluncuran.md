# Runbook peluncuran StudentFo — target Desember 2026

Disusun 4 November 2026 dari keadaan nyata akun (Vercel, Supabase) dan isi
repo setelah penggabungan ADR-066. Dokumen ini menggantikan daftar penghalang
yang tersebar di `docs/kesiapan-hosting.md` §6 dan `TASKS.md`; keduanya tetap
menjadi riwayat. Urutannya penting: tiap fase bergantung pada fase sebelumnya.

**Kolom "Siapa":** *Pemilik* = butuh akun, pembayaran, tanda tangan, atau
keputusan hukum; *Claude* = bisa dikerjakan di sesi agen (beberapa butuh izin
eksplisit karena menyentuh layanan bersama).

**Aturan rahasia:** kunci & kata sandi diisi langsung di dashboard (Vercel,
Supabase, GitHub, Resend, Cloudflare). Jangan pernah ditempel di chat, issue,
atau commit.

---

## Keadaan per 4 November 2026

| Hal | Keadaan | Catatan |
|---|---|---|
| Kode | `main` + ADR-061–066 tergabung di cabang `ccr-c5c96a43-8eijqc` | Semua uji hijau (lihat §6) |
| Supabase staging | `iwttgkzxudhjatbvywke`, Singapura, **paket Free**, 41 migration | Alat bantu `studentfo_migration_runner` + ekstensi `http` belum dihapus |
| Supabase produksi | **`urmmihzjkkbxcwfzvuao` "StudentFo"**, Singapura, paket Free, 41 migration (SHA-256 dicocokkan), 29 tabel ber-RLS, pg_cron aktif | Dibuat 4 Nov setelah "rasvara-" dijeda atas keputusan pemilik. Free = dijeda bila sepi seminggu & tanpa cadangan harian — pertimbangkan Pro sebelum promosi |
| Vercel | Project `studentfo`, produksi `studentfo.vercel.app`; `studentfo.com` + `www` (308 → apex) **sudah dipasang** | Env masih menunjuk ke Supabase **staging**; `NEXT_PUBLIC_SITE_URL` diganti setelah domain aktif |
| Domain | `studentfo.com` tersedia, US$12,03/tahun (harga Vercel) | Pemilik membeli sendiri di Vercel → Domains (data WHOIS tidak lewat chat) |
| Katalog | Kosong | Pipeline butuh `GEMINI_MODEL` hidup + sumber nyata |
| Dokumen hukum | Berlabel DRAF | Menunggu penasihat hukum |

---

## Fase 1 — Infrastruktur (minggu 1)

| # | Langkah | Siapa | Verifikasi |
|---|---|---|---|
| 1.1 | Gabungkan cabang `ccr-c5c96a43-8eijqc` ke `main` (PR) | Pemilik (review & merge) | CI `ci.yml` hijau |
| 1.2 | Hapus alat bantu staging: `DROP SCHEMA studentfo_migration_runner CASCADE; DROP EXTENSION http;` (sudah diperiksa: isinya hanya fungsi `apply`, tidak ada yang memakai `http`) | Pemilik di SQL Editor, atau Claude dengan konfirmasi | Security Advisor tidak lagi menandai `studentfo_migration_runner.apply` |
| 1.3 | ✅ 4 Nov: "rasvara-" dijeda, produksi dibuat di Free. Bila ingin pindah ke Pro nanti: **(a)** upgrade org ke Pro (sekitar US$25/bulan, termasuk kredit compute; cek halaman harga Supabase saat membayar), lalu buat project baru; atau **(b)** jeda project lain di org supaya kuota Free terbuka. Paket Free **tidak disarankan untuk produksi**: project dijeda otomatis bila sepi seminggu dan tanpa cadangan harian | Pemilik | — |
| 1.4 | ✅ Project produksi `urmmihzjkkbxcwfzvuao` di **ap-southeast-1 (Singapura)** | Claude | ACTIVE_HEALTHY |
| 1.5 | ✅ 41 migration diterapkan berurutan (diunduh dari commit `ea70afb`, SHA-256 dicocokkan dengan repo) | Claude | `list_migrations` = 41; Advisor = temuan yang sama dengan staging (disengaja, ADR-062 #8) |
| 1.5a | Samakan versi riwayat produksi dengan nama berkas (sekarang versi waktu-terap, mis. `20261104023555`) supaya `supabase db push` dari mesin pemilik tidak mengulang: `UPDATE supabase_migrations.schema_migrations SET version = <prefiks berkas> WHERE name = <nama>` | Claude (sesi berikut, `execute_sql`) | `list_migrations` menampilkan versi = prefiks berkas |
| 1.5b | Hapus ekstensi bantu `http` di produksi: `DROP EXTENSION http;` (tidak dipakai objek lain) | Pemilik di SQL Editor, atau Claude bila dialog konfirmasi bisa dijawab | Extensions tidak lagi menampilkan `http` |
| 1.6 | Supabase Auth (produksi): Site URL = domain final; Redirect URL `https://<domain>/auth/callback`; provider Google; TOTP aktif; **matikan** CAPTCHA bawaan Auth (Turnstile diperiksa server kita, ADR-056); aktifkan *Leaked password protection* (fitur paket Pro) | Pemilik | Daftar + konfirmasi email berhasil di produksi |
| 1.7 | SMTP kustom lewat Resend (email bawaan Supabase dibatasi beberapa email/jam) | Pemilik | Email konfirmasi tiba dari domain sendiri |
| 1.8 | Beli `studentfo.com` (Vercel → Domains, tim valvasas-projects). Domain & `www` → apex **sudah terpasang** di project | Pemilik beli | `curl -I https://studentfo.com` → 200 + header HSTS; lalu Claude mengganti `NEXT_PUBLIC_SITE_URL` & redeploy |
| 1.9 | DNS Resend (SPF, DKIM, DMARC) di domain baru | Pemilik | Status domain "Verified" di Resend |

## Fase 2 — Konfigurasi rahasia (minggu 1–2)

**Vercel → Settings → Environment Variables (Production).** Setelah diisi,
deploy ulang — variabel `NEXT_PUBLIC_*` ditanam saat build.

| Variabel | Isi | Wajib? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ganti dari staging ke project **produksi** | Ya |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci service_role produksi (tanpa ini panel admin, hapus akun, dan job gagal) | Ya |
| `NEXT_PUBLIC_SITE_URL` | `https://studentfo.com` (atau kanonik yang dipilih) | Ya |
| `RATE_LIMIT_SECRET`, `CRON_SECRET`, `EMAIL_LINK_SECRET` | Masing-masing `openssl rand -hex 32` | Ya |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile, hostname = domain final | Ya |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend; `EMAIL_FROM` memakai domain terverifikasi | Ya bila pengingat email dinyalakan |
| `LEGAL_OPERATOR_NAME`, `PRIVACY_CONTACT_EMAIL`, `PRIVACY_POLICY_EFFECTIVE_DATE`, `TERMS_EFFECTIVE_DATE` | **Hanya setelah Fase 4.1** — sebelum itu dokumen tetap berlabel DRAF (disengaja) | Ya, sebelum publik |
| `ERROR_ALERT_WEBHOOK_URL` | Webhook Slack/Discord tim | Disarankan |
| `CLIENT_IP_HEADER` | Kosongkan di Vercel (bawaan sudah benar) | — |
| `ALLOW_DEMO_IN_PRODUCTION`, `DEMO_*` | **Jangan diisi** di produksi publik | — |

**GitHub → Settings → Secrets and variables → Actions:** `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `CRON_SECRET`, `GEMINI_API_KEY`,
`GEMINI_MODEL` (model yang masih hidup — cek `models.list`; `gemini-2.0-flash`
sudah dimatikan), `PIPELINE_SOURCES_YAML`, `ERROR_ALERT_WEBHOOK_URL`,
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (opsional). Tanpa ini workflow
`scraper-cron`, `send-deadline-emails`, `ops-watchdog` gagal atau dilewati.

**Google Cloud Console:** OAuth client (tipe Web), *Authorized domains* =
domain final, *Authorized redirect URI* = callback Supabase produksi
(`https://<ref>.supabase.co/auth/v1/callback`). Selesaikan verifikasi
consent screen bila diminta Google.

## Fase 3 — Uji di produksi sebelum dibuka (minggu 2)

| # | Uji | Siapa |
|---|---|---|
| 3.1 | Daftar email → konfirmasi → masuk → hapus akun | Pemilik (akun uji) |
| 3.2 | Daftar & masuk dengan Google, dari `/register` dan `/penyelenggara/daftar` | Pemilik |
| 3.3 | Turnstile tampil & lolos di daftar, lupa sandi, `/submit` | Pemilik |
| 3.4 | Admin: pasang TOTP, `/admin` menuntut MFA, setujui kiriman uji | Pemilik |
| 3.5 | Penyelenggara: ajukan verifikasi → disetujui → buka formulir → pendaftar unggah bukti bayar ke Storage → periksa | Pemilik (2 akun) |
| 3.6 | Pengingat: simpan kegiatan bertenggat H-3 → notifikasi in-app & email | Pemilik |
| 3.7 | `ops-watchdog` dijalankan manual (workflow_dispatch) → beranda admin menunjukkan job sehat | Pemilik |
| 3.8 | Audit otomatis terhadap URL produksi: `crawl-links`, header keamanan, Lighthouse ponsel | Claude (butuh URL produksi) |

## Fase 4 — Hukum & kepatuhan (paralel, mulai minggu 1)

Draf kerangka ada di `docs/dpia-draf.md`. Semuanya **butuh penasihat hukum**.

| # | Kewajiban | Dasar | Siapa |
|---|---|---|---|
| 4.1 | Tinjau Kebijakan privasi, S&K, Kebijakan cookie; isi env hukum (Fase 2) | UU PDP, UU 8/1999 | Pemilik + penasihat hukum |
| 4.2 | Pendaftaran PSE Lingkup Privat **sebelum** dibuka untuk publik | PP 71/2019, Permenkominfo 5/2020 | Pemilik |
| 4.3 | Penilaian mandiri profil risiko anak (Koneksi & pencocokan tim = kontak dengan orang asing). Bila "tinggi" → batas usia naik ke 16+ (ubah S&K, privasi, teks centang usia, `LEGAL_REVISION`) | PP 17/2025, Permenkomdigi 9/2026 | Pemilik + penasihat hukum; Claude mengubah kode bila diputuskan |
| 4.4 | DPIA — bukti transfer (data keuangan) + data anak | UU PDP Ps. 34 | Pemilik (draf: `docs/dpia-draf.md`) |
| 4.5 | Perjanjian pemrosesan data dengan Supabase, Vercel, Resend, Cloudflare, Google | UU PDP Ps. 56 | Pemilik |
| 4.6 | Kotak masuk `PRIVACY_CONTACT_EMAIL` dipantau harian (tanggapan ≤ 3 × 24 jam) | UU PDP Ps. 5–13, 46 | Pemilik |

## Fase 5 — Isi katalog (minggu 2–3)

| # | Langkah | Siapa |
|---|---|---|
| 5.1 | Pilih sumber scraping yang boleh diambil (cek robots.txt & ketentuan tiap situs), tulis `PIPELINE_SOURCES_YAML` | Pemilik (keputusan per sumber, ADR-038) |
| 5.2 | Jalankan `scraper-cron` manual; setujui hasil di `/admin` setelah dicocokkan dengan sumber | Pemilik/moderator |
| 5.3 | **Minimal 20–30 kegiatan nyata yang masih buka sebelum promosi.** Tanpa tautan resmi terverifikasi = tidak dimasukkan | Moderator |
| 5.4 | Undang 3–5 penyelenggara pertama lewat `/penyelenggara` | Pemilik |

## Fase 6 — Hari-H & sesudahnya (minggu 4)

**Syarat buka (semua harus "ya"):** Fase 1–3 selesai · 4.1 & 4.2 selesai ·
≥ 20 kegiatan buka · akun admin ber-MFA · webhook galat menerima uji.

1. Uji coba terbatas (5–20 orang dikenal) selama beberapa hari; pantau
   `/admin`, webhook galat, dan antrean Laporan.
2. Buka untuk publik; promosi bertahap (satu kanal dulu).
3. Minggu pertama: periksa antrean moderasi & laporan setiap hari, Tanya
   jawab di kegiatan populer (tayang tanpa pra-moderasi, ADR-062), dan job
   terjadwal di beranda admin.
4. **Rollback:** Vercel → Deployments → *Promote* deployment sebelumnya.
   Migration hanya maju; perubahan skema darurat lewat migration baru.

---

## Lampiran — bukti uji di sesi penggabungan (4 Nov 2026)

`npm run verify` (810 unit + kontras), pipeline 13 + 15 + 4, `npm run db:test`
(semua migration & uji SQL), integrasi 101 (5 dilewati: butuh GoTrue/Storage
Docker), e2e mode seed 793, e2e Supabase 13 (termasuk katalog & papan kosong).
