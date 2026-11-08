# DRAF — Penilaian Dampak Pelindungan Data Pribadi (DPIA) & penilaian profil risiko anak

> **Status: DRAF KERJA, BUKAN NASIHAT HUKUM.** Disusun 4 November 2026 dari
> sistem yang benar-benar berjalan (migration `supabase/migrations`,
> `src/app/privacy-policy/page.tsx`, job retensi `20261030100001`). Isi
> faktual tentang sistem bisa dipegang; **kesimpulan hukum, tingkat risiko
> akhir, dan pilihan batas usia WAJIB diputuskan pemilik bersama penasihat
> hukum.** Setiap rujukan pasal di bawah harus dicocokkan dengan teks resmi
> yang berlaku (termasuk Permenkomdigi pelaksana PP 17/2025).

Pengendali data: `LEGAL_OPERATOR_NAME` (belum diisi). Kontak: `PRIVACY_CONTACT_EMAIL` (belum diisi).

---

## Bagian A — DPIA (UU 27/2022, Pasal 34)

Pasal 34 mewajibkan penilaian dampak untuk pemrosesan berpotensi risiko
tinggi, antara lain yang melibatkan **data pribadi spesifik** dan **data
anak**. StudentFo memproses keduanya: foto bukti transfer (data keuangan
pribadi, Pasal 4) dan akun pengguna berusia 13–17 tahun.

### A.1 Deskripsi sistematis pemrosesan

| Kategori data | Subjek | Sumber | Tujuan | Lokasi | Retensi | Siapa bisa melihat |
|---|---|---|---|---|---|---|
| Akun: nama, email, hash sandi, jenis akun, catatan persetujuan & pernyataan usia | Semua pengguna | Pengguna / Google OAuth | Menjalankan akun | Supabase Auth + `public.users` | Selama akun aktif; ikut terhapus | Pengguna sendiri; admin |
| Profil: jenjang, prodi, minat | Pengguna | Pengguna | Rekomendasi & saringan | `public.users` | Selama akun aktif | Pengguna; ringkasan di direktori bila dibuka |
| Aktivitas: simpanan, papan lamaran, portofolio, tim | Pengguna | Pengguna | Fitur pelacakan | Supabase | Selama akun aktif (tim tetap, tautan diputus) | Pengguna; portofolio publik bila dipilih |
| Koneksi: headline, ajakan + pesan, blokir | Pengguna yang memakai | Pengguna | Mencari rekan | `network_*` | Selama akun aktif | **Tersembunyi bawaan** (`is_discoverable DEFAULT FALSE`) |
| Kartu pemain: kota (bukan alamat), keahlian, pengantar | Pengguna yang membuat | Pengguna | Pencocokan tim | `team_seekers` | Selama akun aktif | **Tertutup bawaan** (`is_open DEFAULT FALSE`); hanya pengguna masuk |
| Pendaftaran: jawaban formulir, kode, status | Peserta | Peserta | Pendaftaran acara | `event_registrations` | Selama akun aktif | Peserta; penyelenggara acara itu |
| **Bukti transfer (data keuangan pribadi)** | Peserta acara berbayar | Peserta | Verifikasi pembayaran | Bucket privat `payment-proofs`; metadata/EXIF dibuang sebelum simpan | Selama akun aktif; berkas ikut terhapus saat akun dihapus | Peserta; penyelenggara acara itu; admin |
| Penyelenggara: lembaga, situs, bukti peran | Calon penyelenggara | Pengguna | Verifikasi | `organizer_profiles` | Selama akun aktif | Pengguna; admin |
| Kiriman kegiatan: email pengirim, isi | Pengirim | Pengguna/tamu | Moderasi | `ugc_submissions` | Email dihapus 90 hari setelah diputuskan | Admin |
| Notifikasi & persetujuan pengingat email | Pengguna | Sistem | Pengingat | `notifications`, kolom opt-in | Dibaca: 180 hari; semua: 365 hari | Pengguna |
| Tanya jawab kegiatan | Penanya | Pengguna | Tanya ke penyelenggara | `event_questions` | Bisa dihapus penanya; ikut terhapus | **Publik**, nama depan saja |
| Laporan & penangguhan | Pelapor / terlapor | Pengguna / admin | Keamanan komunitas | `content_reports`, log moderasi | Tetap sebagai jejak audit; tautan akun diputus | Admin |
| Data teknis: hash IP pembatas laju, hash pengunjung harian, log hosting | Semua pengunjung | Sistem | Keamanan, statistik agregat | Supabase / hosting | 1 hari (hash); log sesuai penyedia | Admin (agregat untuk penyelenggara) |

**Pemroses** (Pasal 56, transfer ke luar negeri — server dapat berada di
Singapura): Supabase, penyedia hosting (Vercel), Cloudflare Turnstile,
penyedia email Auth, Resend (hanya bila pengingat email dinyalakan), Google
(hanya bila masuk dengan Google). Pipeline memakai Gemini untuk mengekstrak
**pengumuman publik**, bukan data pengguna.

### A.2 Kebutuhan & proporsionalitas (yang sudah ada di sistem)

- Tidak diminta: NIK, foto KTP, nilai rapor/IPK, lokasi GPS, tanggal lahir.
- Kota, bukan alamat (pencocokan tim); jarak dihitung kelipatan 5 km.
- Direktori Koneksi & kartu pemain **opt-in**, tertutup bawaan.
- EXIF/lokasi foto bukti transfer dibuang sebelum disimpan.
- Retensi berjalan sebagai job pg_cron, bukan hanya janji di dokumen.
- Hapus akun mandiri + ekspor data JSON (`/profile/privacy/ekspor`).
- Pesan langsung & ruang diskusi grup **tidak tersedia di produksi**
  (hanya mode demo) — sengaja ditunda karena pengguna 13+.

### A.3 Penilaian risiko & mitigasi

Kemungkinan/dampak: R = rendah, S = sedang, T = tinggi. Angka akhir
diputuskan pemilik.

| # | Risiko terhadap subjek data | K | D | Mitigasi yang sudah ada | Sisa / tindakan pemilik |
|---|---|---|---|---|---|
| 1 | Bocornya bukti transfer | R | T | Bucket privat; akses lewat rute server dengan cek hak; RLS; EXIF dibuang | DPA dengan Supabase; prosedur kebocoran ≤ 3 × 24 jam |
| 2 | Penyelenggara palsu meminta data/uang | S | T | Verifikasi penyelenggara oleh moderator; perubahan acara lewat revisi yang ditinjau; peringatan "jangan transfer ke rekening pribadi" | Moderator aktif; SOP verifikasi tertulis |
| 3 | Kontak tidak diinginkan dengan anak (Koneksi, tim, pencocokan) | S | T | Opt-in, blokir, laporan, penangguhan akun; tanpa DM di produksi; tamu tidak melihat nama anggota tim | Lihat Bagian B — penentu batas usia |
| 4 | Konten berbahaya di Tanya jawab publik | S | S | Laporan + sembunyikan; nama depan saja | Tanpa pra-moderasi: pantau antrean Laporan harian |
| 5 | Pengambilalihan akun admin | R | T | MFA TOTP wajib (aplikasi + `is_admin()` aal2) | Kebijakan sandi admin; aktifkan *leaked password protection* (paket Pro) |
| 6 | Penyalahgunaan formulir (spam/bot) | S | R | Turnstile, batas laju di Postgres, honeypot | Isi kunci Turnstile produksi |
| 7 | Data disimpan lebih lama dari perlu | R | S | Job retensi notifikasi & email kiriman | Pantau job di beranda admin (`ops-watchdog`) |
| 8 | Transfer lintas negara tanpa perjanjian | S | S | Kebijakan privasi menyatakannya | **Tanda tangani DPA** semua pemroses |
| 9 | Pengguna < 13 tahun mendaftar | S | S | Centang pernyataan usia terpisah dari persetujuan | Centang pernyataan mungkin tidak cukup (Permenkomdigi 9/2026) — tanyakan penasihat hukum |

### A.4 Kesimpulan & persetujuan (diisi pemilik)

- [ ] Risiko sisa dapat diterima / perlu tindakan tambahan: ____________
- [ ] Ditinjau penasihat hukum: nama ____________ tanggal ____________
- [ ] Ditinjau ulang setiap ada fitur baru yang memproses data pribadi, atau paling lambat 12 bulan.

---

## Bagian B — Penilaian mandiri profil risiko anak (PP 17/2025)

Kebijakan privasi & S&K saat ini mengizinkan **13+** (13–17 dengan izin
orang tua/wali). `TASKS.md` mencatat: batas itu hanya sah bila profil risiko
produk dinilai **rendah**; bila **tinggi**, batasnya perlu naik (mis. 16+).
Penilaian di bawah hanya memetakan fakta produk ke aspek risiko — **bukan
putusan tingkat risiko**.

| Aspek risiko (cocokkan dengan teks resmi) | Fitur StudentFo yang relevan | Faktor penurun risiko yang ada | Catatan |
|---|---|---|---|
| Kontak dengan orang tidak dikenal | Koneksi, pencocokan tim, gabung tim, Tanya jawab | Opt-in & tertutup bawaan; blokir; laporan; tanpa DM di produksi | **Aspek paling menentukan** |
| Paparan konten berbahaya | Kegiatan (dimoderasi sebelum tayang); Tanya jawab (moderasi sesudah) | Pra-moderasi katalog; laporan | Tanya jawab tayang tanpa pra-moderasi |
| Eksploitasi sebagai konsumen | Acara berbayar; promosi berbayar | Label "Promosi" selalu tampil; biaya tidak ditebak "Gratis"; peringatan transfer | Pembayaran ke penyelenggara, bukan ke StudentFo |
| Ancaman keamanan data pribadi | Bukti transfer, profil | Lihat Bagian A | — |
| Kecanduan / pola gelap | — | Tanpa umpan tak berujung; pengingat hanya H-3 & H-1; tanpa hitung mundur per detik (ADR-064) | — |
| Gangguan psikologis | Penolakan, hasil seleksi | Kabar netral tidak dirayakan; tanpa papan peringkat publik | — |

### B.1 Pilihan yang perlu diputuskan

1. **Tetap 13+** — hanya bila penilaian akhir "rendah". Tidak ada perubahan kode.
2. **Naik ke 16+** — ubah `/terms`, `/privacy-policy`, teks centang usia,
   dan `LEGAL_REVISION`; pengguna lama diminta menyatakan ulang.
3. **13+ dengan fitur kontak dikunci untuk 13–15** — butuh data usia yang
   lebih dari sekadar centang (sekarang tidak ada tanggal lahir), jadi
   paling banyak menambah pengumpulan data. Paling kompleks.

Setelah diputuskan, perubahan kode (opsi 2 atau 3) bisa dikerjakan dalam satu sesi.

- [ ] Profil risiko diputuskan: ☐ rendah ☐ tinggi — oleh ____________ tanggal ____________
- [ ] Opsi dipilih: ____ — dasar pertimbangan: ____________
