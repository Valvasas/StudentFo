# Penyimpangan dari Blueprint v3

Blueprint v3 menyebut dirinya *single source of truth* dan melarang improvisasi.
Dokumen ini mencatat setiap titik di mana implementasi **sengaja** berbeda, beserta
alasannya. Tidak ada perubahan yang dilakukan diam-diam.

Urutannya dari yang paling berbahaya kalau tidak diperbaiki.

---

## 🔴 Menghentikan sistem — migration tidak akan jalan

### 1. `to_tsvector('indonesian', ...)` — konfigurasi FTS itu tidak ada

**Di blueprint (§3.3):** kolom generated `search_vector` memakai konfigurasi
full-text search bernama `'indonesian'`.

**Masalahnya:** PostgreSQL tidak punya konfigurasi bawaan bernama `indonesian`.
Yang tersedia hanya `simple`, `english`, dan belasan bahasa Eropa. Statement
`CREATE TABLE events` akan gagal dengan
`text search configuration "indonesian" does not exist`, dan seluruh migration
berhenti di situ. Skema v3 apa adanya **tidak bisa di-deploy**.

**Yang dilakukan:** membuat konfigurasi `public.indonesian` sendiri sebagai
turunan `simple` sebelum tabel dibuat. Ekspresi generated column-nya tetap
persis seperti di blueprint.

**Konsekuensi yang harus kamu tahu:** `simple` tidak melakukan stemming, jadi
pencarian "beasiswa" tidak otomatis menemukan "beasiswanya". Untuk MVP ini
dapat diterima. Ketika recall mulai terasa kurang, dua jalan keluarnya:
pasang dictionary Snowball Indonesia, atau migrasi ke Meilisearch — yang
memang sudah jadi rencana di §2.

---

## 🔴 Lubang keamanan

### 2. RLS hanya menyala di 5 dari 11 tabel

**Di blueprint (§3.10):** RLS diaktifkan di `users`, `events`, `saved_events`,
`application_tracker`, `notifications`.

**Masalahnya:** di Supabase, **setiap** tabel di schema `public` otomatis
diekspos lewat PostgREST kepada role `anon` — dan anon key memang dikirim ke
browser. Tabel tanpa RLS berarti siapa pun yang membuka DevTools bisa menulis
ke tabel itu. Dengan skema v3 apa adanya, publik bisa menghapus seluruh isi
`categories`, `event_deadlines`, `event_categories`, dan `teams`.

**Yang dilakukan:** RLS dinyalakan di **semua** tabel publik, dengan policy
eksplisit per operasi.

### 3. `users.role` bisa dinaikkan sendiri jadi ADMIN

**Di blueprint (§3.10):** `CREATE POLICY "users_update_own" ON users FOR UPDATE
USING (auth.uid() = id);`

**Masalahnya:** policy RLS membatasi **baris mana** yang boleh disentuh, bukan
**kolom apa**. User yang sah boleh meng-UPDATE barisnya sendiri — termasuk
kolom `role`. Satu request PATCH dan siapa pun jadi admin, lalu lolos ke
`events_admin_full_access` dan bisa menerbitkan event apa pun.

**Yang dilakukan:** menambah `REVOKE UPDATE (role) ON users FROM authenticated, anon;`.
Promosi admin hanya lewat service_role.

### 4. Policy admin memanggil tabel yang juga ber-RLS → rekursi

**Di blueprint (§3.10):** subquery `EXISTS (SELECT 1 FROM users WHERE
users.id = auth.uid() AND users.role = 'ADMIN')` ditulis langsung di dalam policy.

**Masalahnya:** dua hal. (a) Subquery itu dievaluasi di bawah RLS tabel `users`;
begitu `users` punya policy yang sendirinya memanggil pengecekan admin,
PostgreSQL melempar `infinite recursion detected in policy for relation "users"`.
(b) Dijalankan per baris pada setiap scan `events`.

**Yang dilakukan:** dibungkus jadi `public.is_admin()` — `SECURITY DEFINER` +
`STABLE`, sehingga bypass RLS secara terkendali dan hasilnya di-cache per
statement.

### 5. `handle_new_user()` tanpa `search_path` terkunci

**Di blueprint (§3.9):** fungsi `SECURITY DEFINER` tanpa `SET search_path`.

**Masalahnya:** ini kelas kerentanan yang dikenal (CVE-2018-1058). Fungsi
`SECURITY DEFINER` berjalan dengan hak pemiliknya; kalau `search_path` tidak
dikunci, pihak yang bisa membuat objek di schema lain dapat membajak resolusi
nama di dalam fungsi. Supabase Security Advisor akan menandai ini.

**Yang dilakukan:** `SET search_path = public, pg_temp` di semua fungsi
`SECURITY DEFINER`, plus `ON CONFLICT (id) DO NOTHING` supaya idempoten.

### 6. Policy `FOR ALL` tanpa `WITH CHECK`

**Di blueprint (§3.10):** `CREATE POLICY "saved_events_own" ON saved_events FOR
ALL USING (auth.uid() = user_id);`

**Masalahnya:** `USING` menyaring baris yang **dibaca**; `WITH CHECK` menyaring
baris yang **ditulis**. Tanpa `WITH CHECK`, user masih bisa meng-INSERT baris
dengan `user_id` orang lain.

**Yang dilakukan:** `WITH CHECK` ditulis eksplisit di setiap policy `FOR ALL`.

---

## 🟠 Membuat fitur tidak bekerja sebagaimana dimaksud

### 7. `dedup_hash` mengikutkan `source_url` → dedup gagal

**Di blueprint (§7 langkah 4b):** `dedup_hash = sha256(title + organizer + source_url)`.

**Masalahnya:** event yang sama hampir selalu muncul di beberapa URL — halaman
listing, halaman detail, mirror, URL dengan parameter pelacakan. Karena
`source_url` ikut di-hash, tiap URL menghasilkan hash berbeda dan duplikat
lolos semua. Fitur dedup gagal justru pada kasus yang paling sering terjadi.

**Yang dilakukan:** hash dihitung dari `title + organizer` yang dinormalisasi
(lowercase, whitespace dirapikan). Diimplementasikan dua kali — di SQL
(`public.compute_dedup_hash`) dan di Python (`models.compute_dedup_hash`) —
dengan normalisasi identik, dan diuji.

### 8. `event_type` hanya punya dua nilai

**Di blueprint (§3):** `CREATE TYPE event_type AS ENUM ('LOMBA', 'BEASISWA');`

**Masalahnya:** README repositori dan §1 menyebut magang, workshop, dan
"kegiatan pengembangan lain". Dengan enum dua nilai, semua itu tidak punya
tempat dan terpaksa dimasukkan sebagai `LOMBA` — data yang salah sejak hari
pertama, dan filter "Jenis" jadi tidak ada gunanya.

**Yang dilakukan:** enum diperluas ke `LOMBA, BEASISWA, MAGANG, WORKSHOP,
KONFERENSI, PELATIHAN, VOLUNTEER`.

### 9. Aturan `<DeadlineTag/>` tidak punya keadaan "sudah lewat"

**Di blueprint (§5.1):** aturannya berhenti di `days_left <= 2 → urgent`.

**Masalahnya:** `days_left` negatif juga memenuhi `<= 2`, jadi event yang
tenggatnya lewat tiga bulan lalu tetap dicat merah "mendesak". Merah palsu
melatih pengguna mengabaikan merah yang asli.

**Yang dilakukan:** menambah keadaan `closed` untuk `days_left < 0`, memakai
warna netral. Ambang lain persis seperti di blueprint dan diuji satu per satu.

### 10. Selisih hari yang dihitung dari milidetik menghasilkan H-n yang salah

**Tidak diatur di blueprint**, tapi menentukan.

**Masalahnya:** `(deadline - now) / 86400000` menghitung selisih 24-jam, bukan
selisih hari kalender. Tenggat besok pukul 08:00 yang dilihat malam ini pukul
20:00 akan terbaca "H-0". Label H-n adalah janji ke pengguna; salah satu hari
berarti seseorang kehilangan kesempatan.

**Yang dilakukan:** kedua tanggal diproyeksikan ke awal hari kalendernya di
`Asia/Jakarta` lebih dulu, baru dikurangi. Ada uji khusus untuk kasus lintas
tengah malam UTC.

### 11. Kategori dari LLM bisa lolos sebagai teks bebas

**Di blueprint (§7):** sudah benar meminta enum, tapi tidak menyebut dari mana
enum itu diambil.

**Yang dilakukan:** daftar enum dibaca dari tabel `categories` saat runtime
(`publisher.fetch_category_slugs`), bukan ditulis tangan di kode. Menambah
kategori cukup `INSERT`, tanpa deploy ulang scraper.

---

## 🟡 Keputusan produk & rekayasa

### 12. Publik boleh membaca event berstatus `EXPIRED`

**Di blueprint (§3.10):** `USING (status = 'APPROVED')`.

**Alasan menyimpang:** job expiry harian mengubah status secara otomatis. Kalau
`EXPIRED` langsung tidak terbaca, setiap halaman event yang sudah ramai dan
ter-index berubah jadi 404 dalam semalam. Untuk produk yang hidup dari
pencarian organik, itu kerugian permanen.

**Yang dilakukan:** RLS mengizinkan `APPROVED` dan `EXPIRED`; yang menyaring
listing adalah query aplikasi, bukan RLS. Halaman tetap tayang dengan penanda
"Pendaftaran ditutup".

### 13. Palet warna: Indigo #4F46E5 di atas Zinc 950 → Cobalt #2B50EC + light mode

**Alasan:** kombinasi Indigo-600 di atas Zinc-950 adalah tampilan default
de-facto dasbor hasil generate. Selain itu produk ini dibaca siang hari di
ruang terang — dark-only adalah keputusan estetika, bukan keputusan pengguna.

**Yang dipertahankan:** seluruh **nama token** dan struktur skala persis seperti
§4 (`--color-accent`, `--color-deadline-*`, `--space-*`, `--radius-*`, dst),
plus semua larangan (tanpa gradasi neon, tanpa ilustrasi 3D, transisi 150–200ms).

**Yang diubah:** nilai hue-nya, dan ditambahkan varian light mode. Accent tetap
di keluarga biru **secara sengaja**: hijau/kuning/merah sudah dipesan oleh
semantic dan deadline state. Kalau accent ikut masuk ke hue itu, pengguna tidak
bisa lagi membedakan "tombol" dari "peringatan".

### 14. Dasbor admin ada di Phase 1, tapi `users` baru aktif di Phase 2

**Di blueprint (§8):** kontradiksi antar tabel roadmap — Phase 1 meminta dasbor
approve/reject, sementara tabel `users` (satu-satunya tempat kolom `role`) baru
masuk di Phase 2.

**Yang dilakukan:** gerbangnya ditulis sekarang dan sudah benar
(`checkAdminAccess()` memeriksa sesi lalu `users.role`). Di mode data contoh
halaman terbuka dan ditandai jelas sebagai pratinjau. Begitu Supabase terpasang,
gerbang berlaku penuh — tidak ada langkah "pasang autentikasi nanti" yang
gampang terlupakan.

### 15. Index `idx_events_dedup` dihapus

`dedup_hash` sudah `UNIQUE`, dan constraint UNIQUE otomatis membuat index.
Index kedua di kolom yang sama hanya memperlambat setiap INSERT scraper tanpa
mempercepat apa pun.

### 16. `<DeadlineTag/>` dirender di server, bukan di klien

**Di blueprint (§5.1):** "Dihitung ulang di client-side tiap render, bukan cache statis."

**Yang dilakukan:** komponennya Server Component, dan halaman yang memakainya
dirender dinamis (`force-dynamic`) sehingga nilainya dihitung ulang **setiap
request**. Maksud aturan itu — melarang H-n yang membeku di build output atau
di database — terpenuhi, tanpa mengirim JavaScript ke browser dan tanpa risiko
ketidakcocokan antara jam server dan jam perangkat pengguna.

### 17. Kolom tambahan di `events`

`slug` (URL kanonik untuk SEO — `/events/<uuid>` praktis tidak bisa di-rank),
`location`, `is_online`, `updated_at`, `rejection_reason`, dan `saved_count`
(denormalisasi supaya `popularity_boost` di §6 tidak perlu `COUNT(*)` join di
setiap request beranda).
