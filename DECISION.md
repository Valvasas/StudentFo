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

## ADR-053 — Beranda pribadi, ilustrasi sketsa, progres navigasi; pengerasan cookie & verifikasi ulang

**Konteks:** Audit penyelesaian sebelum hosting (`docs/audit-fitur-enterprise.md`).
Uji demo 600 halaman bersih secara teknis, tetapi: (1) `/` adalah halaman
pemasaran untuk SEMUA orang — pengguna yang sudah masuk disambut "Buat akun dalam
satu menit", dan `DeadlineWeek`/`DeadlineTicker` sudah menjadi kode mati sejak
ADR-039; (2) tanpa `loading.tsx` (sengaja, soft-404 & no-JS) klik tautan tidak
memberi tanda apa pun selama 0,3–1 detik; (3) 404/error/kosong berupa ikon
generik. Audit keamanan menemukan cookie sesi Supabase terbaca JavaScript,
verifikasi ulang sandi tanpa batas laju, dan seed demo tanpa batas.

**Keputusan:**
- **`/` bercabang menurut sesi**: tamu → halaman pemasaran (tidak berubah);
  pengguna masuk → `PersonalHome`. Isinya hanya menyusun aturan yang sudah ada:
  "Perlu tindakan" = `needsActionSoon` atas baris tracker + simpanan (didedup),
  "Sesuai minatmu" = `listEvents({ sort: 'relevance', profile })` tanpa yang
  sudah disimpan/dilacak, "Minggu ini" = `getDeadlineWeek()`. Tidak ada method
  repository baru. Teks alasan urutan mengikuti rumus `recommendation.ts` apa
  adanya (cold start ≠ "paling banyak disimpan"). Sesi gagal dibaca → tamu
  (`withFallback`, pola navbar). Pintasan peran (moderasi/studio) = tombol utama.
  Statistik tracker disembunyikan bila semuanya nol; label "Menunggu kabar"
  sengaja berbeda dari kolom "Sudah Daftar" papan supaya angka tidak bertentangan.
- **Bilah progres navigasi** (`NavigationProgress`, klien) sebagai pengganti
  kerangka: mulai pada klik tautan internal (fase capture — `<Link>` memanggil
  `preventDefault` sebelum event mencapai document) & kirim form GET, selesai
  saat path/query berubah, muncul hanya bila > 120 ms, menyerah setelah 15 dtk.
  Animasi (bukan transisi), patuh reduced-motion. HTML awal, status HTTP, dan
  perilaku tanpa JS tidak berubah — keputusan soft-404 tetap utuh.
- **Ilustrasi** (`components/ui/illustrations.tsx`): tinta `currentColor` +
  token permukaan + satu aksen stabilo, tanpa teks di SVG, `aria-hidden`. Satu
  per layar, hanya di titik berhenti (404, error, kosong, tracker tamu, "aman")
  + coretan hero ≥ xl + logomark. `global-error.tsx` sengaja tidak memakainya
  (tanpa impor proyek, ADR-047).
- **Cookie sesi Supabase `httpOnly`** (+ `Secure` di produksi) lewat
  `supabaseCookieOptions()` di server & middleware. Bawaan pustaka `false` hanya
  berguna untuk klien browser yang memang tidak ada (ADR-010). Menambah klien
  browser kelak = keputusan ini ditinjau dulu.
- **Verifikasi ulang sandi** dibatasi ember masuk per IP+email DAN ember per akun
  (`reauthPerAccount`). Ember per akun aman di sini karena hanya pemegang sesi
  akun itu yang bisa mengisinya (beda dengan batas per-email di halaman masuk).
- **Seed demo dibatasi per identitas** (`DEMO_SEEDED_USER_LIMIT`), bukan rate
  limit per IP: Next.js mengisi `x-forwarded-for` dengan alamat soket, jadi di
  `next start` lokal seluruh suite e2e berbagi satu IP.

**Ditolak:** `noindex` untuk `/tracker`/`/connections` — tamu hanya melihat
halaman penjelas fitur yang memang ingin diindeks; data pribadi tidak pernah
dirender untuk crawler. Skeleton per halaman — butuh Suspense/`loading.tsx`
yang dilarang (lihat `src/app/events/page.tsx`).

**Konsekuensi:** Beranda pengguna masuk = 6 query paralel (semuanya sudah
dipakai halaman lain, sebagian ter-cache). Bilah progres menambah ±1 KB JS di
setiap halaman. Lewat batas seed, persona demo tetap bisa masuk tetapi tanpa
data awal — tercatat di sini supaya tidak dikira bug.

---

## ADR-052 — Bahasa visual "buku sketsa": tipografi santai, kontrol sekunder dilipat, layar ponsel untuk isi

**Konteks:** Umpan balik pemilik setelah modul 0–7: tampilan "terasa buatan
AI" (grotesk netral + mono di mana-mana, abu-abu dingin, semua kontrol
tampil sekaligus), kurang ruang napas, dan di ponsel dinding filter
(`/events` ±2 layar, Magang 12 kotak centang, Lomba 13 chip) mendorong
kartu pertama jauh ke bawah. Kartu kegiatan menumpuk jenis + promosi +
lencana + simpan di satu baris sempit (terbaca sebagai badge bertabrakan),
dan di Beasiswa 320px lencana kelayakan melebarkan kolom otomatis sampai
judul menimpa tombol simpan.

**Keputusan:**
- Tipografi: Plus Jakarta Sans (teks), Bricolage Grotesque (judul,
  `font-display`), Caveat (`hand` — catatan pinggir), lewat `next/font`
  (di-host sendiri; CSP `font-src 'self'` tetap). Mono hanya untuk angka/kode.
- Palet kertas hangat (`#faf8f3`, tinta `#1d1b17`) + satu aksen stabilo
  `--color-highlight` (#ffd95a; gelap #b8901d). Stabilo hanya HIASAN
  (`.marker`, `Scribble`, titik hitungan filter) — tidak pernah satu-satunya
  pembawa makna, jadi tidak ikut pasangan kontras teks.
- Coretan (`SketchArrow`, `Scribble`, `HandNote`) SVG `currentColor`,
  `aria-hidden`, dipakai hemat: maksimal satu per layar penting.
- Kontrol sekunder dilipat ke `<details>` tanpa JS: "Saring"/"Urutkan" di
  `/events` (chip filter aktif + "N kegiatan ditemukan" tetap terlihat),
  `CollapsibleFilters` di papan (terbuka di ≥ md/lg). `CollapsibleFilters`
  merender isinya DUA kali (satu di `<details>` ponsel, satu di sidebar
  desktop) — `<details>` tidak bisa "selalu terbuka di desktop" tanpa JS,
  dan salinan yang `display:none` tidak masuk pohon aksesibilitas maupun
  urutan tab. Biayanya: HTML tautan filter ganda.
- Kolom opsional `/submit` dilipat ke "Detail tambahan". Kolom tautan di
  dalamnya bukan `type="url"`: validasi bawaan Chromium pada kontrol di
  `<details>` tertutup memblokir kirim tanpa pesan ("not focusable") —
  terbukti lewat uji manual. Server (Zod) yang memvalidasi, dan lipatan
  terbuka otomatis bila `?fields=` menyebut salah satu kolomnya.
- Menu akun bisa dilipat jadi rel ikon 56px: `<form>` + Server Action yang
  membalik cookie `sf_sidebar` (httpOnly, 1 tahun) lalu redirect ke
  `returnTo` (disaring `safeNextPath`). Dirender server sejak awal — tanpa
  kedip, tanpa JS. Bukan `localStorage`: server tidak bisa membacanya.
- Kartu kegiatan: baris atas hanya jenis (+ promosi ringkas) vs simpan;
  lencana penyelenggara pindah ke baris penyelenggara; harga & tenggat di
  kaki kartu.
- Di ponsel: remah roti listing disembunyikan, banner demo dipersingkat,
  pratinjau beranda 4:3 (16:7 selebar 350px memotong kartunya), bagikan &
  "Siapkan berkas" di detail diberi baris sendiri (panel samping tersembunyi
  < 960px dan sebelumnya tak terjangkau dari ponsel).

**Konsekuensi:** Tiga font = ±60 KB woff2 tambahan (swap, subset latin).
Filter terlipat butuh satu ketukan ekstra untuk menyaring — diimbangi chip
aktif yang selalu terlihat dan bisa dihapus satu-satu. Uji e2e yang
mengklik filter/kolom opsional sekarang membuka lipatannya dulu.
`scripts/crawl-links.mjs` ditambahkan untuk mengaudit alur navigasi
(tamu + 4 persona) setelah perubahan tata letak besar.

---

## ADR-051 — Pengingat ke kanal luar: antrean klaim + sewa + ack (at-least-once), bukan "tandai saat dibaca"

**Konteks:** Pengingat H-3/H-1 sudah dibuat `create_deadline_notifications()`
untuk lonceng in-app (ADR-017). Brief meminta endpoint ber-`CRON_SECRET` yang
mengembalikan pengingat "yang belum terkirim" untuk bot WhatsApp/Telegram atau
penyedia email.

**Keputusan:** Migration `20261003100003`: kolom `notifications.dispatch_claimed_at`
dan `dispatched_at` + index parsial antrean. `claim_notification_dispatch(limit, lease)`
(DEFINER, service_role saja) mengunci baris dengan `FOR UPDATE SKIP LOCKED`,
menyewakannya 15 menit, dan melewati pengingat basi (kegiatan sudah tutup /
tidak lagi APPROVED). `ack_notification_dispatch(ids)` menandai terkirim, hanya
untuk baris yang memang sedang diklaim. Route: `POST /api/cron/dispatch-deadline-notifications`
dan `…/ack`, `Authorization: Bearer` dibandingkan waktu-konstan, gagal tertutup
bila `CRON_SECRET` kosong. GET → 405. Mode seed punya cermin in-memory.

**Konsekuensi:** Bot yang crash di tengah batch tidak menghilangkan pengingat —
sewa habis, baris dibagikan lagi. Harganya pesan dobel bila bot mengirim lalu
gagal ack; itu disengaja (pengingat tenggat yang HILANG adalah kegagalan paling
merugikan produk ini). **Yang BELUM ada dan memblokir pengiriman sungguhan:**
(1) preferensi & persetujuan kanal per pengguna (backlog ADR-039 "Preferensi
notifikasi") — payload memuat email, tapi mengirim email/WA tanpa opt-in
melanggar kebijakan privasi kita sendiri; (2) nomor WA / chat id Telegram —
tidak ada kolomnya. Endpoint ini menyiapkan antrean, bukan izin untuk mengirim.
Kenapa bukan Vercel Cron (GET): klaim adalah mutasi; GET yang diulang proxy atau
pemindai tautan akan "menghabiskan" pengingat tanpa pernah dikirim.

---

## ADR-050 — Skor relevansi pindah ke SQL (`list_personalized_events`), menggantikan jendela kandidat ADR-021

**Konteks:** ADR-021 memeringkat ≤240 kandidat terbaru di Node; halaman 21+
diam-diam jatuh ke urutan "terbaru", dan kegiatan relevan yang lebih tua dari
240 kegiatan terakhir tidak pernah bisa muncul. ADR-035 memutuskan menunda
pemindahan ke SQL karena belum diukur sebanding. Brief meminta RPC dengan bobot
0.5/0.3/0.2 — itu rumus blueprint yang SUDAH direvisi ADR-026; memakainya di SQL
sementara mode seed memakai 0.45/0.25/0.15/0.15 membuat urutan demo dan
produksi berbeda tanpa ada yang tahu.

**Keputusan:** Migration `20261003100002`: `list_personalized_events(p_interests,
p_education, p_limit, p_offset, …filter, p_cost, p_include_closed, p_promoted)`,
SECURITY INVOKER (RLS publik tetap penjaga), `SET jit = off`. Rumus = `rankEvents()`
APA ADANYA, personal DAN cold start (cold start butuh popularitas relatif ke
kandidat hasil filter = `max() OVER ()`). Skor dihitung di baris sempit dari
`events`, diurutkan, dipotong, baru di-join `events_listing` untuk ≤48 baris
halaman; `count(*) OVER ()` memberi total dalam satu panggilan.
`SupabaseEventRepository` memakai RPC untuk SEMUA `sort=relevance`; profil cold
start dinormalisasi kosong supaya tamu berbagi entri cache. Profil personal kini
masuk kunci Data Cache (hanya minat terurut + jenjang, tanpa identitas).
`RELEVANCE_CANDIDATE_WINDOW` dihapus.

**Pengukuran** (mesin yang sama, PG16 + PostgREST lokal, median 5×, tanpa cache,
`BENCH_SIZES=5000,20000,50000`):

| Event | lama: jendela 240 | RPC hal. 1 | RPC hal. 20 | cold start | relevansi+filter lama → RPC |
|---|---|---|---|---|---|
| 5.000 | 100 ms | 63 ms | 53 ms | 45 ms | 64 → 13 ms |
| 20.000 | 295 ms | 216 ms | 216 ms | 191 ms | 284 → 28 ms |
| 50.000 | 355 ms | 689 ms | 589 ms | 544 ms | 368 → 48 ms |

Versi pertama (skor di atas view lebar + JIT) = 905 ms di 50.000; baris sempit
+ JIT mati menurunkannya ±35%.

**Konsekuensi:** Benar di halaman berapa pun; lebih cepat sampai ±20.000 event
dan jauh lebih cepat saat ada filter. Di 50.000 event tanpa filter ±2× lebih
lambat dari jendela lama (O(N) skor vs O(240)) — diterima karena hasil lama
salah di luar halaman 20, Data Cache 5 menit menyerap kunjungan berulang, dan
katalog nyata masih jauh di bawah itu. Bila katalog aktif > 20.000: simpan
komponen yang tidak bergantung profil (recency, deadline_fit, popularitas) di
kolom yang diperbarui pg_cron harian, sehingga RPC hanya menambah kecocokan
minat/jenjang. Bobot kini hidup di DUA tempat (TS & SQL) — dikunci uji paritas
`tests/integration/relevance-and-attributes.test.ts` (4 profil + halaman 21
dari 260). Uji cache lama "profil tidak masuk kunci" diganti, bukan dihapus.

---

## ADR-049 — Biaya "belum diketahui" ≠ gratis; promosi berbayar opt-in & berlabel; lencana otoritas diberikan moderator

**Konteks:** Brief: `is_free boolean DEFAULT true`, `price_amount DEFAULT 0`,
`is_featured`/`featured_until` yang selalu di puncak, `verification_badge`, dan
`guidebook_url` dengan embed PDF.

**Keputusan & penyimpangan sadar dari brief:**
1. `is_free` NULLABLE tanpa default, `price_amount` NULLABLE. Pipeline scraping
   tidak pernah tahu biaya secara terstruktur; `DEFAULT true` = setiap kegiatan
   berbayar hasil scraping tampil "Gratis" — kebohongan paling merugikan bagi
   pengguna yang justru memakai filter ini. `NULL` tidak menampilkan lencana dan
   tidak lolos filter gratis maupun berbayar. CHECK: nominal hanya untuk berbayar.
2. Promosi = `is_featured` + `featured_until` (CHECK: promosi wajib punya akhir) +
   index parsial yang diminta. Aktif hanya bila kegiatan masih buka
   (`events_listing.is_promoted` ↔ `isPromoted()`). **Opt-in per query
   (`promoted: true`)**: hanya daftar umum `/events`. Papan per jenis berjudul
   "urut dari tenggat terdekat", hitungan, dan "sesuai minatmu" tidak boleh
   disisipi iklan. Promosi tidak mengubah skor. Label berbahasa Indonesia
   "Promosi" (bukan "Promoted" seperti di brief — copy UI berbahasa Indonesia,
   dan pengungkapan iklan harus terbaca semua pengguna).
3. `verification_badge` VARCHAR + CHECK (`OFFICIAL_GOV|CAMPUS_VERIFIED|COMMUNITY`),
   diatur admin di `/admin/promosi`, bukan diklaim pengirim. Berbeda dari ADR-042
   (akun penyelenggara terverifikasi): lencana menyatakan otoritas di balik acara.
   Pipeline tidak menulisnya → paritas tiga tempat tidak berlaku.
4. Buku panduan: https saja (CHECK + validasi ulang saat render). PDF disematkan
   di balik `<details>` tertutup (tidak diunduh sebelum diminta), disembunyikan
   di bawah `sm` (Chrome Android tidak merender PDF di iframe), tanpa `sandbox`
   (penampil PDF Chromium menolak iframe ber-sandbox). CSP `frame-src https:`
   hanya ditambahkan middleware untuk `/events/<slug>`, bukan global.
5. Kiriman `/submit`: kolom audit `organizer_contact`/`proof_link` disimpan di
   `payload` JSONB `ugc_submissions` (kontrak `submission-schema.ts`), BUKAN tabel
   baru `event_submissions` — tabel, RLS, rate limit, Turnstile, honeypot, dan
   antrean admin sudah ada sejak Phase 3. Keduanya tidak pernah disalin ke
   `events`. `proof_link` ≠ `sourceUrl`: yang kedua pengumuman publik, yang pertama
   bukti kepanitiaan privat. Teks bebas lewat `stripMarkup()`.

**Konsekuensi:** Lencana "Gratis" hanya muncul bila seseorang benar-benar
menyatakannya. Event lama & hasil scraping tampil tanpa info biaya sampai
diisi (pipeline belum mengekstraknya — TASKS.md). Perubahan lencana/promosi
belum tercatat di `moderation_log` (trigger hanya mencatat status) — audit
"siapa memberi lencana resmi" masih lewat log aplikasi; tercatat di TASKS.md.

---

## ADR-048 — Halaman yang tumbuh bersama data pengguna: satu tugas per layar, daftar selalu berbatas

**Konteks:** Lapisan data jaringan sudah berbatas (kursor keyset, maks 500,
saran 24 dari jendela 200), tapi UI-nya tidak: `/connections` merender SEMUA
ajakan masuk sebagai kartu besar di atas, ajakan terkirim tanpa batas di
sidebar, daftar koneksi sebagai gulir 420px di dalam sidebar lengket yang
sudah lebih tinggi dari layar, 12 chip minat, 24 kartu saran, form
pengaturan, peta, dan daftar blokir — 6.500px di ponsel dengan data contoh.
Tidak ada cara mencari di antara koneksi sendiri. `/discussions` dan
`/messages` memakai AccountShell sehingga menjadi tiga kolom (menu akun +
daftar + isi) yang memotong nama grup/percakapan. `/teams` punya satu chip
per kegiatan (hingga 60) dengan judul terpotong.

**Keputusan:**
- **Satu tab = satu tugas** di `/connections` (`?tab=`): Untukmu (ajakan
  masuk maks 3 + saran maks 6, "Tampilkan N lainnya" → `?lagi=1`), Koneksimu
  (dicari di server `?cari=`, 30/halaman, `?setelah=` kursor), Ajakan
  (masuk/terkirim, dipaginasi), Peta, Pengaturan (+ daftar blokir). Setiap
  tab hanya mengambil data yang ia tampilkan — peta & tautan tim tidak lagi
  dihitung di setiap kunjungan.
- `listConnections` mendapat `kind` + `search` (fungsi murni bersama
  `matchesConnectionFilter`, `normalizeConnectionSearch` membuang wildcard
  `ilike`). Tanpa migration: `connection_peers` sudah memfilter ke pemanggil.
- **Prioritas informasi dari pola penggunaan:** hanya angka yang menuntut
  tindakan (ajakan menunggu) ditonjolkan; kartu saran menampilkan dua alasan
  terkuat dan TIDAK mengulang minat yang sama sebagai chip; 12 chip minat →
  satu `<select>` (minatmu di atas).
- **Kotak masuk tanpa AccountShell** (`/messages`, `/discussions`): tujuan
  menu akun sudah ada di navbar. Diskusi: "Temukan grup" dilipat, kepala grup
  ringan (bukan blok hitam), utas = daftar datar bergaris pemisah dengan satu
  baris cuplikan; jumlah "sedang aktif" dihapus (tidak mengubah keputusan apa pun).
- `/teams`: chip kegiatan → `<select>` + tombol (GET, tanpa JS).
- `/events` tidak diubah: hasilnya sudah dipaginasi dan "Bidang" sudah dilipat.

**Konsekuensi:** URL lama `/connections#ajakan-masuk`/`#pengaturan-jaringan`
diganti `?tab=…` (tautan internal ikut diperbarui). `?tampil=N` tidak lagi
dikenali (diabaikan, bukan error). Kursor bersifat maju saja — "Kembali ke
awal", bukan "Sebelumnya"; nomor halaman butuh OFFSET yang justru dihindari
ADR-041. Diskusi & pesan masih mode demo tanpa backend; saat backend dibuat,
daftar utas perlu paginasi dengan pola yang sama.

---

## ADR-047 — Pengerasan produksi: apa yang diambil dari audit otomatis, dan apa yang ditolak

**Konteks:** Audit dari agent AI lain mengusulkan lima fase pengerasan
(error boundary, indexing kategori, RPC tim atomik, Suspense di `/events`,
header keamanan). Sebagian usulan menyasar masalah nyata, sebagian
menyasar masalah yang sudah diselesaikan — atau akan membuka lubang baru.

**Keputusan — diambil:**
- `src/app/global-error.tsx`: `error.tsx` dirender DI DALAM root layout, jadi
  tidak menangkap kegagalan layout itu sendiri. Tanpa komponen proyek (setiap
  impor = satu hal lagi yang bisa ikut gagal).
- `withFallback()` (`src/lib/fallback.ts`) untuk data PENDUKUNG di navbar
  (sesi, jumlah tersimpan, notifikasi). `unstable_rethrow` di depan supaya
  `redirect()`/`notFound()`/sinyal render dinamis tidak ikut tertelan. Tidak
  dipakai untuk data inti halaman — "0 hasil" saat DB mati itu bohong.
  Catatan: fetch profil ada di `navbar.tsx`, bukan `account-menu.tsx` (yang
  sinkron) seperti klaim audit.
- `events.category_slugs` fisik + GIN (migration `20260930100001`). Tipe
  `VARCHAR[]`, bukan `TEXT[]` seperti usulan: kolom view lama bertipe
  `character varying[]`, dan tipe berbeda memaksa DROP VIEW atau cast yang
  membuat filter tidak lagi cocok dengan index (dibuktikan `91_category_slugs`,
  termasuk uji negatif tanpa index). Trigger juga menangani ganti slug
  kategori dan mengabaikan tulisan langsung ke kolom turunan.
- `create_team_with_leader()` (migration `20260930100002`) — **SECURITY
  INVOKER**, bukan DEFINER seperti usulan. Atomisitas tidak butuh DEFINER;
  INVOKER tetap tunduk pada RLS `teams_owner_insert`/`team_members_self_join`
  sehingga aturan tidak disalin dua kali. Pembuat = `auth.uid()`, bukan
  parameter.
- `output: 'standalone'` + `Dockerfile`; `serverActions.allowedOrigins` dari
  host `NEXT_PUBLIC_SITE_URL` (untuk proxy yang meneruskan `Host` internal —
  pertahanan CSRF bawaan Next.js tetap berlaku tanpanya).

**Keputusan — ditolak:**
- `join_team_atomic(p_team_id, p_user_id)` SECURITY DEFINER: race slot
  terakhir SUDAH dijaga trigger `enforce_team_capacity` (`FOR UPDATE`,
  20260923100001, diuji paritas). Versi usulan menerima `p_user_id` dan
  melewati RLS → siapa pun bisa memasukkan orang lain ke tim mana pun (IDOR).
- `<Suspense>` di sekitar grid `/events`: melanggar keputusan yang dikunci
  `tests/e2e/events-no-js.spec.ts` — konten stream dikirim dalam `<div hidden>`
  dan hanya dimunculkan JavaScript, jadi tanpa JS halaman kosong. Halaman itu
  juga TIDAK memakai Suspense sama sekali (tidak ada `FilterBar` "di dalam
  Suspense" untuk dikeluarkan); navigasi App Router menahan UI lama sampai
  data baru siap, jadi tidak ada kedipan yang perlu diperbaiki.
- `React.cache()` untuk `loadEvent`: sudah ada sejak awal.
- HSTS: sudah ada (hanya produksi, `HSTS_VALUE`). CSP statis di
  `next.config.ts`: browser menegakkan SEMUA header CSP sekaligus, jadi CSP
  kedua tanpa nonce akan memblokir skrip hidrasi — CSP tetap per request di
  middleware. Supabase tidak ditambahkan ke `connect-src`: browser tidak pernah
  memanggil Supabase langsung (semua lewat server), dan origin yang tidak
  dipakai hanya memperlebar tujuan eksfiltrasi.

**UI (bagian yang sama):** kamera tur beranda diberi ritme zoom bervariasi
(1.0–1.9×) dan pembuka bab yang cukup lama untuk benar-benar mundur ke 1.0×
(sebelumnya berhenti di 1.09× karena 700 ms < transisi 1100 ms); `<select>`
native tetap native tapi satu komponen + panah sendiri (`select-chevron`);
"Kiriman saya" untuk pengirim (`listMySubmissions`, index pemilik
`20260930100003`); "Perlu tindakan" di Pendaftaran; panel kondisi antrean
di `/admin` (batas tunggu 48 jam).

**Konsekuensi:** `next start` mencetak peringatan soal standalone tetapi tetap
berjalan (dipakai Playwright). Dockerfile belum pernah di-`docker build` di
lingkungan pengembangan ini (tanpa daemon); tahap jalannya (`node server.js`
dari folder standalone) sudah. Alasan penolakan kiriman belum disimpan di
skema, jadi "Kiriman saya" menulis penyebab umum, bukan alasan spesifik.

---

## ADR-046 — Portofolio = baris tracker yang sudah "Sudah daftar"; riwayat berbeda per peran

**Konteks:** Pengguna meminta riwayat untuk tiap peran dengan isi berbeda,
dan portofolio yang otomatis terisi saat mahasiswa mendaftar kegiatan.
Tracker sudah mencatat pendaftaran (SAVED → APPLIED → INTERVIEW → ACCEPTED /
REJECTED) dan riwayat tahapnya, tapi halaman tracker berjanji "status
pendaftaranmu tidak pernah ditampilkan". Profil "Pencapaian" masih data demo
statis. Penyelenggara hanya melihat acara yang masih buka; admin tidak bisa
membatalkan penolakan (ADR-045 mencatatnya sebagai celah).

**Keputusan:**
- **Mahasiswa — portofolio.** Tidak ada tabel baru: entri portofolio adalah
  baris `application_tracker` berstatus APPLIED/INTERVIEW/ACCEPTED (jadi "otomatis"
  sejak tombol "Sudah daftar"). Kolom tambahan: `achievement` (daftar
  tertutup per jenis kegiatan, CHECK di SQL), `achievement_note` (≤120),
  `proof_url` (https saja, ≤500), `portfolio_visible` (NULL = bawaan jenis).
  Dua sumber kebenaran untuk status = pasti tidak sinkron; satu baris tidak.
- **Privasi bawaan.** Beasiswa & magang privat secara bawaan (kondisi
  ekonomi, lamaran kerja); jenis lain publik. REJECTED tidak pernah tampil,
  apa pun togglenya — "tidak lolos" adalah data yang tidak pernah dipilih
  untuk dipamerkan. SAVED bukan portofolio (belum melakukan apa-apa).
- **Siapa yang melihat** = aturan jaringan yang sudah ada (`can_view_profile`):
  pemilik; atau tidak saling memblokir DAN (pemilik bisa ditemukan ATAU ada
  koneksi/ajakan di antara keduanya). Tidak boleh dilihat dan tidak ada
  sama-sama 404 di `/orang/[id]` supaya URL tidak jadi alat menebak akun.
  Halaman wajib masuk dan `Disallow` di robots — ini jaringan, bukan SEO.
- **Hasil dilaporkan sendiri**, dan ditulis begitu di profil publik plus
  tautan bukti opsional. Verifikasi oleh penyelenggara butuh alur klaim dua
  sisi yang belum ada; menyebutnya "terverifikasi" tanpa itu = bohong.
- **Penyelenggara — riwayat acara.** `organizer_event_history()` hanya acara
  kelolaan yang sudah tutup (EXPIRED, atau APPROVED lewat tenggat), dengan
  total seumur acara (tayangan, pengunjung, simpan, klik, pendaftar
  tercatat), dan hanya selama status penyelenggara VERIFIED — sama dengan
  gerbang analitik ADR-043. Acara tutup keluar dari "Acara aktif".
- **Admin — pulihkan.** REJECTED → PENDING untuk event & kiriman, dari
  `/admin/riwayat`, hanya bila entri log terakhir subjek itu adalah
  penolakan. Trigger `moderation_log` mencatat aktornya seperti keputusan
  lain; konfirmasi "Tolak" kini menyebut jalan baliknya.
- **Pipeline:** `link_selector` pada sumber = halaman daftar diikuti ke
  halaman detail (host sama, unik, dibatasi `max_pages_per_source`, jeda &
  robots tetap berlaku). 0 tautan cocok = kesalahan (selektor basi), bukan
  "tidak ada kegiatan".

**Konsekuensi:** Menghapus kegiatan dari Pendaftaran ikut menghapusnya dari
portofolio — disebut di form. Hasil bisa dipalsukan pemiliknya; labelnya
jujur soal itu. `public_portfolio` dibatasi 100 entri. Riwayat penyelenggara
bergantung pada acara yang benar-benar ditandai kelolaan (`event_managers`);
acara lama sebelum klaim tidak muncul. Pesan & diskusi tetap demo.

---

## ADR-045 — Pipeline: jalur scraping diuji sungguhan, bukan hanya gerbang validasinya

**Konteks:** Uji pipeline yang ada (`test_models`, `test_publisher`) hanya
menyentuh validasi dan payload; dry-run CI memuat 0 sumber. Fetcher,
robots.txt, pemangkasan HTML, dan orkestrasi tidak pernah dijalankan. Audit
dengan situs palsu lokal + Postgres/PostgREST sungguhan menemukan:
`html_to_text` membuang SEMUA `<header>` sehingga judul & penyelenggara di
`<article><header>` tidak pernah sampai ke LLM; robots.txt 5xx dianggap
"boleh semua"; tidak ada jeda antara robots.txt dan halaman; tanggal tanpa
jam menjadi 00:00 (prompt menjanjikan 23:59 WIB); halaman sah tanpa kegiatan
buka dihitung sebagai sumber gagal (alarm palsu); dry-run bisa mengirim
Telegram; kredensial hilang = traceback tanpa peringatan; `requires_javascript`
dan Playwright tidak pernah dipakai; enum kategori kosong dikirim ke Gemini.

**Keputusan:**
- Semua temuan di atas diperbaiki, masing-masing dikunci uji di
  `pipeline/tests/test_fetch_extract.py` (server HTTP lokal, tanpa jaringan
  luar/kunci API) — setiap uji dibuktikan GAGAL di kode lama.
- robots.txt mengikuti RFC 9309: 4xx = tanpa larangan, 5xx/jaringan = lewati.
- Sumber gagal = tidak menghasilkan event DAN ada kesalahan.
- `requires_javascript` dirender Playwright lewat gerbang robots/jeda/UA yang
  sama; Chromium dipasang di cron hanya bila ada sumber yang membutuhkannya.
- Moderasi: kartu antrean menampilkan jenjang, tempat, bidang (yang kosong
  ditandai), deskripsi lengkap, dan waktu masuk antrean; "Tolak" butuh satu
  langkah konfirmasi karena penolakan tidak punya jalan balik.

**Konsekuensi:** Uji fetch memakai subprocess `run.py` sehingga butuh semua
dependensi pipeline terpasang (sudah di job CI). Ekstraksi Gemini sendiri
tetap tidak teruji tanpa kunci API — ditiru dengan jawaban yang dibentuk
seperti keluarannya. Satu sumber masih = satu halaman (`max_pages_per_source`
belum dipakai; dicatat di config contoh). Chromium meminta `/favicon.ico` di
luar jangkauan `page.route` — satu request kecil yang diterima sadar.

---

## ADR-044 — Satu fakta, satu tempat: memangkas pengulangan dari kanvas desain

**Konteks:** Audit visual (desktop 1440px + ponsel 390px, mode seed) menemukan
kepadatan yang lahir dari kanvas desain, bukan dari kebutuhan pengguna. Di
detail kegiatan, tenggat tampil lima kali (panel poster, deretan fakta, hitung
mundur, "Tutup … WIB", bilah bawah), jenjang tiga kali, ajakan "Cari tim" dua
kali, dan navigasi bagian tiga lapis (tab + daftar "Sebelum mendaftar" yang
isinya tautan ke tab yang sama + tombol "Selanjutnya"); tombol "Daftar
sekarang" baru terlihat setelah menggulir ~1100px. Pola yang sama muncul di
tempat lain: kartu lomba menulis tanggal tutup tiga kali, kartu statistik hitam
di `/teams` & `/connections` mengulang angka yang sudah ada di judul bagian,
kelengkapan profil 100% tampil dua kali lengkap dengan daftar yang dicoret
semua, dan navbar beranda berisi delapan tautan yang isinya berganti antarhalaman.

**Keputusan:** Aturan umumnya — setiap fakta tampil SEKALI per lebar layar, di
tempat pengguna bisa bertindak atasnya; yang tidak butuh tindakan tidak memakan
ruang.
- Detail kegiatan: panel aksi (hitung mundur + daftar + simpan/bagikan) naik ke
  samping judul; jenjang/tempat/jumlah penyimpan jadi satu baris meta di bawah
  judul; deskripsi pindah ke tab Ringkasan. Dibuang: panel poster-tanggal,
  deretan lima fakta, daftar "Sebelum mendaftar", tombol sebelum/selanjutnya,
  tombol kembali (remah roti cukup), tombol tim kedua, dan disclaimer panel
  (sudah ada di footer setiap halaman).
- Navbar sama di semua halaman: "Semua" + lima kategori. Jangkar beranda
  (Cara pakai, Fitur) tetap terjangkau dari tombol hero; "Tentang" dari footer.
- Tombol utama hero = "Jelajahi kegiatan" (/events), bukan "Mulai gratis":
  mencari tidak butuh akun; daftar tetap di navbar & ajakan penutup.
- Kartu statistik yang hanya mengulang hitungan judul bagian dihapus; kartu
  yang membawa informasi unik (tenggat di `/teams?kegiatan=`, "N dari M
  beasiswa terbuka untuk jenjangmu") dipertahankan.
- Kelengkapan profil hanya tampil selama < 100%. Form "Cara orang
  menemukanmu" dilipat (`<details>`), terbuka sendiri hanya saat profil masih
  tersembunyi.
- Kartu kegiatan tanpa baris tag bidang (slug mentah huruf kecil); FilterBar
  memisahkan "Tampilkan yang ditutup" (filter) dari opsi urutan, dan di ponsel
  baris chip jadi satu baris geser.
- Beranda tanpa bagian "Fitur utama": keempat kartunya sudah dicakup Tur
  singkat tepat di atasnya. Keterangan Tur tidak lagi mengklaim formulir
  "terisi otomatis" — StudentFo tidak mengisi formulir penyelenggara.
- `/connections`: ajakan → cari koneksi & daftar → peta → diblokir. Peta
  adalah eksplorasi, jadi turun ke bawah tombol "Hubungkan"; tetap di halaman
  yang sama karena panelnya menautkan `#orang-…` dan `#pengaturan-jaringan`.
- Ruang diskusi (demo): grup yang di-"Gabung" jadi grup sungguhan (masuk
  "Grup kamu", bisa dibuka, diisi utas, dan ditinggalkan), bukan hanya label
  "Diikuti" dengan pesan "segera hadir".
- Tidak ada kotak "segera hadir" di produksi (tab Profil); label tutup di
  Persiapan = "Tutup", karena "Keluar" sudah berarti keluar akun.

**Konsekuensi:** Beberapa elemen kanvas desain sengaja tidak diikuti lagi —
penyelarasan kanvas berikutnya harus membaca ADR ini dulu, bukan
"mengembalikan yang hilang". Di bawah 960px tenggat hanya ada di bilah bawah
(tidak di badan halaman); itu disengaja karena bilahnya selalu terlihat.
Metrik konversi "Mulai gratis" dari hero akan turun — yang diukur seharusnya
akun yang dibuat setelah pengguna melihat isi, bukan klik di hero.

---

## ADR-043 — Analitik acara untuk penyelenggara: agregat harian, hash pengunjung harian, k-anonimitas

**Konteks:** Penyelenggara butuh angka untuk mengevaluasi acaranya (jangkauan,
minat, konversi ke pendaftaran), dan targetnya ribuan pengunjung/ribuan acara.
Mencatat satu baris per kunjungan membengkak cepat, dan menyimpan IP atau
menampilkan rincian audiens per orang melanggar kepercayaan pengguna.

**Keputusan:**
- `event_daily_stats (event_id, day)` — SATU baris per acara per hari WIB
  (`views`, `visitors`), bukan per kunjungan. `event_view_dedup` menampung
  hash pengunjung hari ini saja; dibersihkan harian (`purge_event_view_dedup`,
  pg_cron bila ada).
- Hash pengunjung = HMAC(rahasia server, hari WIB, IP, user-agent) dibuat di
  aplikasi (`eventVisitorHash`). IP tidak pernah sampai ke database, dan hash
  berganti tiap hari → tidak bisa dipakai melacak orang lintas hari.
- Pencatatan lewat `after()` di halaman detail (tidak menunda render), dengan
  filter bot, prefetch (`next-router-prefetch`/`sec-purpose`), IP tak dikenal,
  dan batas 300/jam per IP. `record_event_view` hanya service_role.
- Laporan = satu RPC `event_analytics()` → JSON, dikontrak `parseEventAnalytics`.
  Hanya `manages_event()` (pengelola yang MASIH terverifikasi) atau admin.
  Rincian audiens hanya dari penyimpan (akun), kelompok < 5 disembunyikan
  (`ANALYTICS_MIN_GROUP` = `k` di SQL). Pembanding = median kunjungan acara
  berjenis sama, ditampilkan hanya bila ≥ 3 pembanding.
- Grafik SVG dirender server (tanpa pustaka grafik, tanpa JS), plus tabel
  tersembunyi untuk pembaca layar. "Saran" (`insightsOf`) diturunkan dari angka
  yang sama dan diam bila sampel < 30 pengunjung.

**Konsekuensi:** "Pengunjung unik" = unik per hari, dijumlah lintas hari (orang
yang datang 3 hari terhitung 3) — dilabeli begitu di UI. Kunjungan dari IP yang
sama tapi user-agent berbeda terhitung dua pengunjung. Satu RPC tambahan
(`consume_rate_limit`) per kunjungan halaman detail; bila jadi beban, batas per
IP bisa dipindah ke edge. Indeks baru `recommendation_signals (event_id, kind,
created_at)`.

---

## ADR-042 — Penyelenggara terverifikasi: kepercayaan di atas kecepatan

**Konteks:** Pemilik produk meminta penyelenggara bisa memposting & mengelola
acara dengan mudah, TANPA mengorbankan kepercayaan: orang tak sah tidak boleh
bisa mengaku penyelenggara lalu, misalnya, mengganti tautan pendaftaran ke
formulir palsu.

**Keputusan:**
- `organizer_profiles`: pengguna hanya MENGAJUKAN (nama lembaga, situs https,
  bukti peran). Status hanya diubah admin lewat RPC service_role
  `review_organizer()` dengan transisi sah saja (PENDING→VERIFIED/REJECTED,
  VERIFIED→REVOKED). Mengubah identitas setelah terverifikasi = kembali
  PENDING (trigger). REVOKED tidak bisa mengajukan ulang sendiri.
- Hak kelola (`event_managers`) hanya ditulis server: saat kiriman dari
  penyelenggara terverifikasi disetujui (`approve_submission`), atau saat admin
  menyetujui klaim (`review_event_claim`). Berlaku HANYA selama VERIFIED
  (`manages_event()`), jadi mencabut verifikasi langsung memutus semuanya.
- Tidak ada edit langsung ke acara tayang. Perubahan = `event_revisions`
  (hanya kolom yang berubah; judul & nama penyelenggara tidak bisa) yang
  diterapkan admin; RPC memvalidasi ulang tautan https, tenggat di masa depan,
  dan status pengaju. Perpanjangan tenggat yang disetujui membuka kembali
  acara EXPIRED atas nama moderator.
- Semua keputusan tercatat di `moderation_log` lewat trigger. Menolak/mencabut
  wajib beralasan (ditegakkan Server Action, bukan hanya `required` di form).
- Lencana publik "penyelenggara terverifikasi" dari view
  `verified_event_organizers` (tanpa user_id). Ikon centang yang dulu tampil di
  SEMUA acara diganti ikon "ditinjau moderator" — centang kini berarti sesuatu.
- Kemudahan untuk penyelenggara terverifikasi: `/submit` terisi nama lembaga,
  kiriman ditandai di antrean admin (plus peringatan bila nama berbeda), acara
  yang disetujui otomatis masuk studio, klaim satu klik dari halaman acara.

**Konsekuensi:** Setiap posting & perubahan tetap menunggu moderator — lebih
lambat, disengaja. Notifikasi klaim/revisi disimpan tanpa `event_id` supaya
tidak ditelan `idx_notifications_dedupe` pada keputusan kedua. Revisi yang
JSON-nya tidak lolos skema aplikasi tidak ditampilkan di antrean (ditulis di
luar aplikasi) dan tetap PENDING tanpa efek.

---

## ADR-041 — Blokir koneksi + paginasi `listConnections` (menutup dua celah ADR-040)

**Konteks:** ADR-040 mencatat dua batas sebelum `/connections` dibuka publik:
(1) tidak ada blokir — orang yang ditolak/diputus bisa mengajak lagi hingga
30×/hari, dan setiap ajakan mengirim notifikasi; (2) `listConnections`
membaca maks. 1000 baris sekaligus, dan semua angka di halaman dihitung dari
daftar itu.

**Keputusan:**

1. **Tabel `connection_blocks` (migration `20260928100001`)**, bukan kolom
   status di `connections`: blokir harus bertahan setelah barisnya dihapus,
   dan harus bisa ada tanpa pernah ada koneksi (ajakan masuk dari orang
   tersembunyi yang sudah ditolak). RLS pemilik saja; yang diblokir tidak
   bisa membaca apa pun dan **tidak diberi tahu**.
2. **Blokir memutus** (trigger AFTER INSERT menghapus koneksi/ajakan di
   antara keduanya) dan **berlaku dua arah**: `is_blocked(a, b)` di policy
   INSERT & UPDATE `connections` (di-DROP + CREATE, migration 040 tidak
   disentuh), serta di `network_directory` — arah "dia memblokirku" tidak
   terlihat lewat RLS, jadi penyaringannya harus di view, bukan di aplikasi.
   Memory repository mencerminkan aturan yang sama (`isBlocked`).
3. **Kondisi balapan ditutup di database.** Policy `WITH CHECK` memakai
   snapshot awal statement, jadi blokir & ajakan yang bersamaan bisa
   sama-sama lolos. Kedua trigger mengambil `pg_advisory_xact_lock` per
   pasangan lalu memeriksa ulang dengan snapshot baru. Dibuktikan manual
   dengan dua sesi psql bersamaan (kedua urutan); tidak ada uji otomatisnya
   karena `db:test` berjalan dalam satu sesi.
4. **Tidak membocorkan blokir.** Mengajak orang yang memblokirmu gagal dengan
   `person_unavailable` — kode yang sama dengan "profil disembunyikan".
   `is_blocked()` hanya menjawab kalau pemanggil salah satu pihak; tanpa itu
   siapa pun bisa menanyakan "apakah A memblokir B?" untuk pasangan mana pun.
   Yang diblokir TETAP bisa menduga (pemblokir menghilang dari direktori) —
   itu tidak terhindarkan dan sama dengan platform lain.
5. **Hanya orang yang pernah terlihat yang bisa diblokir**: bisa ditemukan,
   atau ada koneksi/ajakan dengannya. View `blocked_people` menampilkan nama;
   tanpa syarat ini, memblokir UUID sembarang = membaca nama siapa pun.
   Konsekuensinya: orang tersembunyi yang ajakannya sudah ditolak baru bisa
   diblokir kalau ia mengajak lagi — dan saat itulah blokir dibutuhkan.
6. **UI**: opsi Blokir di menu opsi baris koneksi (bersama "Putuskan"), di
   kartu ajakan masuk (kasus pelecehan paling nyata), dan di panel peta
   untuk simpul koneksi/ajakan masuk/saran — semuanya `<form>` di balik
   `<details>` (satu langkah konfirmasi, jalan tanpa JavaScript). Kelola di
   bagian "Diblokir" di dasar halaman — SENGAJA di luar `<aside>` lengket,
   yang sudah lebih tinggi dari layar sehingga bagian bawahnya baru terjangkau
   di ujung halaman. Opsi di baris koneksi dibuka sebagai akordeon inline,
   bukan panel melayang: daftarnya wadah gulir ber-`max-h`, dan panel absolut
   di baris bawah terpotong di dalamnya (bug lama yang makin parah begitu
   konfirmasi blokir ditambahkan). "Putuskan" turun ke gaya sekunder supaya
   hanya tindakan terberat (blokir) yang berwarna bahaya.
7. **Paginasi = kursor keyset**, bukan offset: urutan
   `(status DESC, created_at DESC, id DESC)` — ajakan menunggu selalu di
   halaman pertama, koneksi baru di antara dua permintaan tidak menggeser
   halaman. Kursor divalidasi ketat sebelum dirakit ke filter PostgREST
   (`decodeConnectionCursor`), `limit` maks. 500 supaya `limit + 1` tidak
   terpotong `max_rows`. Angka di halaman dari `countConnections()` (tiga
   hitungan `head` ber-indeks), bukan panjang daftar.
8. **"Muat lebih banyak" = `?tampil=N`** (N halaman × 50 dari awal, maks. 10).
   Tanpa state klien (AGENTS §9) halaman server tidak bisa "menambahkan"
   hasil kursor ke daftar yang sudah ada; memuat ulang dari awal menjaga yang
   sudah terlihat tetap terlihat. Kursornya tetap di kontrak dan diuji
   berantai melewati `max_rows` (1.200 baris, `tests/integration/network.test.ts`).

**Konsekuensi / batas yang disadari:**
- Belum ada **laporkan** (blokir hanya melindungi diri sendiri; tidak ada
  antrean moderasi). Butuh desain moderasi bersama Pesan/Ruang diskusi.
- Halaman menampilkan maks. 500 koneksi & ajakan; di atasnya ada catatan
  jujur, bukan tautan. Peta tetap dibatasi 150 orang (ADR-040 #7).
- Saran masih mengecualikan orang yang sudah terhubung dari maks. 1000 baris
  `connections`; di atasnya saran bisa memuat orang yang sudah terhubung dan
  mengajaknya berakhir `connection_exists` — gagal yang aman.
- Blokir tidak menyembunyikan nama di `team_member_profiles` (tim publik
  tetap publik, ADR-018).
- Migration belum di-apply ke Supabase mana pun.

---

## ADR-040 — Koneksi antar pengguna + "Peta koneksi" ala Obsidian + halaman Tentang (menutup "Tentang & Cari Koneksi" dari ADR-039)

**Konteks:** ADR-039 menunda halaman Tentang & Cari Koneksi karena tidak ada
di bundel desain. Pemilik produk meminta keduanya dibangun dengan tema yang
sama, termasuk graf koneksi bergaya Obsidian (simpul & benang), dengan
backend sungguhan — bukan fitur demo-saja seperti Pesan/Ruang diskusi.

**Keputusan:**

1. **Backend nyata, bukan localStorage.** Migration `20260927100001_network.sql`:
   `network_profiles` (opt-in `is_discoverable` + `headline`) dan
   `connections` (satu baris per PASANGAN, indeks unik `LEAST/GREATEST`).
   Kontrak `NetworkRepository` di kedua repository, logika peringkat bersama
   di `lib/network.ts` (pola `listing.ts`), diuji di memori
   (`lib/data/network.test.ts`) dan di Postgres (`supabase/tests/95_network.test.sql`).
2. **Privasi: tersembunyi secara bawaan.** Tidak ada orang di direktori
   tanpa memilih sendiri. `users_select_own` TIDAK dilonggarkan; profil orang
   lain dibaca lewat dua view sempit `security_invoker = off` (pola ADR-018):
   `network_directory` (hanya yang opt-in) dan `connection_peers` (hanya pihak
   lawan dari koneksi pemanggil). Tanpa email; kegiatan tersimpan & status
   pendaftaran tidak pernah ikut. Hanya `authenticated`, `anon` dicabut (ADR-020).
3. **Aturan ajakan ditegakkan database:** hanya bisa mengajak orang yang
   bisa ditemukan (`is_discoverable()` di policy INSERT); klien tidak bisa
   mengisi `status`/`id`/`responded_at` (hak per kolom, AGENTS §14); hanya
   yang diajak boleh PENDING → ACCEPTED; kedua pihak boleh menghapus;
   pihak ketiga tidak melihat apa pun. **Menolak = menghapus baris**, jadi
   tidak ada status "ditolak" yang harus disembunyikan dari pengirim.
   Ajakan dua arah otomatis jadi koneksi (repository menerima ajakan lawan
   alih-alih menyisipkan baris kedua).
4. **Batas laju 30 ajakan/24 jam dihitung dari PERCOBAAN** (`consume_rate_limit`
   dipanggil trigger BEFORE INSERT), bukan jumlah baris — menghitung baris bisa
   diakali kirim → batal → kirim, dan tiap putaran mengirim notifikasi ke target.
   Angka dicerminkan `CONNECTION_RATE_LIMIT` di `lib/network.ts`.
5. **Notifikasi in-app** `CONNECTION_REQUEST` / `CONNECTION_ACCEPTED` lewat
   trigger (pola ADR-037); lonceng membuka `/connections`.
6. **Saran = jendela kandidat 200 baris + peringkat di aplikasi** (ADR-021):
   minat sama (×3, maks 3), koneksi bersama (×2, maks 5, hanya JUMLAH lewat
   RPC `mutual_connection_counts`), ikut tim di kegiatan yang disimpan
   pembaca (×4, maks 2), jurusan (+2), jenjang (+1). Setiap kartu menampilkan
   alasannya — saran tanpa alasan terasa seperti pengintaian.
7. **Peta = kanvas 2D + simulasi gaya sendiri** (`lib/graph-layout.ts`,
   tanpa d3 — daftar dependency sengaja minim). Graf dibangun di SERVER
   (`lib/network-graph.ts`) dari data yang sama dengan daftar di halaman,
   dibatasi 150 orang / 16 saran / 12 kegiatan. Simulasi deterministik,
   berhenti total setelah dingin, tidak menggambar saat di luar layar atau
   tab tersembunyi. Jenis simpul dibedakan BENTUK (palet monokrom).
   Label ditempatkan rakus berdasarkan prioritas (orang > minat) supaya tidak
   bertumpuk. Aksesibilitas: kanvas punya navigasi panah/Enter/Escape +
   wilayah live, dan seluruh isinya juga ada sebagai daftar biasa. Zoom
   roda hanya dengan Ctrl/⌘ supaya halaman tidak "tersangkut" saat digulir.
8. **Saringan saran tetap `<form method="get">` + URL** (AGENTS §9). Kontrol
   lapisan/zoom/pencarian DI DALAM peta adalah state klien — itu kontrol
   visualisasi, bukan saringan daftar, dan tidak mengubah data apa pun.
9. **Mode demo:** 14 orang contoh fiktif (tiga di antaranya anggota tim
   contoh, jadi simpul "kegiatan" lahir dari data `/teams`), dan persona
   "Mahasiswa" mendapat jaringan awal (3 koneksi, 2 ajakan masuk, 1 terkirim)
   lewat `seedDemoNetwork()` saat masuk. "Siswa baru" sengaja kosong supaya
   keadaan kosong ikut bisa dinilai.
10. **Tentang (`/about`)**: setiap klaim menunjuk ke perilaku sistem
    sungguhan; angka dari `getStats()` (berlabel "data contoh" di mode
    seed); ada bagian "Yang belum kami lakukan" (bukan penyelenggara, belum
    ada email pengingat, cakupan masih tumbuh, kebijakan privasi masih draf).

**Konsekuensi / batas yang disadari:**
- ~~Belum ada **blokir/laporkan**.~~ Blokir → ADR-041. Laporkan belum ada.
- Pencarian nama memakai `ilike` di jendela 200 baris; di atas ±50k profil
  opt-in butuh `pg_trgm` + indeks trigram.
- ~~`listConnections` membaca maks. 1000 baris.~~ Berhalaman sejak ADR-041.
- Peta O(n²) per langkah; kalau batas simpul dinaikkan jauh di atas 200,
  ganti tolakan ke Barnes–Hut atau pindahkan simulasi ke Web Worker.
- Migration belum di-apply ke Supabase mana pun (seperti migration 20260926*).

---

## ADR-039 — Desain StudentHub monokrom diterapkan ke seluruh halaman; fitur tanpa backend hanya di mode demo (menggantikan ADR-016, memperbarui ADR-009)

**Konteks:** Pemilik produk menyerahkan desain final dari Claude Design
(kanvas "StudentHub": beranda, masuk/daftar, lima halaman daftar per jenis,
detail, profil bertab, data diri, peminatan, pengaturan, privasi, kebijakan
privasi, pendaftaran, status pendaftaran, cari tim, pesan, ruang diskusi)
dan meminta seluruh halaman mengikutinya. Kanvas itu hitam-putih, memakai
Geist, animasi masuk yang kaya, dan menggambarkan fitur yang **belum ada**
di skema (hadiah/stipendium/kuota, NIK/IPK/NIM, unggah dokumen ke server,
pesan, ruang diskusi, peserta solo, pengiriman formulir ke penyelenggara).

**Keputusan:**

1. **Visual:** token `globals.css` diganti monokrom (`#191919` di atas
   putih, abu hangat; tema gelap setara), font Geist/Geist Mono, radius &
   bayangan dari kanvas. Nama token tetap, jadi seluruh markup lama ikut
   berubah. Menggantikan ADR-016. Pagar a11y tidak dilonggarkan:
   `check:contrast` tetap wajib lulus, target sentuh ≥ 44px, fokus terlihat.
2. **Gerak (hibrida):** animasi masuk (`.enter`, `.pop`, reveal saat
   digulir, tur kursor di beranda) memakai CSS dan satu observer kecil;
   semuanya dimatikan oleh `prefers-reduced-motion`. Saringan tetap
   `<form>` + `<a>` + URL tanpa state klien (aturan AGENTS.md); interaksi
   yang memang butuh klien (pemilih melayang, kartu data diri, pesan)
   adalah pulau klien kecil.
3. **Navigasi:** tab navbar Lomba · Beasiswa · Magang · Workshop · Seminar
   dipetakan ke enum yang ada: Workshop = `PELATIHAN`, Seminar =
   `KONFERENSI` (lihat `lib/event-type-nav.ts`). Halaman akun memakai
   sidebar kanvas (`AccountShell`), disembunyikan < 960px karena isinya
   identik dengan menu akun di navbar.
4. **Kejujuran data:** kolom kanvas yang tidak ada di skema **tidak**
   dipalsukan. Tempatnya diisi data yang benar-benar kita punya (tanggal
   tutup, jumlah penyimpan, lokasi, jenjang). Kebijakan privasi ditulis
   ulang dari migration yang ada — kanvas menjanjikan hal yang tidak
   dilakukan aplikasi ini — dan ditandai **draf** sampai pemilik
   melengkapi kontak resmi & meninjaunya bersama penasihat hukum.
5. **Fitur tanpa backend → mode demo saja** (`demoFeaturesEnabled`, yaitu
   `dataMode === 'seed'`): profil publik/kontak/pencapaian, dokumen siap
   pakai (hanya nama berkas), preferensi notifikasi & privasi, pesan, ruang
   diskusi, dan alur persiapan pendaftaran. Tersimpan di localStorage dengan
   validasi bentuk di setiap baca (`lib/demo/*`, semuanya diuji). Di mode
   produksi halaman `/messages`, `/discussions`, dan `/events/[slug]/persiapan`
   mengembalikan 404 dan bagian demo di halaman lain tidak dirender.
6. **Alur pendaftaran dibalik jadi persiapan:** kanvas mengirim formulir
   ke penyelenggara dari dalam aplikasi. StudentFo agregator, jadi alurnya
   jadi "periksa data → tim → berkas → buka formulir resmi (`/daftar`) →
   tandai sudah daftar" — langkah terakhir memanggil aksi tracker sungguhan.
   Tidak ada tabel baru, jadi tidak bertentangan dengan penundaan Linimasa
   (ADR-038 #1).
7. **Tracker:** papan kanban lima kolom (ADR-009) diganti daftar dengan
   bilah empat tahap per baris + halaman status `/tracker/[slug]` (tahap,
   catatan, jadwal resmi, tim). Semua kendalinya tetap `<form>` Server
   Action, jadi tetap jalan tanpa JavaScript. Kontrak ADR-009 (tamu
   melihat nilai fitur, bukan data karangan) dipertahankan.
8. **Saringan baru yang sungguhan:** `lokasi` dan `mode` (daring/luring)
   ditambahkan ke query daftar kegiatan, di repository memori **dan**
   Supabase, dengan uji paritas.

**Konsekuensi:** Tampilan mengikuti desain final, tapi beberapa layar
kanvas hanya "hidup" di mode demo sampai backend-nya dibuat (TASKS.md,
bagian desain StudentHub). Yang dibuang dari kanvas karena akan menyesatkan:
daftar perangkat/sesi di Pengaturan (Supabase tidak memberi daftar sesi ke
klien), log "data dibagikan ke penyelenggara" (kita tidak meneruskan data),
tab "Peserta solo" di Cari Tim, testimoni/angka pemakaian di beranda.
Halaman Tentang dan Cari Koneksi tidak ada di bundel desain, jadi tidak
dibuat. → Dibangun kemudian di ADR-040.

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
   belum sebanding biayanya. *(Digantikan ADR-050: dipindah ke SQL demi
   paginasi yang benar; angka baru ada di sana.)*
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

> **DIGANTIKAN OLEH ADR-050** — skor kini dihitung di SQL atas semua hasil filter.

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

> **DIGANTIKAN OLEH ADR-039** (monokrom StudentHub).

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

> **Diperbarui oleh ADR-039 #7:** kanban diganti daftar bertahap + halaman status; prinsip "tanpa data karangan" tetap.

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
