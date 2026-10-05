# Audit fitur & kesiapan rilis — 2026-10-05

Basis: branch `claude/website-finishing-touches-d4fztg` (dari `main` @ `a20c72f`).
Metode: baca kode + dokumen, build produksi mode demo, telusur 600 halaman
(tamu + 4 persona, `scripts/crawl-links.mjs`), tangkapan layar desktop 1366px &
ponsel Pixel 7 (terang/gelap), suite Vitest + Playwright (axe, e2e).
Dokumen ini melengkapi `docs/rencana-produksi.md` (audit per peran 2026-09-30)
— yang sudah tercatat di sana tidak diulang panjang, hanya dirujuk.

Legenda prioritas: **P0** = sebelum rilis publik · **P1** = 1–2 bulan pertama ·
**P2** = setelah ada pengguna nyata. Ukuran: S (≤1 hari) · M (≤1 minggu) · L (>1 minggu).

---

## 1. Ringkasan

1. **Fondasi keamanannya kuat** untuk proyek seukuran ini: CSP bernonce +
   `strict-dynamic`, RLS deny-by-default dengan uji SQL, otorisasi di dalam
   setiap Server Action, open-redirect guard, pesan auth anti-enumerasi, rate
   limit sendiri + Turnstile di `/submit`. Celah yang ditemukan sesi ini kecil
   dan sudah ditutup (§2).
2. **Masalah UX terbesar sudah diperbaiki di PR ini:** pengguna yang masuk tidak
   punya "rumah" — `/` selalu halaman iklan ("Buat akun dalam satu menit").
   Sekarang `/` = ringkasan pribadi (§3).
3. **Kesenjangan enterprise terbesar bukan di fitur, tapi di operasional:**
   belum ada pemantauan error, `/api/health`, manajemen pengguna untuk admin,
   antrean laporan konten, Syarat & Ketentuan, dan hapus akun di produksi.
4. **Nilai inti produk ("jangan sampai terlewat") baru setengah jalan:**
   pengingat hanya muncul di lonceng in-app. Antrean kirim ke email/WA sudah ada
   (ADR-051) tapi belum ada preferensi, persetujuan kanal, dan konsumennya.

---

## 2. Keamanan — temuan & status

| # | Temuan | Dampak | Status |
|---|---|---|---|
| S1 | Cookie sesi Supabase `httpOnly: false` (bawaan `@supabase/ssr`, padahal produk ini tidak punya klien browser — ADR-010) | Satu XSS = refresh token dicuri, sesi bisa diperpanjang penyerang terus | **Diperbaiki** — `src/lib/supabase/cookie-options.ts` (httpOnly + Secure di produksi), dipakai server & middleware, ada uji |
| S2 | `changePasswordAction` memverifikasi ulang sandi lama tanpa batas laju | Pemegang sesi curian bisa menebak sandi lama tanpa henti; semua panggilan dari IP server menghabiskan kuota auth Supabase seluruh pengguna (ADR-028) | **Diperbaiki** — ember masuk per IP+email **dan** ember per akun (`reauthPerAccount`, 10/jam) |
| S3 | Mode demo: tiap "masuk sebagai persona" menulis puluhan baris ke memori bersama tanpa batas | Skrip yang mengulang login demo menghabiskan memori server pratinjau sebelum reset 6 jam | **Diperbaiki** — batas `DEMO_SEEDED_USER_LIMIT` per siklus data (per identitas, bukan per IP: di belakang `next start` semua penguji lokal berbagi satu IP) |
| S4 | `Permissions-Policy` belum menutup `payment`/`usb`; halaman detail menyematkan iframe PDF dari host https mana pun | Dokumen sematan bisa meminta fitur tersebut | **Diperbaiki** + uji |
| S5 | Pendaftaran akun & lupa-sandi tanpa CAPTCHA (hanya rate limit per IP) | Pendaftaran massal akun palsu dari banyak IP | **Terbuka (P1, S)** — aktifkan CAPTCHA bawaan Supabase Auth (Turnstile) dan kirim token dari form daftar |
| S6 | `markNotificationReadAction` memanggil `revalidatePath(returnTo)` dengan path dari form | Pengguna yang masuk bisa membuang cache path apa pun — gangguan performa kecil, bukan kebocoran | **Terbuka (P2, S)** — batasi ke daftar path yang dikenal |
| S7 | `npm audit` (dev saja): rantai `eslint-config-next` → `fast-glob`/`braces` | Tidak ikut ke bundle produksi | **Terima** — pantau; perbaikan otomatis menurunkan versi mayor |
| S8 | Tidak ada MFA | Akun admin = kunci moderasi seluruh katalog | **Terbuka (P1, M)** — TOTP Supabase, **wajib untuk peran ADMIN** |

Yang sengaja **tidak** diubah setelah dicek: `noindex` untuk `/tracker` &
`/connections` (tamu hanya melihat halaman penjelas fitur — data pribadi tidak
pernah dirender untuk crawler), CSP `style-src 'unsafe-inline'` (ADR-027).

### Daftar periksa konfigurasi sebelum hosting (pemilik)

- [ ] Env wajib: `NEXT_PUBLIC_SITE_URL` (domain final — dipakai OAuth, sitemap,
      `allowedOrigins`), `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `RATE_LIMIT_SECRET` (≥32 acak), `CRON_SECRET` (≥32 acak), `TURNSTILE_SITE_KEY/SECRET_KEY`.
- [ ] Di belakang Cloudflare: `CLIENT_IP_HEADER=cf-connecting-ip` — tanpa ini batas per-IP bisa dipalsukan.
- [ ] Supabase Auth: daftar *Redirect URLs* hanya domain produksi; konfirmasi email ON;
      *leaked password protection* ON; panjang sandi minimum sama dengan `auth-schema.ts`.
- [ ] `GEMINI_MODEL` diisi model yang masih hidup (`gemini-2.0-flash` sudah mati 1 Jun 2026 — `docs/rencana-produksi.md` §2.2).
- [ ] Terapkan migration berurutan ke staging dulu, `npm run db:verify`, baru produksi.
- [ ] Setelah tayang: scan securityheaders.com; HSTS preload hanya setelah semua subdomain HTTPS.

---

## 3. Alur & UX — temuan uji demo

Hasil teknis: **0 error** (600 halaman, 5 peran: status ≥400, error konsol,
exception). Masalahnya ada di pengalaman, bukan di kerusakan.

| Temuan | Status |
|---|---|
| Pengguna masuk membuka `/` → halaman pemasaran yang sama dengan tamu ("Mulai gratis", "cari tanpa perlu bikin akun") | **Diperbaiki** — `PersonalHome`: sapaan WIB, "Perlu tindakan", pantauan, "Minggu ini", "Sesuai minatmu" + alasan urutan |
| Klik tautan tidak memberi tanda apa pun selama halaman dinamis dimuat (tanpa skeleton/`loading.tsx` — sengaja, ADR soft-404) | **Diperbaiki** — bilah progres navigasi (peningkatan progresif, tanpa mengubah status HTTP/no-JS) |
| 404, error, dan hasil kosong = ikon lucide generik + satu tombol | **Diperbaiki** — ilustrasi sketsa + jalan pulang nyata (cari, jenis kegiatan) |
| Hasil kosong karena kata kunci saja tetap bilang "filter terlalu sempit" | **Diperbaiki** — pesan menyebut penyebab sebenarnya |
| Ponsel: tab "Seminar" terpotong tanpa tanda bisa digeser | **Diperbaiki** — tepi kanan memudar |
| Ponsel `/admin`: 4 tombol navigasi 3 baris + 4 petak bertumpuk → item antrean pertama ±2 layar ke bawah | **Diperbaiki** — satu baris geser + petak 2 kolom |
| Beranda tamu di ponsel ±7,6 layar | Terbuka (P2) — pertimbangkan memotong bagian testimoni ilustrasi di ponsel |
| `/events` di ponsel: kartu pertama mulai ±57% layar | Terbuka (P2) — judul + deskripsi + catatan tangan bisa diringkas di < sm |

---

## 4. Inventaris fitur yang sudah ada

**Pengguna:** jelajah 5 papan per jenis + filter tanpa JS, FTS bahasa Indonesia,
detail (tahapan, syarat, buku panduan PDF, kalender .ics/Google, bagikan),
simpan + papan Pendaftaran (tahap, perlu tindakan), portofolio dari riwayat,
rekomendasi personal (SQL), notifikasi in-app H-3/H-1, tim lomba, koneksi
(saran, ajakan, peta, blokir), profil publik, kirim kegiatan + kabar keputusan,
ekspor data JSON, tema gelap. *Mode demo saja:* pesan, ruang diskusi, persiapan
berkas, preferensi notifikasi, profil ekstra.

**Penyelenggara:** ajukan verifikasi, klaim acara, usul revisi (dimoderasi),
studio dengan analitik (kunjungan unik harian, corong, audiens per jenjang,
k-anonimitas, pembanding sejenis), riwayat acara.

**Admin:** antrean acara hasil scraping + kiriman komunitas + penyelenggara/klaim/revisi,
kondisi antrean (batas 48 jam), riwayat moderasi + pulihkan, lencana otoritas
& promosi berlabel, kalibrasi bobot rekomendasi, reset data demo.

---

## 5. Kesenjangan vs platform skala enterprise

Pembanding: Devpost/Kaggle (lomba), LinkedIn/Glints (magang), Eventbrite
(penyelenggara), portal beasiswa kampus/LPDP, dan praktik standar SaaS.

### 5.1 Pengguna (siswa/mahasiswa)

| Pri | Fitur | Kenapa | Ukuran |
|---|---|---|---|
| P0 | **Pengingat di luar aplikasi** (email dulu; WA/Telegram menyusul) + preferensi & persetujuan per kanal | Nilai inti produk. Orang yang tidak membuka aplikasi tidak pernah melihat lonceng. Antrean sudah ada (ADR-051) | M |
| P0 | **Hapus akun** di produksi + ekspor lengkap | UU PDP; sudah direncanakan Fase 6a | M |
| P1 | **Peringatan pencarian tersimpan** ("kabari kalau ada lomba desain untuk SMA") | Fitur standar job board; mengubah kunjungan sekali jadi kebiasaan | M |
| P1 | **Laporkan kegiatan** (tautan mati, dugaan penipuan, info salah) dari halaman detail | Kepercayaan = pembeda utama produk ini; pengguna adalah sensor terbaik | M |
| P1 | **PWA + Web Push** | Mayoritas pengguna di ponsel; tanpa pasang aplikasi toko | M |
| P1 | **Feed kalender pribadi** (URL iCal bertoken untuk semua yang disimpan) | Satu langganan, bukan unduh .ics per acara | S |
| P1 | Pencarian toleran salah ketik + saran (pg_trgm) | "beasiwa", "hakaton" saat ini 0 hasil | M |
| P2 | Tautan portofolio publik / PDF | Dipakai untuk lamaran beasiswa & magang | M |
| P2 | Backend pesan & diskusi (masih demo) | Butuh desain moderasi dulu (`rencana-produksi.md` Fase 4) | L |
| P2 | Ulasan/penilaian penyelenggara setelah acara | Sinyal kepercayaan dari peserta | M |

### 5.2 Penyelenggara

| Pri | Fitur | Kenapa | Ukuran |
|---|---|---|---|
| P0 | **Buat acara langsung dari studio** (draf, pratinjau, semua kolom termasuk biaya & buku panduan) | Sekarang penyelenggara terverifikasi tetap lewat form komunitas `/submit`; revisi tidak bisa mengubah biaya/buku panduan (TASKS) | M |
| P1 | **Akun organisasi multi-anggota** (pemilik/editor/pemantau) | Himpunan berganti pengurus tiap tahun; akun satu orang = kehilangan akses | M |
| P1 | **Pengumuman ke penyimpan** (perpanjangan tenggat, perubahan jadwal) | Paling diminta penyelenggara; perlu batas & moderasi supaya bukan saluran spam | M |
| P1 | Ekspor analitik CSV + sumber kunjungan (UTM) | Laporan pertanggungjawaban ke sponsor | S |
| P1 | Promosi berbayar mandiri + faktur (Midtrans/Xendit) | Monetisasi; sekarang hanya admin yang bisa memasang | L |
| P2 | Verifikasi otomatis via email domain kampus/DNS | Mengurangi beban moderator | M |
| P2 | Form pendaftaran internal | **Belum disarankan** — produk ini agregator; menampung data peserta = beban PDP baru | L |

### 5.3 Admin / moderator

| Pri | Fitur | Kenapa | Ukuran |
|---|---|---|---|
| P0 | **Pemantauan error & kesehatan**: Sentry (atau log JSON terstruktur), `/api/health`, monitor uptime, alarm job pg_cron gagal | Tanpa ini, kegagalan produksi hanya diketahui dari keluhan | M |
| P0 | **Manajemen pengguna**: cari, tangguhkan, cabut peran/verifikasi, lihat jejak | Belum ada sama sekali; satu akun penyalahguna hanya bisa ditangani lewat SQL | M |
| P0 | **Jejak audit semua aksi admin** (lencana & promosi belum tercatat di `moderation_log`) | Akuntabilitas "siapa memberi lencana resmi" | S |
| P1 | Antrean laporan konten (pasangan §5.1 "Laporkan") | — | M |
| P1 | Kode alasan penolakan tertutup + aksi massal | Konsistensi & kecepatan moderasi (Fase 3) | M |
| P1 | Kesehatan sumber pipeline + pemeriksa tautan pendaftaran mati | Fase 1–2 | M |
| P1 | RBAC: moderator vs super-admin; MFA wajib | Prinsip hak minimum | M |
| P1 | Dasbor metrik produk (pengguna aktif, simpan→daftar, kiriman/minggu) — analitik ramah privasi (Plausible/Umami) | Keputusan produk berbasis data | M |
| P2 | Feature flag, CMS halaman statis/FAQ, status page | — | M |

### 5.4 Platform & legal

| Pri | Item | Ukuran |
|---|---|---|
| P0 | **Syarat & Ketentuan** (belum ada halamannya; hanya Kebijakan Privasi) + tinjau bersama penasihat hukum | S + legal |
| P0 | Backup + PITR Supabase diuji pulih (bukan sekadar menyala); runbook | S |
| P1 | CI keamanan: Dependabot, CodeQL, secret scanning, `docker build` sungguhan | S |
| P1 | Uji beban staging (hotspot Q1/Q5/Q6 di `rencana-produksi.md` §4) | M |
| P2 | WAF/bot management (Cloudflare) di depan seluruh situs | S |

---

## 6. Urutan yang saya sarankan

1. **Sebelum rilis:** konfigurasi §2 + Syarat & Ketentuan + Sentry/health +
   hapus akun + jejak audit admin. Tanpa ini, rilis = terbang tanpa instrumen.
2. **Bulan pertama:** pengingat email + preferensi, laporkan kegiatan + antrean,
   manajemen pengguna, CAPTCHA daftar, MFA admin, buat acara dari studio.
3. **Setelah ada data nyata:** peringatan pencarian, PWA/push, organisasi
   multi-anggota, promosi mandiri, pencarian toleran salah ketik.
