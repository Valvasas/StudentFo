# Evaluasi pengunjung kritis — StudentFo (20 Oktober 2026)

Satu berkas untuk semua penilaian: **desain, algoritma, fitur, apakah sistemnya
berjalan, kenyamanan, dan kebermanfaatan.** Ditulis dari sudut pandang
pengunjung yang judes dan menilai sampai hal terkecil, tetapi setiap klaim di
sini harus bisa ditunjuk ke bukti (perintah, angka, atau tes). Penilaian yang
murni opini ditandai sebagai opini.

| | |
|---|---|
| Objek | Build produksi mode seed (`ALLOW_DEMO_IN_PRODUCTION=true`), kode di working tree branch `claude/wonderful-sagan-hk51yg` (belum di-commit saat laporan ditulis) |
| Cakupan | `TEMUAN.md` T1–T15 (perbaikan + verifikasi ulang), audit semua fitur, fitur baru **Pencocokan tim** (`/teams/cocok`), tur pengunjung |
| Alat | Playwright (Chromium) di 2 viewport, axe-core, Vitest, `psql`, PostgREST sungguhan |
| Bukan | Uji pengguna sungguhan, uji di perangkat fisik, uji dengan Supabase Auth/Google OAuth/Turnstile asli (lihat § 2) |

---

## 1. Ringkasan

**Putusan jujur:** siap dipakai sebagai situs demo dan siap melangkah ke staging.
**Belum** siap dibuka ke publik luas sampai empat hal di § 9 diputuskan pemilik
(terapkan migration, tinjauan hukum Kebijakan privasi, konfigurasi host demo,
jalur Supabase asli diuji di staging). Tidak ada temuan yang menghalangi tanpa
jalan keluar.

Skor di bawah adalah **opini saya**, bukan pengukuran; alasannya ada di § 6.

| Dimensi | Skor /10 | Satu kalimat |
|---|---|---|
| Desain | 8 | Satu bahasa visual yang tenang dan konsisten; kelemahan: halaman hasil pencocokan di ponsel sangat panjang |
| Algoritma | 7 | Model komplementer yang bisa dijelaskan dan teruji; kelemahan: tanpa umpan balik, data diri tak terverifikasi, jendela kandidat berdasarkan keterbaruan |
| Fitur | 8 | Alur utama lengkap dari katalog sampai studio penyelenggara; pesan & diskusi baru berupa demo |
| Sistem berjalan | 8 | 0 galat konsol tak disengaja di 112 kunjungan; semua lapisan teruji; jalur Supabase asli belum pernah dijalankan end-to-end |
| Kenyamanan | 8 | Keyboard, target sentuh, tanpa-JS, reduced-motion, 320–1366 px terbukti; email ikut di URL galat masuk |
| Kebermanfaatan | 7 (opini) | Janji intinya jelas dan jujur; nilainya bergantung pada cakupan katalog dan jumlah pengguna, yang tidak bisa dinilai dari data contoh |

**Yang diubah karena tur ini** (§ 8): dua belas temuan (N1–N12), ditemukan *setelah*
semua tes hijau — overflow halaman di ponsel saat animasi, dua saringan yang
menghasilkan hasil kosong di data contoh, gaya "juara" yang malah menurunkan
skor orang paling berpengalaman, label "Satu kota" untuk kota tetangga,
portofolio lapor-sendiri tampil seperti fakta, jejak "contoh" di Kebijakan
privasi, dan target sentuh 31 px. Semuanya diperbaiki dan dikunci dengan tes
yang terbukti gagal tanpa perbaikannya.

---

## 2. Cara uji dan batasnya

1. **Tur otomatis** (`112` kunjungan): 56 halaman × desktop 1366×850 dan ponsel
   390×844, sebagai Tamu (22 rute), Mahasiswa (23), Penyelenggara (5), Admin (6).
   Dicatat: status HTTP, judul, `h1`, overflow horizontal, galat konsol & respons
   ≥400, gambar rusak/tanpa `alt`, kata terlarang (`demo`, `contoh`, `fiktif`,
   `seed`, `scraping`, `undefined`, `NaN`, …), LCP, CLS, tangkapan layar penuh.
2. **Tur pencocokan** khusus: bingkai animasi di 150–4200 ms, isi hasil di 11 varian
   saringan, kasus tepi form, ajak/lewati, ponsel 390 px.
3. **Uji perilaku**: form masuk kosong/palsu, 6 pencarian bermusuhan
   (`<script>`, `'; DROP TABLE`, 400 karakter, `%`, spasi), 6 parameter halaman
   aneh, 16 tab-stop keyboard pertama.
4. **Suite otomatis**: Vitest, tes SQL (21 berkas, termasuk uji mutasi),
   integrasi PostgREST sungguhan, e2e Playwright 3 proyek (terang, gelap, ponsel)
   dengan axe-core.

**Batas yang tidak bisa saya tutup dari sini:**
- Mode seed saja. Masuk email/Google, konfirmasi email, Turnstile, dan Storage
  nyata **belum pernah dijalankan end-to-end** di lingkungan ini (hanya lapisan
  repository→PostgREST→Postgres yang terbukti).
- Angka kecepatan (muat median 0,7 dtk, LCP maks 0,65 dtk) berasal dari
  server lokal dengan data di memori. Itu bukan prediksi performa produksi.
- Tidak ada perangkat fisik (Safari iOS, WebView Instagram/TikTok — sudah ada di `TASKS.md`).
- "Kebermanfaatan" tidak bisa diukur tanpa pengguna; skornya opini.

---

## 3. Persona penguji

**Raka, 21, mahasiswa semester 5.** Pernah tertipu info lomba palsu di grup
WhatsApp, tidak percaya situs yang terlalu mulus, membaca footer, mengetik
sembarang di setiap kolom, menekan Tab sebelum menekan apa pun, dan menilai
"kalau ini gratis, apa untungnya buat mereka?".

Lima detik pertama Raka (beranda tamu, desktop): *"Judulnya jelas — lomba,
beasiswa, magang dari sumber yang jelas. Ada tombol Jelajahi dan Buat akun. Banner
atas mengaku demo, jujur. Kartu 'Segera ditutup' langsung berisi tenggat dan
harga. Belum ada alasan untuk pergi."* Satu keluhan: hero tidak menunjukkan
produknya, hanya kalimat.

---

## 4. Verifikasi temuan `TEMUAN.md` (T1–T15)

Status diukur ulang di build final, bukan diasumsikan dari kode.

| # | Temuan | Status | Bukti |
|---|---|---|---|
| T1 | Login memamerkan peran Admin | ✅ | `/login` = form email + sandi + satu tautan "Lihat pratinjau". `/demo` menawarkan 3 persona tanpa Admin. Kunci salah/kosong tidak membuka Admin. Host tak terdaftar → 404. (`access-hardening.spec.ts`, tangkapan `rootlogin`, `rootdemo`) |
| T2 | `/admin` membocorkan dirinya | ✅ | Tamu, Mahasiswa, Penyelenggara: `/admin` dan `/admin/riwayat` = **404 yang sama** dengan alamat ngawur, judul "Halaman tidak ditemukan", `robots.txt` tidak menyebutnya |
| T3 | Bahasa internal di panel Admin | ✅ | "Kegiatan dari sumber otomatis"; teks `ADMIN`/"seed lokal" hilang. *Tersisa*: sumber seed memakai `example.org` (lihat § 9) |
| T4 | Jejak "demo/contoh/fiktif" | ✅ (+1 sisa baru ditutup) | Satu banner. Tur menemukan sisa yang lolos: Kebijakan privasi menyebut "mode data contoh", persona memakai `linkedin.com/in/contoh` dan "Contoh lomba…". Ditutup. Sisa yang sah: contoh isian ("Contoh: 150000") dan pratinjau peta tamu ("Contoh bentuk peta") |
| T5 | Tentang/privasi terlihat draf | ✅ | "Yang belum kami lakukan" → "Yang perlu kamu tahu sebelum mulai". Lencana DRAF **tetap tampil, disengaja**, sampai pemilik mengisi env hukum (§ 9) |
| T6 | Judul tab salah | ✅ | 404 punya judul sendiri; `?tab=` di kegiatan/Koneksi/Profil memberi judul per tab ("Syarat & berkas · …", "Lamaran · Profil") |
| T7 | Bahasa visual tak seragam | ✅ | `/teams`, `/connections` berkepala polos seperti `/events`; tanpa tint pastel acak. Ilustrasi besar hanya di pencocokan |
| T8 | "Pendaftaran" ganda | ✅ | Papan lamaran · Pendaftaran & pembayaran · tab "Lamaran" |
| T9 | Kategori di halaman yang tak butuh | ✅ | Navbar ringkas di masuk/daftar/demo, admin, studio, `/profile/*` |
| T10 | Email terpotong | ✅ | `BreakableEmail`, putus di `@`/`.`, tetap utuh saat disalin |
| T11 | Dua pemberitahuan sekaligus | ✅ | `registration_awaiting_payment` tak dirayakan lagi |
| T12 | Kartu "Perlu tindakan" kosong meregang | ✅ | `items-start` |
| T13 | "Studio penyelenggara" untuk semua peserta | ✅ | Diganti "Jadi penyelenggara" di "Lainnya" |
| T14 | "Hanya kamu" terbaca sebagai tab | ✅ | Ikon gembok menempel di tab |
| T15 | "Data lembaga" tanpa penjelasan; tanggal `mm/dd/yyyy` | ✅ | Penjelasan + gema "Sabtu, 12 Desember 2026" |

---

## 5. Audit fitur

"Berjalan" = dijalankan oleh tes otomatis **dan** dikunjungi di tur tanpa galat.

| Area | Hasil | Catatan |
|---|---|---|
| Katalog, filter `/events` (tanpa JS), pencarian, detail + tab | ✅ | Pencarian bermusuhan: semua 200, tanpa XSS; `page=-1/99999/abc` aman |
| Simpan, tracker (Papan lamaran), portofolio & hasil | ✅ | Hasil dilaporkan sendiri dan ditandai begitu di profil |
| Rekomendasi personal + cold start | ✅ | |
| Tim (buka, gabung, keluar, hapus) | ✅ | |
| **Koneksi** (untukmu, ajak/terima/tolak, peta, blokir, pengaturan, kursor) | ✅ | 8 e2e + 8 integrasi |
| **Profil** (tampilan, data diri, minat, personalisasi, pengaturan, privasi) | ✅ | Judul tab per halaman; email panjang aman |
| **Pengaturan** | ✅ (demo) | Pilihan notifikasi tersimpan di perangkat; pengiriman email/WhatsApp **belum aktif** dan diberi tahu apa adanya |
| Pendaftaran formulir internal + pembayaran + studio + galeri | ✅ | Alur lintas peran teruji |
| Admin: moderasi, riwayat, kalibrasi, promosi, penyelenggara | ✅ | |
| Kirim kegiatan (tamu), notifikasi, batas laju | ✅ | |
| **Pencocokan tim** (baru) | ✅ | § 7 |
| Pesan, Ruang diskusi | ⚠️ demo saja | Tersimpan di perangkat; backend belum ada (`TASKS.md`, ADR-039) |
| Masuk email / Google / konfirmasi / reset | ⚠️ tak teruji nyata | Di mode seed jujur berkata "belum aktif di situs pratinjau"; jalur Supabase hanya dibaca dari kode |

---

## 6. Penilaian per dimensi

### Desain — 8/10
**Baik.** Satu bahasa: krem, tinta, stabilo kuning; tipografi tegas; kartu dengan
hierarki jelas (jenis → judul → penyelenggara → tenggat/harga). Tidak ada
dekorasi bertele-tele; "momen" (pencocokan, perayaan hasil) sengaja dipisah dari
halaman kerja. Sapuan radar kini kuning stabilo (tadinya kelabu kusam, terlihat
di tangkapan 1100 ms).
**Dikritik.**
- Halaman hasil pencocokan di ponsel ±5.800 px untuk 6 kartu (±800 px per kartu).
  Orang yang mencari akan menggulir jauh sebelum membandingkan dua orang.
- Beranda tamu hanya teks + kartu; tidak ada gambaran produk (tangkapan layar
  atau contoh kartu terpersonalisasi).
- Skor di bawah ±40 berlabel "Kandidat Menarik": angka dan label saling menyiratkan
  hal yang berbeda.
**Yang menaikkan skor:** mode ringkas kartu (nama, skor, satu alasan) di ponsel;
satu gambaran produk di hero.

### Algoritma — 7/10
Lihat § 7 untuk rincian. **Kekuatan:** model komplementer (bukan "mirip"),
bobot dan alasan terlihat pengguna, deterministik, saringan berbentuk URL,
privasi timbal-balik, uji properti. **Kelemahan:**
- Keahlian dan portofolio **diklaim sendiri**. Kini ditandai "(laporan sendiri)",
  tetapi peringkat tetap memakainya. Ini batas yang diketahui, bukan kebocoran.
- **Tanpa umpan balik.** "Lewati" hanya state klien, ajakan diterima/ditolak tidak
  memengaruhi peringkat. Bobot ditentukan tangan, belum dikalibrasi dari data.
- **Jendela kandidat = 200 (maks 400) kartu terbaru**, bukan yang paling relevan.
  Di atas ±400 kartu terbuka, kandidat bagus yang kartunya lama tak tersentuh
  tidak pernah dipertimbangkan. Aman untuk peluncuran; perlu pra-saring di SQL
  (kota/keahlian) saat kartu terbuka mendekati angka itu.
- Jarak = titik pusat kota (±belasan km), dibulatkan 5 km: membedakan
  Jakarta Selatan dari Pusat tidak mungkin. Disengaja demi privasi.

### Fitur — 8/10
Alurnya utuh dari menemukan kegiatan → mencatat → membentuk tim → mendaftar →
dikelola penyelenggara → dimoderasi. Pencocokan menutup celah "cari tim" yang
tadinya hanya daftar tim. Dikurangi: pesan/diskusi belum nyata; pengingat email/
WhatsApp belum ada; tidak ada pengumuman massal untuk pendaftar.

### Sistem berjalan — 8/10
112 kunjungan: **0** galat konsol tak disengaja, **0** respons ≥400 tak disengaja
(404 admin/ngawur disengaja), **0** gambar rusak, **0** halaman tanpa tepat satu
`<main>`, **0** overflow horizontal. Muat median 726 ms desktop/692 ms ponsel
(lokal), CLS maks 0,002. Lapisan DB: 21 berkas tes SQL (dengan uji mutasi),
90 tes integrasi PostgREST. **Dikurangi** karena jalur autentikasi asli belum
pernah dijalankan di sini.

### Kenyamanan — 8/10
**Terbukti:** tautan "Lompat ke konten utama" adalah tab-stop pertama; 16 tab-stop
pertama semuanya punya outline 2 px; target sentuh ≥44 px (tes per halaman);
tanpa JS: katalog, filter, pencocokan (pemindaian CSS berakhir sendiri);
reduced-motion langsung ke keadaan akhir; tanpa geser horizontal di 320/375/390/1366;
axe-core 0 pelanggaran di 3 proyek.
**Dikritik:**
- Email diketik ikut ke URL saat masuk gagal (`/login?error=…&email=…`): tercatat di
  log server dan riwayat peramban. Pola lama yang disengaja (agar tak mengetik
  ulang), diredam `Referrer-Policy`, tapi tetap kebocoran kecil. Pertimbangkan
  cookie sekali-pakai.
- Di sandbox demo, kartu pemain pengunjung lain **sempat** tampil sebagai kandidat
  (nama persona sama, "Dinda Pratiwi" berulang) dan kalimat pengantar bebas (≤140
  karakter) terbaca orang asing — ditemukan di tur, lalu **diperbaiki** (N12):
  store demo kini hanya mencalonkan orang contoh. Tersisa dari pola yang sama:
  tim buatan pengunjung tetap dibagi (data demo dibagi, direset tiap 6 jam; banner
  Admin menyebutnya).

### Kebermanfaatan — 7/10 (opini)
Janji produk jujur dan terbukti di UI: setiap kegiatan menautkan sumber asli,
tenggat dihitung ulang tiap permintaan, biaya "belum diketahui" tidak
disamakan dengan gratis, promosi selalu berlabel. Raka bertanya "untungnya
apa buat mereka?" — jawabannya ada: promosi berlabel dan studio penyelenggara.
**Risiko, bukan cacat:** nilai katalog bergantung pada cakupan sumber (data
contoh hanya 24 kegiatan; 10+ sumber nyata masih di backlog), dan nilai
pencocokan bergantung pada jumlah kartu terbuka per kota. Dengan sedikit pengguna,
halaman hasil kosong — keadaan kosongnya sudah menawarkan jalan keluar
("Saringanmu terlalu ketat" → hapus saringan), tetapi tidak ada "undang teman".

---

## 7. Bedah Pencocokan tim

### Model
Skor 0–100 = jumlah berbobot enam komponen (jumlah bobot = 1):

| Komponen | Bobot | Ukuran |
|---|---|---|
| Keahlian | 0,34 | 0,75 × cakupan yang kamu cari (persis = 1, sebidang = ½) + 0,25 × domain baru yang ia bawa |
| Jarak | 0,18 | e^(−km/350); ≤15 km = 1; lantai 0,5 bila keduanya bersedia daring; kota tak dikenal = 0,3 |
| Portofolio | 0,16 | Lima entri terbaik, tiap entri berikutnya ×0,75, jenuh 1−e^(−poin/1,8); gaya mengubah cara menilai |
| Minat | 0,14 | Irisan minat + jurusan sama |
| Saling butuh | 0,12 | Apakah **ia** mencari yang ada padamu |
| Jenjang | 0,06 | 1/(1+selisih) |

Saringan keras (jarak, keahlian wajib, portofolio ada/juara, jenjang sama)
dijalankan sebelum skor; yang sudah terhubung tidak dicalonkan lagi.

### Hasil tur (viewer: Bandung, bisa web+data, mencari UI/UX & pemasaran)

| Peringkat | Orang | Skor | Mengapa masuk akal |
|---|---|---|---|
| 1 | Rizky H. (Jakarta Selatan, ±115 km) | 86 | Membawa UI/UX *dan* pemasaran, ia mencari data & web (saling butuh), juara 1 |
| 2 | Citra L. (Denpasar, ±860 km) | 60 | Punya UI/UX, mencari web — **di atas** orang satu kota (lihat bawah) |
| 3 | Fajar R. (Surabaya) | 36 | Mencari web, minat bisnis |
| 4 | Arif S. (Bandung, satu kota) | 34 | Satu kota, tetapi tidak membawa yang dicari |
| 5 | Yoga P. (Cimahi, berdekatan) | 33 | Dekat, video |

*Kenapa orang Bali di atas orang Bandung?* Bukan bug: keahlian + saling butuh
(0,46) mengalahkan jarak (0,18) selama keduanya bersedia daring, dan kartunya
menyebut alasannya ("Punya Desain UI/UX yang kamu cari"). Pengguna yang ingin
tatap muka punya saringan "Hanya yang bisa bertemu langsung".

| Varian URL | Hasil | Perilaku |
|---|---|---|
| `?jarak=25&daring=0` | Arif (Bandung), Yoga (Cimahi) | ✅ tadinya **kosong** (lihat § 8) |
| `?portofolio=juara` | Rizky | ✅ tadinya **kosong** |
| `?keahlian=ui-ux` | Rizky, Citra | ✅ |
| kombinasi ketat | 0 + "Saringanmu terlalu ketat" + tombol hapus | ✅ keadaan kosong menolong |
| `?jarak=abc&gaya=<script>&tampil=999999&keahlian=../../etc` | hasil bawaan, 200 | ✅ nilai asing diabaikan, bukan galat |
| `?tampil=24` | semua 11 kandidat | ✅ |

**Privasi (terbukti):** hasil tanpa `@` dan tanpa email; kartu bawaan tertutup;
mencari mewajibkan kartu terbuka sendiri; pengantar berisi `<img onerror>`
disimpan tanpa markup (server membuangnya; 0 elemen tersuntik di halaman); orang yang memblokir/
diblokir tak saling terlihat (SQL + integrasi PostgREST).

**Animasi (terukur):** pemindaian ±2,9 dtk murni CSS; tanpa JS berakhir sendiri;
reduced-motion langsung ke hasil; radar masuk viewport walau form disimpan dari
dasar halaman; halaman tidak lagi melebar selama sapuan berputar di 320–390 px.

---

## 8. Temuan baru dari tur ini

Semua di bawah ditemukan **setelah** suite hijau, yaitu tes yang ada tidak
menangkapnya. Tiap perbaikan punya tes yang terbukti gagal tanpanya.

| # | Temuan | Keparahan | Perbaikan | Bukti |
|---|---|---|---|---|
| N1 | Halaman melebar sementara di ponsel saat radar berputar (kotak persegi berputar melewati lebar layar; tes lama berjalan dengan reduced-motion sehingga tak melihatnya) | Sedang | Radar dipotong lingkaran (`overflow-hidden rounded-full`) | e2e baru mengukur `scrollWidth` tiap frame selama 4,5 dtk dengan gerak normal; gagal di build lama |
| N2 | `jarak ≤25 km` → **0 hasil** untuk persona demo (Bandung): dua orang Bandung sudah terhubung dengannya | Sedang (demo terlihat rusak) | Arif → Bandung, Yoga → Cimahi | Tes memori + e2e; tes memori gagal bila seed dikembalikan (dicoba) |
| N3 | `Pernah juara` → **0 hasil** (satu-satunya juara sudah terhubung) | Sedang | Rizky juara 1 | Tes memori gagal bila seed juara dihapus (dicoba) |
| N4 | Gaya "Cari yang berpengalaman" **menurunkan** skor orang paling berpengalaman (86→84) | Sedang (membingungkan) | Gaya juara = seimbang + bonus; tak pernah di bawah seimbang | Tes properti di 7 portofolio |
| N5 | "Satu kota denganmu (Bandung)" untuk kandidat di Cimahi; label jarak "Satu kota" di sebelah nama kota lain | Rendah (klaim keliru) | "Berdekatan" untuk 1–15 km; "Satu kota" hanya jarak 0 | Tes Bandung–Cimahi |
| N6 | "terbaik Juara 1" tanpa catatan bahwa hasil dilaporkan sendiri | Sedang (kejujuran) | "(laporan sendiri)" | tes `describePortfolio` |
| N7 | Kebijakan privasi memakai bahasa internal ("mode data contoh") dan data persona "contoh" | Sedang | Kalimat ditulis ulang; persona dinamai realistis | tur ulang: tanpa sisa |
| N8 | Nama kandidat sebagai tautan 23–31 px | Rendah | Pola `-my-3 min-h-11` seperti kartu Koneksi | `touch-targets.spec` 3 proyek |
| N9 | Tes "Tampilkan lebih banyak" **selalu dilewati** (kandidat < 1 halaman): jalur paginasi tanpa bukti | Rendah | Tes membuat 8 akun sendiri | lulus 3 proyek, 0 dilewati |
| N10 | Jalur Supabase pencocokan tak pernah dijalankan | Sedang | 7 tes integrasi PostgREST | 3 mutasi migration (kartu tertutup, `is_discoverable`, blokir) semuanya tertangkap |
| N11 | Filter jarak tak menjelaskan bahwa yang bersedia daring tetap ikut | Rendah | Petunjuk tetap di grup saringan | — |
| N12 | Kartu pengunjung demo lain menjadi kandidat: hasil dipenuhi klon "Dinda Pratiwi" (semua di Bandung) yang menggeser orang contoh dari enam teratas, dan teks bebas seorang pengunjung terbaca orang asing | Sedang | Store demo hanya mencalonkan orang contoh (`isolateSeekers`); bawaan tes tetap mencerminkan SQL | Regresi e2e penuh: tes jarak lulus di proyek terang tetapi **gagal di gelap dan ponsel** (urutan paralel); sesudah perbaikan hasilnya persis 2 kartu di ketiganya |

---

## 9. Belum dikerjakan / butuh keputusan pemilik

1. **Terapkan migration `20261020100001` ke staging** (tidak saya lakukan —
   `CLAUDE.md` melarang tanpa konfirmasi). Urutan rilis: migration dulu, baru kode.
2. **Kebijakan privasi**: isi `PRIVACY_CONTACT_EMAIL` dan
   `PRIVACY_POLICY_EFFECTIVE_DATE` *hanya setelah* tinjauan hukum. Saya mengubah
   satu kalimat "Data di peramban" (menghapus rujukan ke "mode data contoh");
   **tinjau kalimat itu sebagai bagian dari naskah hukum**.
3. **Deploy demo publik**: `DEMO_ALLOWED_HOSTS` (kosong = demo ditolak) dan,
   bila persona Admin perlu dicoba, `DEMO_ADMIN_KEY`.
4. **Uji Supabase asli di staging**: daftar email + konfirmasi, Google OAuth,
   Turnstile, Storage. Sampai itu, "sistem berjalan" hanya terbukti sampai PostgREST.
5. `example.org` di sumber data seed tampak di antrean Admin demo (T3 sisa).
   Sengaja memakai domain cadangan RFC; mengganti dengan domain yang tampak asli
   berisiko menyerupai situs sungguhan.
6. Email di URL galat masuk (§ 6). Tim buatan pengunjung demo masih dibagi antar
   pengunjung (§ 6).
7. Mode "tim yang cocok" (peringkat *tim*, bukan orang) belum dibuat: butuh kolom
   keahlian-dicari per tim, dan belum ada bukti kebutuhan.
8. Umpan balik untuk algoritma (simpan "lewati"/ajakan sebagai sinyal teragregasi)
   dan pra-saring SQL bila kartu terbuka > ±400.

---

## 10. Lampiran — bukti dan cara mengulang

| Pemeriksaan | Hasil |
|---|---|
| `npm run verify` (typecheck, lint, 690 tes unit, kontras) | hijau |
| `npm run db:test` (migration + 21 berkas tes SQL) | hijau |
| `npm run test:integration` (PostgREST sungguhan) | 90/90 (7 baru untuk pencocokan) |
| e2e Playwright 3 proyek (terang, gelap, ponsel) + axe | **637 lulus, 0 gagal**, 182 dilewati. Semua skip adalah pembatasan proyek yang disengaja di kodenya (tes yang mengubah data demo bersama hanya jalan di satu proyek; menu samping tak ada di ponsel). Satu-satunya skip bersyarat-data yang dulu ada ("Tampilkan lebih banyak") sudah dihapus |
| `npm run verify` setelah perbaikan terakhir | 692 tes unit |
| Tur 112 kunjungan | 0 overflow, 0 galat konsol tak disengaja, 0 gambar rusak; muat median 726/692 ms; LCP maks 652/476 ms; CLS maks 0,002 |

Mengulang: `npm run verify && DATABASE_URL=postgresql://… npm run db:test &&
DATABASE_URL=postgresql://… npm run test:integration && npx playwright test`.
Skrip tur dan tangkapan layar (±40 MB) sengaja tidak di-commit (mengikuti
`TEMUAN.md`); skripnya hidup di folder scratchpad sesi dan mudah dibuat ulang:
Playwright, `page.goto` per rute, catat metrik di atas.
