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

## ADR-019 — Koreksi ADR-015: `rankEvents()` harus jalan sebelum paginasi dan tanpa syarat profil

**Konteks:** ADR-015 menyambungkan `rankEvents()` ke `SupabaseEventRepository.listEvents()`,
tapi implementasinya punya dua cacat yang baru ketahuan setelah diperiksa ulang.
Pertama, skor dihitung SETELAH `.range()` memotong hasil ke satu halaman, jadi
ranking hanya bisa mengurutkan ulang di dalam halaman itu sendiri — tidak pernah
bisa menaikkan event relevan dari halaman berikutnya ke halaman pertama. Kedua,
syarat `&& query.profile` membuat `rankEvents()` dilewati sama sekali untuk
pengunjung anonim (`profile` null), padahal itu kondisi paling umum di Phase 1 dan
awal Phase 2 — dan `rankEvents()` sendiri sudah punya jalur cold-start (recency +
popularitas) khusus untuk kasus itu, persis seperti yang dipakai
`MemoryEventRepository.sortSummaries()`.

Terpisah tapi berkaitan: `sitemap.ts` masih menarik satu halaman saja
(`pageSize: MAX_PAGE_SIZE`, tanpa loop) — begitu event `APPROVED`/`EXPIRED` lebih
dari 48, sisanya tidak pernah masuk sitemap dan tidak ter-index.

**Keputusan:**
1. Untuk sort `relevance`, kandidat ditarik lewat `.limit(500)` (order by
   `created_at DESC`, bukan `.range()`), diberi skor lewat `rankEvents()`, baru
   dipotong sesuai halaman yang diminta di memori Node. `query.profile` diteruskan
   apa adanya termasuk `null`/`undefined` — `rankEvents()` yang memilih jalur
   cold-start. `totalPages` dibatasi ke jendela 500 kandidat itu supaya tidak
   menjanjikan halaman yang pasti kosong.
2. Sort `deadline`/`newest` tidak diubah — tetap paginasi murni di database lewat
   `.range()`, tidak terpengaruh batas 500 kandidat.
3. `sitemap.ts` sekarang loop sampai `totalPages`, memakai `sort: 'newest'` secara
   eksplisit (bukan default `relevance`, yang kini dibatasi kandidat), dengan batas
   pengaman 50.000 entri sesuai batas protokol sitemap.

**Konsekuensi:** "Paling relevan" sekarang benar-benar berbeda dari "Terbaru" untuk
semua pengunjung, bukan hanya yang sudah login dan mengisi profil — pengunjung
anonim di beranda/halaman jelajah sekarang mendapat cold-start scoring
(recency + popularitas), bukan sekadar `created_at DESC` yang menyamar sebagai
"relevan". Trade-off yang diterima sadar: begitu jumlah event `APPROVED` melewati
500, sort relevance tidak lagi menjangkau seluruh tabel — hanya 500 kandidat
terbaru yang diberi skor (lihat komentar `RANKING_CANDIDATE_LIMIT` di
`supabase-repository.ts` untuk titik migrasi ke skoring SQL/RPC). Sitemap sekarang
menjangkau seluruh event tanpa batas praktis, dengan biaya query berulang (satu
per halaman) tiap kali di-generate.

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
