# DECISION.md

Log keputusan arsitektural (ADR ringkas) untuk hal-hal **di luar** cakupan
`supabase/DEVIATIONS.md` (yang sudah mendokumentasikan 17 penyimpangan
skema/keamanan dari blueprint asli secara rinci — baca dokumen itu untuk
keputusan level database/RLS/dedup/enum).

Format tiap entri: **Konteks → Keputusan → Konsekuensi**. Tambahkan entri
baru di atas (paling baru di atas) saat kamu membuat keputusan arsitektural
yang tidak jelas dari kode, atau saat menyimpang dari sesuatu yang sudah
terdokumentasi.

---

## ADR-038 — Yang sengaja ditunda: Linimasa, sumber scraping nyata, scan header publik

**1. Panel "Linimasa kamu" (checklist persiapan per kegiatan) — DITUNDA sampai
ada ±100 event nyata tayang dan data pemakaian tracker.** Fitur ini butuh tabel
baru, RLS, kontrak repository, dan UI, untuk kebutuhan yang belum divalidasi
(kanvas desain memakainya sebagai contoh tampilan, TASKS menyebutnya
eksplisit). Produk saat ini punya nol event nyata; setiap fitur yang dibangun
sebelum data nyata masuk menambah permukaan yang harus dirawat tanpa sinyal
apakah dipakai. Pemicu untuk mengerjakannya: `/admin/kalibrasi` menunjukkan
cukup sinyal simpan/daftar, dan tracker dipakai lebih dari tahap SAVED.

**2. 10+ sumber scraping nyata & satu siklus penuh pipeline — TIDAK dikerjakan
dari lingkungan ini.** Butuh `GEMINI_API_KEY`, secret `PIPELINE_SOURCES_YAML`,
project Supabase sungguhan, dan — yang terpenting — keputusan manusia per
sumber (izin/ToS situs, robots.txt, apakah halaman itu memang sumber resmi).
Memilih situs untuk di-scrape atas nama produk adalah keputusan pemilik, bukan
agent. Yang terverifikasi: `test_models.py` 12/12, `test_publisher.py` 4/4,
`run.py --dry-run` (venv Python 3.11, 2026-09-26).

**3. Scan securityheaders.com / Mozilla Observatory — menunggu deploy staging
publik.** Pengganti sementara: header build produksi dicatat & dikunci test
(`tests/e2e/security-headers.spec.ts`), per 2026-09-26:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic' https:
  https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
  font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src
  https://challenges.cloudflare.com; form-action 'self' <supabase> https://accounts.google.com;
  frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY · X-Content-Type-Options: nosniff · COOP: same-origin
Referrer-Policy: strict-origin-when-cross-origin · Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Perkiraan jujur: scanner akan menandai `style-src 'unsafe-inline'` (disengaja,
ADR-027) dan tidak ada `Cross-Origin-Embedder-Policy` (sengaja — akan memblokir
iframe Turnstile). Setelah staging ada: jalankan scan, tempel hasilnya di sini.

---

## ADR-037 — Kabar ke pengirim kiriman komunitas: notifikasi in-app ke akun yang masuk, bukan email

**Konteks:** `ugc_submissions.submitted_by_email` tersimpan tapi tidak pernah
dipakai; pengirim tidak pernah tahu kirimannya tayang atau ditolak.

**Keputusan:**
- **In-app, bukan email.** Email transaksional butuh provider (Resend dsb.),
  domain terverifikasi (SPF/DKIM), templat, dan kebijakan data — terlalu besar
  sebelum produk online. Jalur email bisa ditambahkan kemudian di atas kolom
  yang sama.
- **Dikaitkan ke `submitted_by` (akun yang MASUK saat mengirim), bukan
  dicocokkan dari email yang diketik.** Pencocokan email membuat siapa pun bisa
  mengirim sampah atas nama alamat orang lain dan korbannya menerima kabar
  "kiriman ditolak". Kolom baru, hak INSERT hanya untuk `authenticated`, policy
  `ugc_public_insert` mensyaratkan `submitted_by = auth.uid()`.
- Trigger `notify_submission_decision()` (migration `20260926160001`) membuat
  notifikasi `SUBMISSION_APPROVED` (bertaut ke event yang baru tayang) atau
  `SUBMISSION_REJECTED`. Tamu tetap boleh mengirim; form memberi tahu bahwa
  mereka tidak akan dikabari kecuali masuk.

**Konsekuensi:** Tamu tidak mendapat kabar apa pun. Paritas mode seed di
`MemoryEventRepository` (notifikasi tersimpan digabung dengan turunan tenggat).
Dibuktikan: SQL (anon/pengguna lain tidak bisa mengatasnamakan, tamu tanpa
kabar, taut event benar), unit, integrasi PostgREST, dan e2e browser
(mahasiswa mengirim → admin setuju → klik lonceng membuka halaman kegiatan).

---

## ADR-036 — Browser dalam aplikasi (Instagram/TikTok) & cookie sesi di Safari privat

**Konteks:** Trafik utama kemungkinan dari tautan di Instagram/TikTok, yang
membuka halaman di WebView aplikasi, dan dari Safari iOS (termasuk mode privat).

**Analisis cookie (tanpa perubahan kode):** cookie sesi demo dan Supabase
di-set SERVER lewat header HTTP, first-party, `httpOnly`, `SameSite=Lax`,
`Secure` di produksi. Batas 7 hari ITP Safari hanya berlaku untuk cookie
yang ditulis JavaScript (dan cookie server dari IP pihak ketiga/CNAME
cloaking) — bukan kasus ini selama domain aplikasi = domain yang melayani
HTML. Mode privat Safari: cookie bekerja normal dan dibuang saat tab ditutup
(sesuai harapan untuk akun demo, ADR-029). WebView aplikasi: cookie
first-party bekerja, tapi TERPISAH dari Safari/Chrome — sesi tidak terbawa
saat pengguna pindah ke browser. Alur POST Server Action → redirect 303 tidak
bergantung pada cookie pihak ketiga.

**Masalah nyata yang ditemukan:** Google menolak OAuth dari WebView
("Error 403: disallowed_useragent"). Tombol "Masuk dengan Google" pasti gagal
di Instagram/TikTok/Facebook/LINE.

**Keputusan:** `detectInAppBrowser()` (UA: Instagram, TikTok/musical_ly/trill/
BytedanceWebview, FBAN/FBAV, LINE, Snapchat, LinkedIn, penanda WebView Android
`; wv)`) — di sana tombol Google diganti petunjuk "Buka di browser"; login email
tetap ada. Tanpa UA → tombol tetap tampil (tidak menyembunyikan berdasarkan
tebakan).

**Konsekuensi:** Diuji 13 UA nyata (unit) + e2e mode Supabase (UA Instagram:
tombol hilang, petunjuk tampil, form email ada; UA biasa: tombol ada).
**Belum** diverifikasi di perangkat fisik: Safari iOS privat, WebView Instagram/
TikTok sungguhan, dan Chrome Custom Tabs — lingkungan pengerjaan hanya punya
Chromium. Daftar UA perlu dirawat; aplikasi baru → tambahkan polanya.

---

## ADR-035 — Diukur dulu: skor relevansi tetap di Node; `count` exact → planned otomatis di atas 20.000 event

**Konteks:** ADR-021 menyarankan memindah skor relevansi ke SQL "kalau katalog
> 1.000–2.000 event", dan `count: 'exact'` dicurigai mahal. Keduanya belum
pernah diukur.

**Pengukuran** (`tests/integration/listing-scale.test.ts`, PG16 + PostgREST
v12 lokal, median 5×, katalog sintetis, `BENCH_SIZES=5000,20000,50000`),
dalam ms per `listEvents` lewat supabase-js:

| Event APPROVED | relevansi (240 + skor Node) | terbaru | tenggat hal. 20 | cari FTS | filter | statistik |
|---|---|---|---|---|---|---|
| 5.000  | 21  | 12  | 22  | 20  | 20  | 20  |
| 20.000 | 106 | 81  | 127 | 46  | 69  | 72  |
| 50.000 | 159 | 138 | 809 | 146 | 171 | 119 |

Dibedah lewat log Postgres (SQL persis yang dikirim PostgREST): pada 50.000
event, urutan tenggat + `Prefer: count=exact` = ±700 ms, tanpa count ±140 ms,
`count=planned` ±135 ms (perkiraan 12.499 vs pasti 12.500 untuk filter jenis).
Penyebab: tenggat utama ada di `event_deadlines`, sehingga halaman DAN count
masing-masing men-join seluruh `events × event_deadlines` (plus subquery RLS);
tidak ada index yang bisa membantu lintas join itu.

**Keputusan:**
1. Skor relevansi TETAP di Node — 159 ms di 50.000 event; pindah ke SQL/RPC
   belum sebanding biayanya.
2. `chooseCountMode()`: `exact` selama event aktif ≤ `EXACT_COUNT_MAX_ACTIVE`
   (20.000), `planned` di atasnya. Ukuran katalog diambil dari `getStats()` yang
   sudah di-cache (ADR-034) — tanpa query tambahan. Tidak memakai `estimated`
   bawaan PostgREST karena ambangnya = `max_rows` Supabase (1000).

**Konsekuensi / langkah berikutnya bila katalog > 20.000:** total paginasi
menjadi perkiraan (halaman terakhir bisa kosong). Perbaikan yang sebenarnya
untuk urutan tenggat adalah denormalisasi `primary_deadline_at` ke `events`
(dijaga trigger) + index parsial `(primary_deadline_at) WHERE status =
'APPROVED'` — belum dikerjakan karena katalog nyata masih nol. Ukur ulang dengan
`BENCH_SIZES` sebelum memutuskan.

---

## ADR-034 — Cache di lapisan data (`unstable_cache` + tag `events`), halaman tetap dinamis

**Konteks:** Semua halaman publik `force-dynamic` sehingga setiap kunjungan
menjalankan ulang query listing, detail, statistik, dan kategori.
`revalidatePath` di aksi admin tidak berguna tanpa cache. ISR tidak mungkin:
CSP bernonce (ADR-027) mewajibkan HTML per request, dan halaman membaca sesi.

**Keputusan:** `SupabaseEventRepository` membungkus query publik (listing,
detail, closing soon, kategori, statistik, pita minggu ini) dengan
`unstable_cache` — tag `events`, TTL 300 detik (`src/lib/data/cache.ts`).
Query publik memakai klien anon TANPA cookie (`createSupabasePublicClient`),
karena `cookies()` dilarang di dalam cache dan hasilnya dibagi antarpengunjung.
Peringkat relevansi berprofil dihitung SETELAH jendela kandidat diambil dari
cache — profil tidak pernah jadi kunci cache. Aksi moderasi memanggil
`revalidateTag('events')`. Lapisan cache di-inject (integration test memakai
`noCache`). Mode seed tidak di-cache (datanya per proses dan berubah per pengguna).

**Konsekuensi:** Dibuktikan di build produksi mode Supabase
(`npm run test:e2e:supabase`: Next + PostgREST + stub auth): kunjungan kedua ke
`/events` tidak menyentuh database (kode lama: +1 query setiap kunjungan);
persetujuan admin langsung menayangkan event di listing DAN halaman detail.
Temuan saat pembuktian: `revalidatePath('/events')` sudah mencabut entri
listing (tag implisit per path), tapi TIDAK entri detail `/events/<slug>` —
tanpa `revalidateTag`, tautan kegiatan yang tadinya 404 tetap 404 sampai TTL
(dibuktikan: test gagal saat `revalidateTag` dimatikan). Perubahan tanpa
revalidasi (expiry pg_cron, `saved_count`) basi ≤ 5 menit; label H-n tidak
ikut basi karena dihitung saat render. Status simpan per pengguna TIDAK
dipisah ke komponen streaming: itu satu lookup PK per request dan HTML-nya
tetap per request karena nonce — pemisahan menambah kompleksitas tanpa
menghemat query berarti.

---

## ADR-033 — Integration test repository: Postgres + PostgREST sungguhan, bukan `supabase start`

**Konteks:** `SupabaseEventRepository` (±900 baris) nol test — hanya
`MemoryEventRepository` yang diuji. TASKS meminta `supabase start` di CI.

**Keputusan:** `npm run test:integration` (`scripts/with-postgrest.sh`):
database baru + semua migration + stub `auth`, PostgREST v12 (binary statis,
di-cache di `.cache/`) dengan `max_rows = 1000` seperti Supabase, role
`authenticator` pola Supabase. `createSupabaseServerClient/AdminClient`
diganti klien supabase-js ASLI yang membawa JWT bertanda tangan (anon /
authenticated+sub / service_role), jadi RLS, RPC, trigger, dan hak kolom
berjalan sungguhan. `supabase start` tidak dipakai: repository tidak memanggil
Auth API, Docker image Supabase berat (dan tidak bisa ditarik di lingkungan
pengerjaan), sedangkan jalur ini jalan di mana pun `db:test` jalan. Stub
`auth.uid()` disamakan dengan definisi Supabase (membaca `request.jwt.claims`).
Test paritas (`tests/integration/parity.test.ts`) menjalankan skenario yang
sama terhadap kedua implementasi.

**Konsekuensi:** Pada percobaan pertama menemukan dua bug nyata:
(1) SETIAP pencarian di produksi gagal — `events_listing` tanpa `search_vector`
(migration `20260926150001`); (2) mode demo mengizinkan menyimpan/melacak
event PENDING yang ditolak produksi. Yang TIDAK diuji jalur ini: GoTrue
(login/daftar/OAuth sungguhan) dan Storage — tetap butuh project Supabase
staging. Job CI `integration` baru ditambahkan tapi belum pernah berjalan di
GitHub (hanya diverifikasi lokal).

---

## ADR-032 — Kalibrasi bobot rekomendasi: log niat + rekonstruksi kandidat, bukan log impression

**Konteks:** ADR-026 menyatakan bobot `PERSONAL_WEIGHTS`/`COLD_START_WEIGHTS`
tebakan terdidik yang wajib dikalibrasi begitu ada data. Belum ada satu pun
data yang dicatat.

**Keputusan:**
- Catat hanya NIAT: `save` (Server Action simpan) dan `register_click`
  (tombol "Daftar" kini keluar lewat `/events/<slug>/daftar`, 303 ke
  `registration_link` dari database — bukan open redirect). Profil disalin saat
  sinyal terjadi. Tabel `recommendation_signals`, tulis hanya service_role.
- TIDAK mencatat impression: satu INSERT per kartu per tayangan terlalu mahal.
  Kandidat negatif direkonstruksi saat analisis: event yang sudah terbit dan
  belum tutup pada waktu sinyal.
- Penyaring: agen bot/pratinjau tautan (WhatsApp, Telegram, Slack, crawler)
  dibuang; >60 sinyal/jam per IP dibuang; `/events/*/daftar` di-Disallow
  robots.txt dan ditautkan dengan `<a>` biasa (tanpa prefetch). Pencatatan
  tidak pernah melempar — gagal mencatat tidak menahan pengguna.
- Analisis `calibrate()` (`src/lib/recommendation-calibration.ts`): komponen
  dihitung dengan fungsi yang sama dengan `rankEvents()`, regresi logistik,
  koefisien positif dinormalisasi berjumlah 1; tidak ada saran di bawah 200
  sinyal. Laporan di `/admin/kalibrasi`; bobot tetap diubah manual lewat
  commit + ADR. Regresi memakai Newton-Raphson (IRLS, ±10 iterasi) dan tanggal
  diurai sekali per event/sinyal: versi pertama (gradient descent + `Intl` per
  pasangan sinyal×event) butuh 72 dtk untuk 5.000×2.000 — kini 1,25 dtk,
  dikunci test skala.

**Konsekuensi:** Saran bias posisi (menguatkan bobot yang berlaku) dan
popularitas memakai `saved_count` kini — dicetak di halaman laporan. Kalau
nanti butuh estimasi tak bias, jalurnya eksperimen acak kecil (mis. 5%
tayangan diurutkan acak) — bukan log impression penuh. Dibuktikan: data
sintetis di mana hanya minat (atau hanya tenggat) menentukan pilihan →
`calibrate()` menemukan kembali komponen itu sebagai bobot terbesar; e2e mode
demo: simpan dari browser tercatat di laporan, dari agen pratinjau WhatsApp
tidak. Belum ada data nyata — laporan produksi baru bermakna setelah ±200
sinyal per jalur.

---

## ADR-031 — Log moderasi append-only diisi trigger, bukan halaman di atas `reviewed_by`

**Konteks:** Permintaan awalnya "tampilkan `reviewed_by`/`reviewed_at` yang sudah
ada". Kolom itu hanya menyimpan keputusan TERAKHIR: admin B yang membalik
keputusan admin A menghapus jejak A, dan job expiry / SQL editor tidak
meninggalkan jejak sama sekali. `ugc_submissions` bahkan tidak punya kolom
peninjau — penolakan kiriman anonim terhadap siapa pun.

**Keputusan:** Migration `20260926130001_moderation_log.sql`: tabel
`moderation_log` + trigger `log_moderation_change()` di `events` dan
`ugc_submissions` (INSERT non-PENDING dan UPDATE OF status). Aktor = `reviewed_by`
hanya bila `reviewed_at` ikut berubah di baris itu; selain itu NULL
("sistem / di luar aplikasi") — tidak mengatribusikan perubahan otomatis ke
peninjau sebelumnya. Tidak ada hak tulis bagi role API mana pun (termasuk
service_role). `ugc_submissions` mendapat `reviewed_by/reviewed_at`;
`approve_submission()` diisi ulang identik + jejak peninjau. Mode seed mencatat
log yang sama di `MemoryEventRepository`. UI: `/admin/riwayat` (100 terakhir).

**Konsekuensi:** Aplikasi tidak bisa lupa mencatat, karena aplikasi tidak
mencatat. Log bisa dihapus hanya oleh pemilik database (postgres) — itu batas
yang disadari, bukan jaminan forensik. Belum ada paginasi/filter per admin;
tambahkan begitu log > 100 entri per minggu.

---

## ADR-030 — Job harian di pg_cron, bukan GitHub Actions `schedule`

**Konteks:** `expire_past_events()` dan `create_deadline_notifications()`
dijadwalkan GitHub Actions. `schedule` di sana bisa telat/dilewati saat antrean
padat dan dinonaktifkan otomatis setelah 60 hari repo publik tanpa commit —
job expiry & notifikasi berhenti tanpa satu pun alarm.

**Keputusan:** Migration `20260926120001_pg_cron_jobs.sql` membuat extension
pg_cron dan tiga job bernama (`cron.schedule` meng-upsert per nama, aman diulang),
termasuk `purge_rate_limit_hits()` (ADR-028). Bersyarat: tanpa pg_cron (CI
postgres:15 polos) hanya NOTICE. Workflow GitHub tetap ada sebagai jalur manual.
`scripts/test-migrations.sh` kini `DROP DATABASE … WITH (FORCE)` karena worker
pg_cron memegang koneksi ke database uji.

**Konsekuensi:** Dibuktikan di PG16 lokal dengan pg_cron 1.6: test
`60_pg_cron_jobs` gagal sebelum migration, lolos sesudahnya; job uji 2 detik
benar-benar mengubah event bertenggat lewat jadi EXPIRED
(`cron.job_run_details.status = succeeded`). Belum di-apply ke project Supabase
mana pun. Setelah apply, pantau `cron.job_run_details` — kegagalan job kini ada
di database, bukan di tab Actions.

---

## ADR-029 — Akun demo tidak bisa dipulihkan, dengan sengaja

**Konteks:** Sesi demo (ADR-024) hanya hidup di cookie bertanda tangan. Hapus
cookie, keluar, atau pindah browser → UUID baru, data lama yatim sampai reset
6 jam. Pertanyaan yang muncul: perlu fitur "pulihkan akun demo saya"?

**Keputusan:** Tidak. Pemulihan butuh pengenal yang bertahan di luar cookie
(email, kode pemulihan, sidik perangkat) — tiga-tiganya menambah data pribadi
atau permukaan serangan untuk data yang fiktif dan akan terhapus paling lama
6 jam lagi. Perilaku ini dinyatakan di kartu login demo dan README.

**Konsekuensi:** Kontributor jangan melaporkan/memperbaiki ini sebagai bug.
Data yatim dibatasi oleh reset 6 jam (memori tidak tumbuh tanpa batas).
Keputusan ditinjau ulang hanya kalau mode demo dipakai untuk sesi panjang
(mis. workshop berhari-hari), dan jalurnya adalah `DEMO_DATA_TTL_MS`, bukan
akun yang bisa dipulihkan.

---

## ADR-028 — Pembatas laju sendiri untuk masuk/daftar/lupa-sandi/`/submit` + Turnstile di `/submit`

**Konteks:** TASKS Phase 2 menunda rate limit masuk dengan alasan "bersandar pada
Supabase Auth". Asumsi itu keliru untuk arsitektur ini: semua panggilan auth
berasal dari Server Action, jadi batas per-IP bawaan Supabase melihat **IP server
Next.js** untuk semua pengguna. Satu penyerang yang menebak sandi menghabiskan
kuota bersama — seluruh pengguna terkunci dari halaman masuk. `/submit` juga hanya
dibatasi per email (bisa dikarang) dan plafon global.

**Keputusan:**
- Tabel `rate_limit_hits` + RPC `consume_rate_limit(bucket, limit, window)`
  (migration `20260926110001`), jendela geser, `pg_advisory_xact_lock` per ember,
  hanya `service_role`. Kunci ember = HMAC-SHA256(`RATE_LIMIT_SECRET`, IP[, email])
  — tidak ada IP mentah di database. Mode seed: `MemoryRateLimiter` dengan aturan
  yang sama.
- Aturan (`RATE_LIMITS`): masuk 30/15 mnt per IP dan 5/15 mnt per IP+email;
  daftar 5/jam per IP; lupa sandi 5/jam per IP; `/submit` 5/jam per IP. **Tidak
  ada batas per email saja** — itu alat untuk mengunci akun orang lain.
- IP tak terbaca → batas per-IP dilewati (kalau tidak, semua orang berbagi satu
  ember "unknown"). RPC gagal → fail open + log: pembatas rusak tidak boleh
  mengunci semua orang; lapisan Supabase Auth dan trigger ADR-023 tetap ada.
- Turnstile di `/submit` saja, opsional lewat `TURNSTILE_SITE_KEY` +
  `TURNSTILE_SECRET_KEY`, diverifikasi server-side, **fail closed**.

**Konsekuensi:** Menggantikan catatan "bersandar penuh pada Supabase Auth" di
TASKS Phase 2. Harga: `/submit` dengan CAPTCHA aktif butuh JavaScript —
pengecualian sadar dari prinsip tanpa-JS (ADR-012), hanya untuk form tamu yang
paling mudah disalahgunakan; halaman masuk tetap tanpa CAPTCHA dan tanpa JS.
Batas per IP hanya berarti kalau proxy terdepan menimpa `x-forwarded-for`
(Vercel/Cloudflare ya; hosting lain wajib dicek). Terbukti: 40 panggilan paralel
batas 5 → tepat 5 lolos; e2e `/submit` kiriman ke-6 dengan email baru ditolak
(gagal sebelum perubahan). Widget Turnstile asli belum diuji end-to-end (egress
sandbox ke Cloudflare diblokir) — uji di staging dengan kunci uji resmi.

---

## ADR-027 — CSP bernonce per request + HSTS; halaman tetap dinamis

**Konteks:** Header keamanan hanya empat (nosniff, X-Frame-Options, Referrer,
Permissions). Tanpa CSP, satu celah XSS (mis. deskripsi event hasil LLM yang
suatu hari dirender sebagai HTML) langsung jadi eksekusi skrip penuh.

**Keputusan:** `src/middleware.ts` membuat nonce 128-bit per request dan
mengirim CSP `script-src 'nonce-…' 'strict-dynamic'` (tanpa `unsafe-inline`,
`unsafe-eval` hanya di dev), `frame-ancestors 'none'`, `object-src 'none'`,
`base-uri 'self'`, `form-action` yang mengizinkan redirect OAuth
(origin Supabase + accounts.google.com). Middleware kini berjalan di mode seed
juga. HSTS `max-age=63072000; includeSubDomains; preload` hanya di build
produksi. Aturan dirakit di `src/lib/security-headers.ts` (fungsi murni, diuji).

**Konsekuensi:** Nonce mewajibkan render dinamis per request — HTML tidak boleh
di-cache statis. Cache ditaruh di lapisan data (ADR-030). `style-src` tetap
`'unsafe-inline'` karena atribut `style=` tidak bisa bernonce. Dibuktikan di
browser oleh `tests/e2e/security-headers.spec.ts` (gagal 7/8 sebelum perubahan,
lolos 24/24 sesudahnya; axe 48/48 tetap lolos). **Pendaftaran preload di
hstspreload.org sengaja belum dilakukan** — tidak bisa dibatalkan cepat, tunggu
domain produksi final dan semua subdomain HTTPS.

---

## ADR-026 — Skor rekomendasi memperhitungkan kedekatan tenggat

**Konteks:** Rumus blueprint §6 (`0.5 kategori + 0.3 jenjang + 0.2 recency`,
cold start `0.6 recency + 0.4 popularitas`) tidak punya sinyal tenggat. Nilai
utama produk adalah "jangan sampai terlewat", tapi kegiatan yang tutup lusa
bisa kalah dari kegiatan baru yang tutup tiga bulan lagi.

**Keputusan:** Tambah komponen `deadlineFit` (0..1, hari kalender WIB):
0 untuk ditutup, 0.6 untuk hari-H, 1 untuk 1–14 hari, lalu meluruh separuh
per 14 hari; 0.3 untuk tanpa tenggat. Bobot menjadi personal
`0.45/0.25/0.15/0.15` (kategori/jenjang/tenggat/recency) dan cold start
`0.45/0.30/0.25` (recency/popularitas/tenggat). Bobot diekspor sebagai
konstanta dan diuji berjumlah 1.

**Konsekuensi:** Kecocokan minat tetap sinyal terkuat (diuji: kegiatan relevan
dengan tenggat 60 hari mengalahkan kegiatan tak relevan yang tutup 3 hari lagi).
Hari-H sengaja tidak diangkat, selaras dengan tidak adanya notifikasi H-0.
Bobot adalah tebakan terdidik, bukan hasil pengukuran: begitu ada data klik
atau simpan nyata, bobot ini wajib dikalibrasi ulang.

---

## ADR-025 — Produksi tanpa kredensial Supabase gagal keras, kecuali demo diminta eksplisit

**Konteks:** `dataMode` jatuh ke `seed` setiap kali env Supabase kosong,
termasuk di produksi. Deploy yang lupa mengisi env akan tayang dengan
kegiatan fiktif tanpa satu pun log error.

**Keputusan:** `resolveDataMode()` melempar error di runtime produksi tanpa
kredensial, kecuali `ALLOW_DEMO_IN_PRODUCTION=true`. Fase `next build`
dikecualikan karena build tidak memerlukan kredensial.

**Konsekuensi:** Situs pratinjau dan job CI a11y (`next start`) harus
menyetel flag tersebut secara eksplisit — itu disengaja.

---

## ADR-024 — Mode demo punya akun sungguhan: persona bertanda tangan, per pengunjung

**Konteks:** Di mode seed, `getSessionUser()` selalu `null`, jadi separuh
produk (profil, simpan, tracker, tim, notifikasi, rekomendasi personal) tidak
bisa didemokan, walau `MemoryEventRepository` sudah mengimplementasikannya.
Selain itu `/admin` terbuka untuk siapa pun di mode seed.

**Keputusan:**
- Tiga persona sekali klik (`lib/demo/personas.ts`). Sesi berupa cookie
  HMAC-SHA256 (`lib/demo/session-token.ts`) berisi UUID acak per login dan
  profil. Cookie yang diubah (mis. peran jadi ADMIN) ditolak.
- `getSessionUser()` mengembalikan `AuthUser` demo dengan bentuk identik,
  sehingga halaman dan Server Action tidak bercabang `if (demo)`.
- `/admin` di mode seed memakai gerbang yang sama dengan produksi.
- Data demo dibangun ulang tiap 6 jam (`DEMO_DATA_TTL_MS`) dan bisa direset
  admin demo. Repository disimpan di `globalThis`.

**Konsekuensi:** Data kegiatan dan moderasi tetap dibagi semua pengunjung
demo (satu admin demo bisa menolak semua kegiatan sampai reset berikutnya);
yang terisolasi hanya data per pengguna. Demo di >1 instance butuh
`DEMO_SESSION_SECRET` yang sama, dan tiap instance tetap punya data memori
sendiri — mode demo tidak dirancang untuk skala horizontal.

---

## ADR-023 — Batas laju `/submit` ditegakkan di Postgres, bukan di Next.js

**Konteks:** `/submit` terbuka untuk tamu, dan policy `ugc_public_insert`
membuat tabelnya bisa diisi lewat PostgREST langsung dengan anon key —
melewati honeypot dan Server Action. Pembatas in-memory di Next.js tidak
berlaku lintas instance serverless (alasan yang sama dengan rate limit login
di TASKS.md Phase 2), dan tidak berlaku sama sekali untuk request langsung.

**Keputusan:** Trigger `BEFORE INSERT` `enforce_submission_rate_limit()`
(migration `20260923110001`, SECURITY DEFINER karena anon tidak bisa
membaca tabelnya): maks 3 kiriman/jam per email (dikunci
`pg_advisory_xact_lock` supaya kiriman bersamaan tidak sama-sama lolos) dan
maks 100 kiriman PENDING/jam secara global. `MemoryEventRepository` memakai
`isSubmissionRateLimited()` dengan angka yang sama.

**Konsekuensi:** Tidak ada dependency baru (Redis, dsb). Batas per email
lemah karena email bisa dikarang — yang benar-benar menahan banjir adalah
batas global, dengan harga kiriman sah ikut tertolak selama banjir
berlangsung. Batas per IP sengaja tidak dibuat: insert datang dari server
Next.js, jadi IP yang terlihat Postgres adalah IP server. Kalau banjir
berulang jadi masalah nyata, pindahkan ke rate limit di edge/hosting.
Angka di SQL dan di `SUBMISSION_RATE_LIMIT` harus diubah bersamaan.

---

## ADR-022 — Satu root proyek; logika listing & mapper dipisah dari implementasi repository

**Konteks:** Per 2026-09-23 repo berisi tiga salinan proyek bertumpuk
(`StudentFo-main/StudentFo-main/StudentFo-main`). Salinan tengah adalah versi
lama yang seluruhnya tertutup salinan terdalam — dua `package.json`, dua
`src/`, dua set migration yang berbeda isi. Di dalam kode, clamp halaman,
`sortSummaries`, dan cek "status publik" ditulis ulang di tiap implementasi
repository, dan `SupabaseEventRepository` mengulang "ambil event berdasarkan
daftar id" empat kali plus ~25 blok `new AppError(UPSTREAM_FAILURE, …)`.

**Keputusan:** (1) Salinan terdalam dinaikkan jadi satu-satunya root; salinan
lama dipindah KELUAR repo (`Downloads/StudentFo-legacy-backup`), tidak dihapus.
(2) Aturan listing bersama pindah ke `src/lib/data/listing.ts`; pemetaan baris
PostgREST pindah ke `src/lib/data/supabase-mappers.ts` (tanpa `server-only`,
jadi bisa diuji). (3) Komponen yang tadinya didefinisikan di dalam `page.tsx`
(`TeamCard`, `TrackerCard`) pindah ke `src/components/<domain>/`. (4) Pembacaan
`FormData` disatukan di `src/lib/form-data.ts`.

**Konsekuensi:** Paritas mode seed ↔ produksi kini dijaga oleh kode yang sama,
bukan oleh disiplin menyalin. Halaman hanya menyusun komponen. Tidak ada
perubahan kontrak publik selain method baru di ADR-021/ADR-020.

---

## ADR-021 — Urutan `relevance` di Supabase diperingkat atas jendela kandidat, bukan per halaman

**Konteks:** Skor rekomendasi (§6) dihitung di aplikasi. `SupabaseEventRepository`
sebelumnya mengambil 12 baris terbaru lalu memeringkat ulang 12 baris itu saja
— jadi "paling relevan" berarti "12 terbaru yang diacak ulang", dan tanpa
profil sama sekali tidak ada skor cold-start (beda dengan mode seed).

**Keputusan:** Untuk `sort=relevance`, ambil sampai `RELEVANCE_CANDIDATE_WINDOW`
(240) kandidat terbaru yang lolos filter, peringkat semuanya dengan
`sortSummaries()` yang sama dengan mode seed, lalu potong halaman. Halaman di
luar jendela jatuh ke urutan terbaru. `total` tetap dari `count: 'exact'`.

**Konsekuensi:** 20 halaman pertama konsisten antara seed dan produksi. Harga:
satu query menarik ≤240 baris ringkas per request halaman relevansi. Kalau
katalog aktif jauh melampaui itu dan halaman dalam mulai dipakai, pindahkan
skor ke SQL (atau ke Meilisearch, §2 blueprint) — bukan menaikkan jendela.
Diukur di ADR-035: 159 ms pada 50.000 event — belum perlu dipindah.

---

## ADR-020 — Audit hak akses database: default privileges Supabase dianggap musuh

**Konteks:** Audit 2026-09-23 menemukan dua kebocoran yang lolos review
sebelumnya karena pola yang sama: migration mencabut hak dari `PUBLIC`,
padahal Supabase memberi hak **langsung** ke `anon`/`authenticated` untuk
setiap tabel, view, dan fungsi baru. Akibatnya `team_member_profiles` terbaca
tamu (bertentangan dengan ADR-018) dan `expire_past_events()` bisa dipanggil
dari browser. Audit yang sama menemukan: siapa pun bisa menyisipkan dirinya
sebagai `role='leader'` di tim orang lain, batas anggota tim hanya dijaga
aplikasi (dan bocor saat balapan), pemilik notifikasi bisa menulis ulang
`message`-nya, event PENDING bisa disimpan/dibuatkan tim, dan
`ugc_submissions` — terbuka untuk anon — tidak punya batas ukuran.

**Keputusan:** Migration `20260923100001_security_hardening.sql` menutup
semuanya: `REVOKE … FROM anon, authenticated` eksplisit, policy `team_members`
dengan syarat peran, trigger `enforce_team_capacity()` yang mengunci baris
tim, hak kolom untuk `notifications` dan `ugc_submissions`, policy saved/
tracker/teams yang mensyaratkan event terlihat, dan CHECK ukuran. Persetujuan
kiriman komunitas lewat RPC atomik `approve_submission()` (service_role saja).
Aturan "REVOKE dari role, bukan dari PUBLIC" masuk `AGENTS.md` §15.

**Konsekuensi:** Kapasitas tim kini benar di bawah konkurensi. Migration ini
**belum pernah di-apply** ke project mana pun dan tidak bisa diuji di mesin
tanpa Postgres — jalankan dulu di Supabase lokal/staging, lalu
`npm run db:verify`, sebelum produksi.

---

## ADR-019 — Umpan balik Server Action lewat kode tertutup, termasuk di luar alur akun

**Konteks:** ADR-012 menetapkan "kode di URL, bukan teks" untuk alur akun.
Aksi tim (Phase 3) tidak mengikutinya: `/teams?error=<pesan>` dirender apa
adanya, sehingga siapa pun bisa membuat tautan yang menampilkan kalimat
karangan sebagai peringatan resmi di domain kita. Aksi tracker juga
menempelkan `?error=` ke path yang mungkin sudah punya query string.

**Keputusan:** `src/lib/action-feedback.ts` — daftar tertutup
`ACTION_ERROR_CODES`/`ACTION_NOTICE_CODES`, `actionError(code)` yang membawa
kode sebagai `AppError.reason`, `toActionErrorCode()` yang mengubah error apa
pun jadi kode aman (tanpa reason dikenal → `unknown`, detail ke log), dan
`withQuery()` untuk menggabungkan query dengan benar. `<ActionFeedback>`
merender kode di halaman. Repository melempar `actionError(...)` untuk
penolakan yang memang untuk dibaca pengguna.

**Konsekuensi:** Pola yang sama di seluruh aplikasi; teks bebas di URL tidak
pernah tampil. Menambah pesan baru = menambah kode di daftar, bukan menulis
string di action.

---

## ADR-018 — View `team_member_profiles` sengaja `security_invoker = off`

**Konteks:** Fitur cari rekan tim (Phase 3) harus menampilkan nama anggota.
Tapi policy `users_select_own` (migration 0003) membatasi SELECT di tabel
`users` ke baris sendiri, sehingga anggota tim tidak bisa melihat nama satu
sama lain dan daftar anggota hanya berisi UUID. Tabel `users` memuat email,
jenjang, dan jurusan, jadi policy itu tidak boleh dilonggarkan.

**Keputusan:** Migration `20260914100002_team_member_profiles.sql` membuat
view `public.team_member_profiles` dengan `security_invoker` dibiarkan di
nilai bawaannya (`off`), sehingga view berjalan dengan hak pemiliknya dan
bisa menembus `users_select_own`. Pembatasnya dipindah ke **bentuk view**:
kolomnya dipatok pada `team_id`, `user_id`, `role`, `joined_at`, dan
`full_name` saja — tanpa email, jenjang, jurusan, atau `role` sistem. Hak
SELECT diberikan ke `authenticated` saja, `anon` dicabut.

Ini kebalikan sadar dari `events_listing` (ADR tidak terpisah; lihat
migration 0004) yang justru menyalakan `security_invoker = on`.

**Konsekuensi:** Nama tampilan setiap orang yang bergabung ke sebuah tim
menjadi terlihat oleh seluruh pengguna yang masuk. Itu diterima karena
bergabung ke tim publik memang tindakan publik — justru itu gunanya fitur
ini. Risiko yang dipikul: **menambah satu kolom saja ke view ini langsung
membukanya ke semua pengguna yang masuk**, tanpa perubahan policy apa pun
yang terlihat di migration lain. Karena itu view-nya diberi `COMMENT` yang
menyatakan larangan itu di database, bukan hanya di berkas migration.

---

## ADR-017 — Produsen notifikasi tenggat berjalan di Postgres, bukan di Node

**Konteks:** Tabel `notifications` dan policy-nya ada sejak migration 0001
dan 0003, tapi tidak pernah ada yang mengisinya. Kandidat notifikasi adalah
hasil join `saved_events` + `application_tracker` + `event_deadlines` untuk
**seluruh** pengguna, disaring ke yang tenggatnya jatuh di H-3 atau H-1.

**Keputusan:** Produsennya ditulis sebagai fungsi Postgres
`public.create_deadline_notifications()` (`SECURITY DEFINER`,
`SET search_path = public, pg_temp`), dipanggil harian oleh GitHub Actions
lewat RPC dengan `service_role`. Idempotensi dijamin partial unique index
`idx_notifications_dedupe (user_id, event_id, type) WHERE event_id IS NOT NULL`,
bukan oleh kedisiplinan penjadwal.

Ambang H-3/H-1 sengaja **diduplikasi** di `src/lib/notifications.ts`, karena
`MemoryEventRepository` (mode seed) tidak punya database untuk menjalankan
fungsi itu dan menurunkan notifikasinya secara on-the-fly.

**Konsekuensi:** Menjalankan ulang workflow aman dan tidak menghasilkan
pesan dobel. Harga yang dibayar: satu aturan hidup di dua tempat. Keduanya
diberi komentar silang yang menyebut berkas pasangannya, tapi tetap ada
risiko nyata keduanya lepas sinkron — kalau ambangnya berubah, ia wajib
diubah di kedua sisi dalam PR yang sama.

Pilihan H-3 dan H-1 (bukan hitung mundur harian) adalah keputusan produk:
notifikasi harian untuk belasan kegiatan tersimpan membuat lonceng selalu
penuh dan berhenti dibuka. H-0 sengaja tidak ada — peringatan yang tiba saat
sudah tidak bisa ditindaklanjuti bukan bantuan.

---

## ADR-016 — Palet diselaraskan ke kanvas desain: Indigo #4F46E5 di atas cream (menggantikan ADR-005)

**Konteks:** ADR-005 memilih Cobalt `#2B50EC` di atas netral ber-tint biru,
dengan alasan menghindari palet "Indigo di atas Zinc" yang jadi bawaan
setiap dashboard hasil generate. Sejak itu, sistem desain produk ini
dikerjakan di kanvas desain terpisah (Claude Design) dan menjadi sumber
kebenaran visual yang ditinjau manusia.

**Keputusan:** Nilai token di `globals.css` diselaraskan ke kanvas tersebut:
accent Indigo `#4F46E5`, dasar cream `#FAF8F4`, ink `#2A2A32`, netral hangat
(`#DDDAD1`/`#C4C0B5`), amber `#F4A340` untuk urgensi, emerald `#2E9E77`
untuk sukses, dan merah yang sengaja didesaturasi (`#E15353`). **Nama**
token tidak berubah sama sekali, jadi jembatan ke Tailwind di §2
`globals.css` dan seluruh markup yang sudah ada ikut berubah tanpa disentuh.

Kekhawatiran inti ADR-005 tetap dijawab, tapi oleh netralnya, bukan oleh
hue accent-nya: netral hangat + accent dingin memberi kontras suhu, sesuatu
yang tidak dimiliki kombinasi "Indigo di atas Zinc" yang dihindari ADR-005.

**Konsekuensi:** ADR-005 **digantikan** — jangan dipakai sebagai rujukan
palet lagi. Dark mode ikut diturunkan dari sistem yang sama dan netralnya
tetap hangat (`#1C1C22`/`#2A2A32`), bukan biru kehitaman: netral dingin di
dark mode membuat accent indigo terbaca ungu-kebiruan yang berbeda dari
light mode. Angka kontras di komentar `globals.css` diukur ulang untuk
nilai baru; `--color-text-placeholder` naik ke `#767165` karena
`#9C978B` (neutral-400) tidak lolos 4.5:1 sebagai teks dan kini dibatasi
untuk ikon dan garis saja.

---

## ADR-015 — Penyelarasan Rekomendasi Personal pada `EventQuery` dan RPC `get_distinct_organizer_count`

**Konteks:** Blueprint §6 menetapkan rumus skoring rekomendasi terpersonalisasi,
namun `EventQuery` belum menerima profil pengguna, dan `organizerCount` di
`SupabaseEventRepository.getStats()` mengembalikan 0 karena PostgREST tidak mendukung
`COUNT(DISTINCT column)` langsung tanpa RPC.

**Keputusan:**
1. Menambahkan field `profile?: UserProfile | null` ke dalam `EventQuery`.
2. Pada `MemoryEventRepository` dan `SupabaseEventRepository`, pengurutan `relevance`
   memanfaatkan fungsi `rankEvents()` saat `query.profile` ada.
3. Migration `20260913110001_stats_and_saved_events.sql` membuat RPC
   `public.get_distinct_organizer_count()` dengan `SECURITY DEFINER` dan `search_path`
   aman untuk menghitung penyelenggara aktif unik secara akurat.

**Konsekuensi:** Pengguna yang telah mengisi profil (jenjang dan minat) kini
mendapatkan urutan kegiatan yang benar-benar dipersonalisasi di beranda dan halaman
jelajah tanpa soft-fail jika profil belum lengkap (otomatis jatuh ke cold-start).
Statistik penyelenggara kini konsisten antara mode seed dan Supabase nyata.

---

## ADR-014 — Kontrak Saved Events & Tracker di Lapisan `EventRepository` dengan Zero Client JS

**Konteks:** Fitur simpan kegiatan dan papan tracker lamaran (`application_tracker`)
telah memiliki skema dan trigger di PostgreSQL (`saved_events` dan `sync_saved_count`),
namun belum terhubung ke antarmuka aplikasi.

**Keputusan:**
1. Menambahkan method penyimpanan kegiatan (`saveEvent`, `unsaveEvent`, `isEventSaved`,
   `listSavedEvents`) dan tracker (`listTrackerItems`, `upsertTrackerItem`,
   `removeTrackerItem`) langsung pada antarmuka `EventRepository`.
2. Mengimplementasikan method tersebut secara penuh di `MemoryEventRepository`
   (mode seed in-process) dan `SupabaseEventRepository` (mode produksi PostgREST),
   sehingga alur pengujian dan pengembangan lokal tetap berjalan tanpa database.
3. Seluruh interaksi UI simpan dan ubah tahapan lamaran di `/tracker` berbasis
   Server Action (`src/app/tracker/actions.ts`) dengan `<form>` dan pengalihan aman
   (`safeNextPath`), mempertahankan batasan tanpa JavaScript di sisi klien.

**Konsekuensi:** Halaman `/tracker` kini aktif sepenuhnya menjadi papan kanban lamaran
fungsional; pengguna dapat menyimpan peluang dan memperbarui tahapan seleksinya.
Tidak ada ketergantungan JavaScript di browser; semua state persisten di backend.

---

## ADR-013 — Hak kolom `users` diperbaiki: `REVOKE UPDATE (role)` tidak pernah bekerja

**Konteks:** Migration 0003 mengunci kolom `role` dengan
`REVOKE UPDATE (role) ON users FROM authenticated, anon;` (didokumentasikan
di `DEVIATIONS.md` #3 sebagai penutup celah privilege escalation). Saat
sistem akun dibangun, pernyataan itu diperiksa ulang — dan ternyata tidak
berefek.

Di PostgreSQL, hak level **kolom** tidak bisa mengurangi hak level **tabel**.
Supabase memberi role `authenticated` hak `UPDATE` se-tabel pada seluruh
schema `public` secara default. Selama hak itu ada, `REVOKE UPDATE (role)`
hanya menghasilkan `WARNING`, bukan error — sehingga migration-nya terlihat
sukses sementara kolomnya tetap bisa ditulis.

**Dampaknya kalau dibiarkan:** setiap pemilik akun bisa mengirim satu PATCH
PostgREST ke barisnya sendiri (diizinkan policy `users_update_own`) dengan
body `{"role":"ADMIN"}`, lalu lolos policy `events_admin_all` dan bisa
menyetujui, mengubah, atau menghapus event apa pun. Celah ini tidak bisa
dipakai selama tabel `users` kosong — ia menjadi nyata persis pada hari
pendaftaran dibuka.

**Keputusan:** migration `20260913100001_account_hardening.sql` mencabut hak
UPDATE se-tabel lebih dulu, lalu memberikan kembali hanya
`full_name, education_level, major, interests`. `role`, `id`, `email`,
`created_at`, dan `updated_at` tidak ada di daftar.

**Konsekuensi:** promosi admin kini benar-benar hanya lewat service_role /
SQL editor. Pelajaran yang berlaku untuk seterusnya dan sudah masuk
`AGENTS.md`: **RLS membatasi baris, hak kolom membatasi kolom, dan hak
kolom baru berlaku setelah hak tabelnya dicabut.** Untuk setiap tabel baru
dengan kolom sensitif, pola cabut-lalu-berikan ini yang dipakai.

---

## ADR-012 — Alur akun tanpa JavaScript klien, hasil dioper sebagai kode di URL

**Konteks:** Pola idiomatik Next.js untuk form Server Action adalah
`useActionState` di Client Component. Tapi seluruh produk ini — filter,
paginasi, moderasi admin — sengaja dibangun agar berfungsi tanpa JavaScript.

**Keputusan:** form akun memakai `<form action={serverAction}>` biasa,
mengembalikan `void`, dan melaporkan hasil lewat `redirect()` dengan
`?error=`/`?notice=` yang berisi **kode dari daftar tertutup**
(`src/lib/auth-messages.ts`), bukan teks pesannya.

**Konsekuensi:** halaman masuk/daftar bekerja penuh di jaringan kampus yang
memblokir skrip dan di ponsel lawas; setiap keadaan form punya URL sendiri
yang bisa diuji langsung dengan `curl`. Dua harga yang dibayar sadar:
(a) nilai isian selain email tidak dipertahankan setelah gagal — kata sandi
memang tidak boleh dikembalikan lewat URL; (b) error per-field tidak
ditampilkan, hanya satu pesan ringkas di atas form, sehingga syarat
pengisian ditulis di depan (`hint` pada `<Field>`) alih-alih baru muncul
setelah gagal. Alasan kode-bukan-teks: kalau teks pesan yang dioper lewat
URL, siapa pun bisa membuat halaman kita menampilkan kalimat karangan
("Akun diblokir, hubungi wa.me/…") lengkap dengan domain kita sebagai
penjamin.

---

## ADR-011 — Satu pesan yang sama untuk "sandi salah" dan "email tidak terdaftar"

**Konteks:** Pesan error yang spesifik lebih ramah. Tapi halaman masuk,
daftar, dan lupa-sandi adalah tempat paling klasik untuk memanen daftar
alamat email yang benar-benar punya akun.

**Keputusan:** `invalid_credentials` dipakai untuk kredensial salah, email
tidak ditemukan, **dan** email yang formatnya tidak valid. `signUpAction`
sengaja tidak bercabang meski Supabase menandai email duplikat lewat
`identities: []`. `requestPasswordResetAction` selalu menjawab sama,
kecuali untuk pembatasan laju — informasi itu soal perilaku kita, bukan
soal keberadaan akun.

**Konsekuensi:** pengguna yang salah ketik email tidak diberi tahu bahwa
akunnya tidak ada, dan itu memang sedikit lebih membingungkan. Ditukar
dengan hilangnya oracle keanggotaan yang bisa dipakai menyusun target
credential stuffing. Ada uji khusus yang menjaga pemetaan ini tidak
diperlonggar diam-diam (`src/lib/auth-messages.test.ts`).

---

## ADR-010 — Google OAuth dialirkan lewat server, tanpa klien Supabase di browser

**Konteks:** Contoh resmi Supabase untuk OAuth umumnya memakai klien
browser (`createBrowserClient`) yang mengalihkan halaman sendiri.

**Keputusan:** `signInWithOAuth` dipanggil di Server Action dengan hasil
berupa URL consent, lalu `redirect()` yang mengalihkan. Code verifier PKCE
ditulis ke cookie oleh klien server — Server Action memang boleh menulis
cookie. Penukaran `code` menjadi sesi terjadi di route handler
`/auth/callback`.

**Konsekuensi:** tidak ada satu pun klien Supabase di bundle browser, jadi
tombol "Masuk dengan Google" tetap berfungsi tanpa JavaScript dan tidak ada
token yang pernah tersentuh kode klien. Trade-off: ketersediaan provider
tidak bisa dideteksi dari server, jadi tombolnya selalu tampil selama
Supabase terkonfigurasi; kalau provider belum diaktifkan di dashboard,
Supabase mengembalikan `provider_disabled` dan pesannya diarahkan ke
pengelola, bukan ke pengguna akhir. Alternatif yang ditolak: menambah env
flag `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` — satu knob konfigurasi lagi yang
bisa tidak sinkron dengan keadaan sebenarnya di dashboard.

---

## ADR-009 — Halaman Tracker terlihat sejak Phase 1 meski terkunci

**Konteks:** Backend tracker (`application_tracker`, auth user) baru aktif
di Phase 2. Opsi: sembunyikan tab tracker sampai Phase 2, atau tampilkan tab
dalam keadaan terkunci sejak awal.

**Keputusan:** Tab tracker tampil sejak Phase 1 (`src/app/tracker/page.tsx`),
dengan CTA "Masuk untuk mulai melacak" yang di-`disabled` dan tanpa data
karangan/kanban palsu.

**Konsekuensi:** Menyembunyikan-lalu-memunculkan menu antar rilis memaksa
pengguna mempelajari ulang navigasi. Halaman menunjukkan nilai fitur lebih
dulu, baru meminta pendaftaran. Batasan tegas: **tidak boleh** ada UI yang
terlihat berfungsi tapi sebenarnya mati (mis. papan kanban dengan data
contoh) — itu cara tercepat kehilangan kepercayaan pengguna.

---

## ADR-008 — Dasbor admin ditulis lengkap sebelum Phase 2 (auth) aktif

**Konteks:** Blueprint §8 kontradiktif: dasbor moderasi diminta di Phase 1,
tapi `users.role` (satu-satunya sumber "siapa admin") baru aktif di Phase 2.

**Keputusan:** `checkAdminAccess()` (`src/lib/auth.ts`) ditulis benar sejak
awal — cek sesi Supabase lalu `users.role === 'ADMIN'`. Di `dataMode==='seed'`
(tanpa backend), gerbang mengembalikan `{allowed:true, reason:'demo'}` dan
halaman menampilkan banner pratinjau eksplisit.

**Konsekuensi:** Begitu Supabase terpasang, gerbang langsung berlaku penuh —
tidak ada langkah "pasang autentikasi nanti" yang bisa lupa dikerjakan.
Trade-off: di mode demo, siapa pun yang membuka `/admin` bisa menekan
approve/reject, tapi perubahannya hanya bertahan selama proses hidup
(in-memory) dan ditandai jelas sebagai pratinjau.

---

## ADR-007 — Error tak dikenal selalu dilaporkan sebagai `INTERNAL` generik

**Konteks:** Blueprint §9 meminta response error terstruktur
`{error, code}`. Pertanyaannya: seberapa detail pesan yang boleh sampai ke
klien.

**Keputusan:** `toApiError()` (`src/lib/errors.ts`) hanya meneruskan pesan
asli untuk `AppError` yang sudah ditulis manusia. Error lain (exception
driver, error Postgres mentah) selalu menjadi pesan generik
"Terjadi kesalahan di sisi kami..." dengan `code: INTERNAL`; detail asli
hanya masuk `console.error`.

**Konsekuensi:** Pesan error Postgres/driver bisa membocorkan nama tabel,
kolom, dan bentuk query — itu informasi yang berguna untuk penyerang, bukan
untuk pengguna. Trade-off: debugging production butuh akses log server,
tidak bisa dari respons klien saja.

---

## ADR-006 — Repository pattern dengan seed/production toggle otomatis

**Konteks:** Kontributor baru harus bisa mulai kerja tanpa menyiapkan
Supabase. Sekaligus, kode produksi harus memakai Postgres+RLS sungguhan
tanpa dua basis kode paralel yang mudah divergen.

**Keputusan:** Satu interface `EventRepository`, dua implementasi
(`MemoryEventRepository`, `SupabaseEventRepository`), dipilih otomatis oleh
`dataMode` yang dihitung dari kelengkapan env Supabase
(`src/lib/env.ts` + `src/lib/data/index.ts`). Half-configured (hanya URL
tanpa anon key, atau sebaliknya) sengaja dianggap `'seed'`, **bukan** dicoba
dijalankan sebagai `'supabase'`.

**Konsekuensi:** `npm install && npm run dev` selalu jalan. Migrasi mesin
pencari (Postgres FTS → Meilisearch, rencana §2 blueprint) = satu
implementasi baru, nol perubahan komponen. Trade-off yang diterima: dua
implementasi harus dijaga tetap setara secara perilaku (sort, filter,
pagination) — didisiplinkan lewat kontrak `EventRepository` yang sama dan
test yang menguji logika murni terpisah dari I/O.

---

## ADR-005 — Palet warna: Cobalt #2B50EC + light mode, bukan Indigo di atas Zinc-950

> **DIGANTIKAN OLEH ADR-016.** Nilai hue di entri ini sudah tidak berlaku —
> palet sekarang mengikuti kanvas desain (Indigo `#4F46E5` di atas cream).
> Entri ini disimpan untuk merekam alasan di balik pilihan sebelumnya;
> jangan dipakai sebagai rujukan warna.

**Konteks:** Blueprint §4 tidak menetapkan hue spesifik, hanya struktur token
(`--color-accent`, `--color-deadline-*`, dst) dan larangan (tanpa gradasi
neon/ilustrasi 3D, transisi 150–200ms).

**Keputusan:** Accent diarahkan ke keluarga biru (Cobalt), light mode
ditambahkan sebagai mode utama (bukan dark-only). Nama token dan struktur
skala dipertahankan identik dengan blueprint.

**Konsekuensi:** Indigo-600 di atas Zinc-950 adalah tampilan default de-facto
dashboard hasil generate AI — menghindarinya adalah keputusan diferensiasi
sekaligus keputusan pemakaian nyata (produk dibaca siang hari di ruang
terang). Accent sengaja **tidak** memakai hue hijau/kuning/merah karena hue
itu sudah dipesan oleh warna semantik dan warna status deadline — kalau
accent ikut ke situ, pengguna tidak bisa lagi membedakan "tombol" dari
"peringatan". Lihat `DEVIATIONS.md` #13 untuk detail penuh.

---

## ADR-004 — Kontrak error terstruktur (`AppError` + `ERROR_CODES`)

**Konteks:** Blueprint §9 meminta bentuk error `{error, code}` tapi tidak
menetapkan bagaimana ia mengalir dari lapisan data ke UI.

**Keputusan:** Kelas `AppError` (dengan `httpStatus` dan `code`) dilempar di
titik kegagalan (repository, action), ditangkap dan diserialisasi di
boundary lewat `toApiError()`. Helper factory (`notFound()`,
`validationFailed()`, dst) untuk kasus umum.

**Konsekuensi:** Satu bentuk error konsisten di seluruh aplikasi, dan satu
titik kontrol untuk aturan "jangan bocorkan detail teknis" (lihat ADR-007).

---

## ADR-003 — Deadline dihitung ulang server-side tiap request, bukan cache/statis

**Konteks:** Blueprint §5.1 mewajibkan "dihitung ulang client-side tiap
render, bukan cache statis" — tapi mengirim JS ke klien untuk ini punya
biaya (bundle size, risiko jam perangkat pengguna salah).

**Keputusan:** `DeadlineTag`/`DeadlineRing` tetap Server Component;
halaman yang memakainya dipaksa `export const dynamic = 'force-dynamic'`
sehingga nilai dihitung ulang **setiap request** di server.

**Konsekuensi:** Maksud aturan blueprint (larangan H-n yang membeku di
build output) terpenuhi tanpa mengirim JavaScript tambahan ke browser dan
tanpa risiko client clock skew. Trade-off: halaman-halaman ini tidak bisa
memakai static generation/ISR. Lihat `DEVIATIONS.md` #16.

---

## ADR-002 — Validasi environment terpusat via Zod, bukan `process.env.X!` di titik pakai

**Konteks:** Variabel env salah ketik biasanya baru terlihat sebagai error
jaringan aneh saat runtime production, jauh dari sumber masalah.

**Keputusan:** Semua env divalidasi sekali di `src/lib/env.ts` dengan Zod
schema; seluruh kunci Supabase `.optional()` secara sengaja (lihat ADR-006).

**Konsekuensi:** Kesalahan konfigurasi terdeteksi di satu tempat dengan
pesan yang menyebut nama variabelnya, saat startup — bukan saat query
pertama gagal.

---

## ADR-001 — Slug sebagai URL kanonik event, bukan UUID

**Konteks:** Produk agregator hidup dari organic search. `/events/<uuid>`
praktis tidak bisa di-rank dan tidak enak dibagikan.

**Keputusan:** Kolom `slug` (`events.slug`, UNIQUE) dibuat otomatis dari
title lewat trigger `events_fill_derived()`, tabrakan diselesaikan dengan
suffix numerik (bukan UUID penuh, supaya URL tetap enak dibaca).

**Konsekuensi:** Detail: lihat `DEVIATIONS.md` #17 (kolom tambahan di
`events`). Trade-off kecil: judul yang sangat mirip antar penyelenggara
berbeda menghasilkan slug `-1`, `-2`, dst — dianggap dapat diterima
dibanding UUID di URL.

---

## Cara menambah entri baru

1. Nomor urut naik (`ADR-0NN`), taruh paling atas.
2. Judul singkat = keputusan itu sendiri, bukan masalahnya.
3. Tiga bagian wajib: **Konteks** (kenapa keputusan ini perlu dibuat),
   **Keputusan** (apa yang dilakukan), **Konsekuensi** (trade-off yang
   diterima sadar — termasuk yang negatif).
4. Kalau keputusan menyentuh skema database/RLS/keamanan, pertimbangkan
   apakah lebih cocok masuk `supabase/DEVIATIONS.md` (untuk penyimpangan
   dari blueprint v3) atau di sini (untuk keputusan yang tidak
   membandingkan ke dokumen blueprint manapun).
