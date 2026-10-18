# Audit UX & kesan profesional — 18 Oktober 2026

**Status: hanya temuan. Tidak ada kode aplikasi yang diubah.** Perbaikan menunggu keputusan pemilik.

## Cara audit

- Build produksi dijalankan di mode seed (`ALLOW_DEMO_IN_PRODUCTION=true`), lalu dikunjungi dengan Chromium (Playwright).
- **165 halaman** diambil layar penuh: tamu, Mahasiswa, Siswa baru, Penyelenggara, dan Admin, masing-masing di desktop (1366px) dan ponsel (390px).
- **6 video** alur nyata direkam, dan semuanya sudah ditonton ulang lewat tangkapan layar.
- Semua media ada di folder ini:

| Isi | Lokasi |
|---|---|
| Desktop | `desktop/<peran>__<halaman>.jpg` |
| Ponsel | `mobile/<peran>__<halaman>.jpg` |
| Video | `video/01…06-*.webm` (tamu desktop, tamu ponsel, mahasiswa, penyelenggara, admin, mahasiswa ponsel) |
| Data mentah | `_report.json` (status HTTP, judul, overflow, error konsol, teks tiap halaman) |

- Media sengaja **tidak di-commit** karena ±40 MB. Folder ini hanya hidup selama sesi ini.
- Pemeriksaan otomatis:
  - Tidak ada scroll horizontal di 165 halaman.
  - Tidak ada error konsol, selain 404 yang memang disengaja.
  - Semua halaman publik dan terproteksi memberi status yang benar.
- **Batas audit.** Halaman login/daftar/lupa sandi versi **Supabase asli** tidak bisa dilihat, karena build ini berjalan di mode seed. Itu hanya dibaca dari kode, belum dilihat di layar.

## Ringkasan

| # | Temuan | Berlaku di produksi? | Prioritas |
|---|---|---|---|
| T1 | Login menampilkan kartu "Admin moderator", "Penyelenggara", dan seterusnya | Tidak, hanya mode demo, tapi situs demo publiknya terekspos | **Tinggi** |
| T2 | `/admin` bisa dibuka siapa pun dan menjelaskan dirinya | **Ya** | **Tinggi** |
| T3 | Bahasa internal bocor di halaman Admin | Sebagian | **Tinggi** |
| T4 | Teks dan data "demo/contoh/fiktif" tersebar di banyak halaman | Tidak, hanya mode demo | Sedang |
| T5 | Halaman Tentang memuat daftar kekurangan dan draf hukum | **Ya** | Sedang |
| T6 | Judul tab (`<title>`) salah atau seragam | **Ya** | Sedang |
| T7 | Bahasa visual tidak seragam antar halaman | Ya | Sedang |
| T8 | Istilah "Pendaftaran" dipakai untuk tiga hal berbeda | Ya | Sedang |
| T9 | Navigasi kategori muncul di halaman yang tidak butuh | Ya | Rendah |
| T10–T15 | Detail kecil | Ya | Rendah |

---

## T1 — Halaman login memamerkan semua peran (temuan lo)

**Lihat:** `desktop/tamu__login.jpg`, `mobile/tamu__login.jpg`, `desktop/tamu__register.jpg`

**Yang tampil:**
- Daftar empat kartu: *Mahasiswa*, *Siswa baru*, **Admin moderator** ("Tinjau dan setujui kegiatan masuk"), *Penyelenggara*.
- Di bawahnya "Data akun demo sementara dan terhapus saat kamu keluar."
- `/register` memakai tombol "Coba dengan akun demo".
- Halaman terproteksi (`/pembayaran`, `/profile`, `/messages`, `/discussions`, `/penyelenggara`, `/…/formulir`) mengalihkan tamu ke halaman yang sama.

**Kenapa bermasalah:**
- Mengumumkan bahwa ada peran Admin, dan satu klik langsung masuk ke antrean moderasi. Ini bukan standar produk produksi.
- Untuk calon pengguna sungguhan, halaman login terbaca seperti prototipe, bukan layanan.
- Tidak ada form email dan kata sandi di situs demo, jadi pengunjung tidak bisa melihat seperti apa login yang sebenarnya.

**Yang perlu diketahui:**
- Kartu ini hanya muncul saat `dataMode === 'seed'`. Dengan Supabase terpasang, halaman login berganti ke form email + Google.
- Risikonya ada di **situs demo yang dipublikasikan**, dan di flag `ALLOW_DEMO_IN_PRODUCTION`. Kalau flag itu menyala di deploy yang salah, kartu admin ikut tampil di domain produksi.

**Rekomendasi (belum dikerjakan):**
1. Pisahkan demo dari situs utama: subdomain `demo.` atau rute tersembunyi (`/demo`) yang tidak ditautkan dari mana pun. `/login` tetap form biasa.
2. Jangan tawarkan persona **Admin** di halaman publik. Cukup Mahasiswa dan Penyelenggara. Admin demo cukup lewat tautan khusus yang dikirim ke calon pengguna tertentu.
3. Beri satu penjaga tambahan di build produksi: demo hanya hidup bila `ALLOW_DEMO_IN_PRODUCTION` menyala **dan** host-nya cocok. Itu mencegah demo muncul di domain produksi karena salah konfigurasi.
4. Tambahkan form email + sandi asli di `/login` walau situsnya demo, supaya tampilannya mewakili produk sebenarnya.

---

## T2 — `/admin` membocorkan keberadaannya

**Lihat:** `desktop/tamu__admin.jpg`, `desktop/mahasiswa__admin.jpg`

**Yang tampil:**
- Tamu: "Akses terbatas — **Masuk dengan akun admin** untuk membuka antrean moderasi" plus tombol Masuk.
- Peserta biasa: "Akunmu tidak punya peran admin. Hubungi pengelola kalau ini keliru."
- Judul tab keduanya "Antrean moderasi · StudentFo".
- Pola yang sama di `/admin/riwayat`, `/admin/kalibrasi`, `/admin/promosi`, `/admin/penyelenggara`. Gue baca kodenya di `src/app/admin/*/page.tsx`.

**Kenapa bermasalah:**
- Ini **berlaku di produksi**, bukan hanya demo.
- Mengonfirmasi bahwa panel admin ada di `/admin` dan memberi petunjuk cara masuk. Standar industri adalah menjawab seolah halamannya tidak ada.
- Judul tab mengungkap isi halaman ("Antrean moderasi") ke siapa pun, termasuk riwayat browser dan mesin pencari.
- Tidak ada kebocoran data, karena otorisasi di Server Action tetap dicek. Ini soal informasi dan citra.

**Rekomendasi:**
1. Untuk non-admin (tamu maupun peserta), kembalikan **404 yang sama** dengan halaman yang tidak ada.
2. Tidak ada tautan ke `/admin` di UI untuk non-admin.
3. Judul tab netral untuk non-admin, dan `noindex`.
4. Pertimbangkan jalur admin yang tidak mudah ditebak, ditambah `robots.txt` yang tidak menyebutnya.

---

## T3 — Bahasa internal bocor di panel Admin

**Lihat:** `desktop/admin__admin.jpg`

Teks yang terlihat oleh siapa pun yang masuk sebagai admin demo:
- "**Admin demo.** Keputusanmu mengubah data contoh yang dilihat semua pengunjung pratinjau… **Di produksi, halaman ini mensyaratkan akun berperan `ADMIN`.**"
- Tombol "Atur ulang data demo."
- "Sumber data saat ini: **`seed lokal`**."
- Kartu "Acara hasil **scraping**." Istilah teknis yang baru perlu bagi tim internal, bukan bagi moderator.
- Tautan sumber `example.org`.

**Rekomendasi:**
- Teks mode demo, kutipan peran `ADMIN`, dan "seed lokal" hanya tampil di mode demo. Di produksi hilang total.
- Ganti "hasil scraping" dengan istilah moderator ("Kegiatan dari sumber otomatis").

---

## T4 — Jejak "demo / contoh / fiktif" di mana-mana

Semua ini **hanya muncul di mode demo**, jadi aman di produksi. Tapi bila situs demo dipakai untuk presentasi atau uji pengguna, ini yang bikin terlihat belum jadi.

| Halaman | Teks atau data | Gambar |
|---|---|---|
| Semua halaman | Banner "Mode demo — semua kegiatan & tenggat di sini fiktif. **Reset pukul 02.22 WIB**" | semua |
| `/messages` | "1,2 MB · **contoh berkas**", "**Pesan demo** hanya tersimpan di perangkat ini", orang tiruan (Rani Prameswari, Dimas Arya) dengan lencana belum dibaca | `desktop/mahasiswa__messages.jpg` |
| `/discussions` | "**Utas contoh** · mode demo", "412 anggota" | `desktop/mahasiswa__discussions.jpg` |
| `/profile/settings` | "Tidak dipakai — **akun demo** masuk tanpa kata sandi", "**Hapus data demo**", "Mode demo: pilihan ini… belum mengirim email atau WhatsApp sungguhan" | `desktop/mahasiswa__profile_settings.jpg` |
| `/penyelenggara` | Nama lembaga "Himpunan Mahasiswa Informatika **(contoh)**" | `desktop/penyelenggara__penyelenggara.jpg` |
| Daftar pendaftar | Email `…@demo.studentfo.local`, `…@contoh.studentfo.local` | `desktop/penyelenggara__penyelenggara_acara_…_pendaftar.jpg` |
| `/pembayaran/<id>` | "Transfer ke BCA 0000000000 a.n. Panitia Contoh (**rekening fiktif mode demo**)" | `desktop/mahasiswa__status-pembayaran.jpg` |
| `/about` | "Angka dari data contoh mode demo — bukan statistik produk sungguhan" | `desktop/tamu__about.jpg` |
| `/events/<slug>` | "Disimpan 96 orang" dan angka sosial lain yang datang dari seed | `desktop/tamu__events_workshop-…jpg` |

Pola yang menolong: label demo selalu **jujur** dan jelas. Pola yang mengganggu: label tersebar di terlalu banyak tempat, dan beberapa menampilkan istilah teknis ("seed", "peramban ini").

**Rekomendasi:**
- Satu penanda demo yang konsisten (banner atas saja), bukan selusin kalimat di tiap kartu.
- Data contoh memakai nama dan domain yang meyakinkan, bukan `…(contoh)` dan `@demo.studentfo.local`.
- Waktu "Reset pukul 02.22 WIB" cukup berbunyi "Data diatur ulang tiap 6 jam."

---

## T5 — Halaman Tentang dan Kebijakan privasi terlihat belum final

**Lihat:** `desktop/tamu__about.jpg`, teks di `desktop/tamu__privacy-policy.jpg`

**Yang tampil:**
- `/about` memuat bagian **"Yang belum kami lakukan"**, berisi:
  - pengingat tenggat belum lewat email atau WhatsApp;
  - tidak ada pembayaran otomatis;
  - "Kebijakan privasi masih berstatus **draf** sampai ditinjau bersama penasihat hukum".
- `/privacy-policy` diberi lencana "**DOKUMEN · DRAF** — Draf 15 Oktober 2026".
- Statistik di Tentang: "16 kegiatan, **16 penyelenggara**". Angka yang sama persis terlihat mencurigakan, karena tiap kegiatan seolah punya penyelenggara unik.

**Kenapa bermasalah:** keterusterangan itu baik, tetapi menaruhnya di halaman publik produk yang diluncurkan memberi kesan belum siap, dan draf hukum yang terbuka bisa dipakai sebagai dasar komplain.

**Rekomendasi:**
- Sebelum rilis: kebijakan privasi final (lihat TASKS.md: perlu penasihat hukum), lalu hilangkan lencana draf.
- Bagian "Yang belum kami lakukan" dipindah ke catatan rilis internal atau FAQ, atau diganti "Yang akan datang".
- Cek perhitungan statistik penyelenggara di Tentang.

---

## T6 — Judul tab (`<title>`) salah atau seragam

Dari `_report.json` (judul tiap halaman):
- **404** memakai judul **beranda** ("StudentFo — Info lomba…"). Seharusnya "Halaman tidak ditemukan".
- Halaman detail kegiatan: tab Ringkasan / Syarat / Tahapan / Penyelenggara punya **judul yang sama**.
- `/admin`, `/admin/*` untuk non-admin masih berjudul "Antrean moderasi" (lihat T2).
- Banyak halaman terproteksi bagi tamu hanya berjudul "Masuk". Wajar, tapi pesan pengalihannya tidak memberi tahu halaman apa yang diminta.
- Judul "Profil" sama untuk semua tab profil.

**Dampak:** riwayat browser dan tab yang terbuka sulit dibedakan, SEO, dan pembaca layar.

**Rekomendasi:** judul per halaman dan per tab ("Syarat & berkas · Workshop Riset…"), 404 dengan judul sendiri.

---

## T7 — Bahasa visual tidak seragam

- **`/teams`** (`desktop/tamu__teams.jpg`) dan **`/connections`** (`desktop/mahasiswa__connections.jpg`) memakai hero besar berilustrasi, latar warna pastel, dan judul bergaris stabilo.
- **`/events`, `/about`, studio penyelenggara, pengaturan** memakai judul polos tanpa ilustrasi.
- Akibatnya terasa seperti dua produk yang digabung. Ilustrasi besar itu juga yang paling "terkesan buatan AI".
- Kartu `/connections` memakai warna pastel acak per orang (biru, oranye, ungu, hijau), sementara bagian lain hanya hitam, putih, dan krem.

**Rekomendasi:** pilih satu bahasa. Pilihan paling aman adalah mengikuti `/events` (polos) untuk halaman fungsional, dan menyisakan ilustrasi untuk empty state dan 404 saja.

---

## T8 — Istilah "Pendaftaran" dipakai untuk tiga hal

- Menu "**Pendaftaran saya**" = papan tracker (acara yang disimpan atau dicatat manual, termasuk yang didaftar di situs luar).
- Tab "**Pendaftaran 3**" di profil = isi papan yang sama.
- "**Pembayaran**" = pendaftaran lewat formulir StudentFo.
- Peserta yang mendaftar lewat formulir StudentFo punya **dua tempat** untuk melihat statusnya, dengan nama berbeda.

**Rekomendasi:** satu daftar "Pendaftaranku" yang menggabungkan keduanya, atau nama yang tegas ("Papan lamaran" untuk tracker, "Pendaftaran & pembayaran" untuk formulir internal).

---

## T9 — Navigasi kategori di halaman yang tidak butuh

Baris tab *Semua / Lomba / Beasiswa / Magang / Workshop / Seminar* muncul juga di:
- login dan daftar (`mobile/tamu__login.jpg`);
- studio penyelenggara dan daftar pendaftar (`mobile/penyelenggara__…pendaftar.jpg`);
- panel admin;
- pengaturan.

Di ponsel baris itu memakan satu baris penuh dan terpotong ("Workshop"). Halaman fokus tugas (login, studio, admin) biasanya memakai navbar ringkas.

---

## T10–T15 — Detail kecil

| # | Temuan | Gambar |
|---|---|---|
| T10 | **Pengaturan:** email panjang terpotong di tengah kata ("mahasiswa@demo.studentfo.loc / al"). | `desktop/mahasiswa__profile_settings.jpg` |
| T11 | **Status pembayaran:** setelah mendaftar, muncul dua pemberitahuan sekaligus: banner hijau dan kartu "TERSIMPAN" yang menimpa banner demo di atas. Cukup satu. | `desktop/mahasiswa__status-pembayaran.jpg` |
| T12 | **Beranda peserta:** kartu "Perlu tindakan" kosong menyisakan ruang kosong besar. | `desktop/mahasiswa__home.jpg` |
| T13 | **Menu samping:** grup "Ruang kerja → Studio penyelenggara" tampil untuk semua peserta, walau bukan penyelenggara. | `desktop/mahasiswa__profile.jpg` |
| T14 | **Profil:** label "Hanya kamu" terselip di antara tab, terbaca sebagai tab. | `desktop/mahasiswa__profile.jpg` |
| T15 | **Studio:** baris "Data lembaga" tanpa penjelasan isinya. **Kirim kegiatan:** kolom tanggal memakai format bawaan browser (`mm/dd/yyyy`) di situs berbahasa Indonesia. | `desktop/penyelenggara__penyelenggara.jpg`, `desktop/tamu__submit.jpg` |

---

## Yang sudah baik (agar tidak ikut diubah)

- Beranda tamu, katalog, dan detail kegiatan: bersih dan jelas tanpa elemen dekoratif berlebihan.
- 404 yang membantu (ada pencarian dan jalan kembali).
- Alur pendaftaran, pembayaran, dan studio penyelenggara rapi dan konsisten.
- Ponsel: tidak ada scroll horizontal di 82 halaman ponsel, dan target sentuh memadai.
- Pesan galat di `/reset-password` dan `/verify-email` jelas dan tidak membocorkan keberadaan akun.

## Urutan pengerjaan yang disarankan

1. **T2** (404 untuk non-admin): perubahan kecil dengan nilai keamanan tertinggi, dan berlaku di produksi.
2. **T1 + T3** (pisahkan demo dari situs utama): lakukan bersama.
3. **T5 + T6** (hukum final dan judul halaman): sebelum rilis.
4. **T7 + T8** (konsistensi visual dan istilah): butuh keputusan desain.
5. **T4 + T9–T15**: rapikan sambil lalu.
