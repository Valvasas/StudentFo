# CHANGELOG.md — versi yang berlaku SEKARANG

> **Baca ini sebelum mengubah apa pun.** Dokumen ini ada karena kejadian
> berulang: fitur sudah diperbarui, lalu sesi berikutnya membangun dari versi
> lama — mengulang pekerjaan yang sudah ada atau menimpa versi baru dengan yang
> lama. Penyebab nyatanya selalu sama: **cabang kerja tidak digabung ke `main`**,
> padahal migration-nya sudah diterapkan ke produksi.

## Langkah 0 setiap sesi (wajib, sebelum menulis kode)

```bash
git fetch origin && npm run check:sync -- --fetch
```

- **GAGAL** = kamu sedang membangun di atas versi lama. Berhenti, gabungkan
  dulu (`git merge origin/main`, atau cabang yang disebut).
- **PERINGATAN** cabang lain berisi migration = baca bagian "Cabang usang"
  di bawah; jangan gabung tanpa tinjauan, jangan juga mengabaikannya diam-diam.
- Bila Supabase MCP tersedia, cocokkan `list_migrations` produksi
  (`urmmihzjkkbxcwfzvuao`) dengan `supabase/APPLIED_MIGRATIONS.txt`. Yang ada
  di produksi tapi tidak di repo = **berhenti**, cari cabangnya.
- Sebelum "membangun ulang" sesuatu yang diminta pemilik, cari dulu di tabel
  di bawah dan di `DECISION.md` — permintaan lama yang diulang sering berarti
  versi sebelumnya hilang di cabang yang tak tergabung, bukan belum pernah ada.

Setelah menerapkan migration ke produksi (atas persetujuan pemilik): tambahkan
barisnya ke `supabase/APPLIED_MIGRATIONS.txt` di commit yang sama, dan pastikan
commit itu masuk `main` sebelum sesi berakhir. `npm run verify` menolak cabang
yang tidak memuat migration yang sudah ada di produksi
(`src/lib/migrations-manifest.test.ts`).

---

## Peta "versi yang berlaku" — jangan kembali ke kolom kanan

| Area | Yang berlaku sekarang | Versi lama yang SUDAH DIGANTI | Dikunci oleh |
|---|---|---|---|
| Daftar peserta | `/register` → `RegisterForm` (nama, email, sandi + **ulangi sandi**, usia, persetujuan) | Kartu radio "Daftar sebagai" (`AccountTypeField`, dihapus ADR-063) | `auth-pages.spec.ts`, `register-forms.spec.ts` |
| Daftar penyelenggara | `/penyelenggara/daftar` → `OrganizerRegisterForm`: data lembaga (nama, jenis, situs, bukti) + penanggung jawab (nama, jabatan, email kerja) + pernyataan wewenang (ADR-069) | Form peserta berlabel "penanggung jawab" (ADR-063 awal) | `register-forms.spec.ts`, `organizer.test.ts`, `auth-failure.test.ts` |
| Data lembaga | Draf di user metadata → form studio terisi, kirim satu klik; kolom `org_type`, `contact_role` | Pengajuan hanya nama/situs/bukti | `109_organizer_signup_fields.test.sql` |
| Email ganda saat daftar | Ditolak terang: `email_taken` + tautan Masuk/Lupa sandi (ADR-069). Masuk & lupa sandi TETAP seragam | Halaman "cek email" seragam untuk email terdaftar (ADR-011 untuk daftar) | `auth-messages.test.ts` |
| Ulangi kata sandi | `ConfirmPasswordInput` di daftar ×2, setel ulang, ganti sandi; kode `password_mismatch`/`same_password`/`weak_password` | Mismatch → "Ada isian yang belum benar" | `auth-failure.test.ts` |
| Pengaturan | Hub `/profile/settings` + `keamanan/` + `notifikasi/` (ADR-067). Pengingat email di **Notifikasi**, Hapus akun di **Privasi & data** | Satu halaman Pengaturan berisi semuanya (cabang `ccr-c5c96a43`) | `settings.spec.ts`, `email-reminders.spec.ts`, `trust-safety.spec.ts` |
| Tur penyelenggara | `organizer-tour.tsx` + `product-tour.tsx` (ADR-063/066) | `student-tour.tsx` (dihapus, menjanjikan alur 404) | — |
| Keluar ke tautan resmi | `/events/[slug]/daftar` → **pendataan kinerja** `/sebelum-daftar` sekali per acara → tautan resmi (ADR-070). Pertanyaan **diatur admin** di `/admin/kinerja/pertanyaan` + tombol **Lewati** (ADR-073) | Langsung ke tautan resmi; pertanyaan dikunci di kode/CHECK SQL (`source`/`plan`, ADR-070 awal) | `register-redirect.spec.ts`, `outbound-survey.test.ts`, `110_outbound_surveys.test.sql` |
| Wilayah | `lib/wilayah.ts` + `wilayah-districts.ts`: 38 prov / 514 kab-kota / 7.285 kecamatan (Kepmendagri, ADR-074), `RegionPicker`. `REGIONS` TETAP untuk filter lokasi acara & jarak (butuh titik) | — (jangan "melengkapi" `REGIONS` tanpa koordinat; jangan ganti filter acara ke wilayah lengkap tanpa normalisasi `location`) | `wilayah.test.ts`, `geo.test.ts` |
| Tempat studi | Direktori resmi `src/data/institutions.ts` (±49 rb SMA/SMK/MA/SLB/keagamaan + 5.800 PT) + `/api/institusi` + `InstitutionPicker`; kolom `users.institution_*`, `domicile_code`; tampil lewat `public_profile_details()` (ADR-076) | `CAMPUSES` (50 kampus contoh, dihapus) | `institutions.test.ts`, `study-profile.test.ts`, `study-place.spec.ts`, `113_study_profile.test.sql` |
| Peminatan | 19 kategori + 150 bidang spesifik (`lib/study-fields.ts`, `users.study_fields`), bidang membawa induknya (ADR-075); `MAJORS` ±260 prodi/jurusan | 12 kategori saja; `MAJORS` ±60 contoh | `study-fields.test.ts`, `study-place.spec.ts` |
| Lobi | `/lobi` + `/lobi/[slug]`: lobi per lomba untuk yang SUDAH mendaftar (ADR-071) | "Lobi" ditafsirkan sebagai `/teams` (konteks ADR-065) — JANGAN ditafsirkan ulang | `lobby.spec.ts`, `lobby.test.ts` ×2, `111_event_lobby.test.sql` |
| Lencana | Dihitung dari catatan pihak ketiga (ADR-068); opt-in tampil di profil publik & lobi (ADR-072) | — (jangan buat tabel lencana / aksi klaim) | `achievements.test.ts`, `public-badges.test.ts`, `112_public_badges.test.sql` |
| Profil publik | `/u/[username]` + username/bio/keterlihatan di Data diri (ADR-077); bawaan MEMBERS (anggota yang masuk), NETWORK = hanya koneksi | Profil hanya terbaca bila "bisa ditemukan" (ADR-040); kartu demo "Profil publik" (localStorage, dilepas) | `profile-identity.test.ts`, `114_profile_identity.test.sql`, `profile-identity.spec.ts` |
| Email Auth | `supabase/templates/*.html` dari `auth-email-templates.ts`, tautan `token_hash` (ADR-078), dipasang pemilik (`docs/email-templates.md`) | Template bawaan Supabase / `{{ .ConfirmationURL }}` PKCE | `auth-email-templates.test.ts` |
| Pilihan "Lainnya" | Prodi (isian bebas), kampus ("pakai teks ini"), domisili ("Luar negeri" = LN), lokasi kegiatan (datalist 503 kab/kota) | Prodi custom tersembunyi di "Pakai …" | `study-place.spec.ts`, `wilayah.test.ts` |
| Pemilih melayang di ponsel | Posisi dijepit ke viewport saat dibuka (`Picker`) | Popover 340px ditambatkan ke tombol → meluber | `picker-viewport.spec.ts` |
| Poster, slide & video | Poster = foto galeri bertanda `is_poster` (satu/acara) → slide `MediaSlider` di Ringkasan, thumbnail kartu & papan, og:image; video = tautan YouTube/Vimeo kanonis `events.video_url`, pemutar fasad (nocookie, dimuat setelah Putar); kelola di studio & `/admin/media/[slug]` (ADR-079) | Grid galeri `EventGallery`/`GalleryViewer` (dihapus); kartu tanpa gambar sama sekali | `event-media.spec.ts`, `video.test.ts`, `event-media.test.ts`, `115_event_media.test.sql` |
| Logo | `LogoSprite` + `LogoMark`/`LogoEmblem` dari `logo-paths.ts` (hasil `scripts/trace-logo.py`, ADR-080); ikon & OG dari `LOGO_BOLD` | Monogram `LOGO_MARK` di `illustrations.tsx` (dihapus) | `landing-tour.spec.ts` (render), axe |
| Tur beranda | Satu cuplikan tanpa judul/daftar langkah; kendali putar/jeda + 5 ruas (ADR-081) | Panggung + 5 tab langkah berteks + label "Contoh tampilan" (ADR-065) | `landing-tour.spec.ts` |
| Foto profil & banner | Kolom `users.avatar_*`/`banner_*`/`banner_preset`, bucket privat `profile-media`, `/media/profil/[id]`; kartu "Foto & banner" di Data diri; cabut di `/admin/pengguna` (ADR-083) | Hanya inisial + sampul bertitik | `profile-media.test.ts` ×2, `116_profile_media.test.sql`, `profile-media.spec.ts` |
| Poster di kiriman | Langkah "Media kegiatan" di `/submit` (poster: pengirim yang masuk), kolom `ugc_submissions.poster_*`, `/media/kiriman/[id]` (ADR-084) | Poster hanya setelah tayang (studio/admin); video di lipatan "detail tambahan" | `submissions.test.ts`, `117_submission_poster.test.sql`, `submission-poster.spec.ts` |
| Komunitas | `/komunitas` (+ `baru`, `[id]`): forum publik khusus anggota, nama tersingkat, tanpa DM & tanpa kontak pribadi, lapor + sembunyi otomatis 3 pelapor, antrean di `/admin/laporan` (ADR-087) | `/discussions` "Ruang diskusi" (pratinjau demo, localStorage — tetap demo saja) | `community.test.ts` ×2, `118_community.test.sql`, `community.spec.ts` |
| Ajakan bertindak | "Langkah awalmu" di beranda peserta + satu saran di lonceng, dihitung dari akun (`lib/next-steps.ts`), cookie `sf_langkah` untuk menyembunyikan (ADR-086) | Satu tautan "Pilih minat & jenjangmu" | `next-steps.test.ts`, `personal-home.spec.ts` |
| Detail kegiatan untuk tamu | Etalase + cuplikan ≤ 200 karakter + `MemberGate`; tab lain, tautan pendaftaran, kalender khusus anggota (ADR-085) | Semua isi & "Daftar sekarang" terbuka untuk tamu | `event-gate.spec.ts`, `event-access.test.ts`, `register-redirect.spec.ts` |
| Penomoran ADR | 061–062 keamanan & MVP ops · 063 tur & pintu penyelenggara · 064/065 kesan AI & tur beranda (dulu 061/062 di `main`) · 066 penggabungan · 067/068 · 069–087 | Nomor ganda 061/062 | — |

## Migration

- Produksi: **47** migration, dicocokkan langsung 2026-11-09 → `supabase/APPLIED_MIGRATIONS.txt`.
- 2026-11-09: `20261108100001`–`04` dan `20261109100001_profile_details` diterapkan ke staging lalu produksi,
  persis isi berkas (tanpa DROP). Versi di `schema_migrations` disamakan dengan nama berkas; sidik skema
  (policy, constraint, hak kolom, kategori, 14 definisi fungsi) identik lokal = staging = produksi.
- Belum diterapkan (menunggu persetujuan pemilik, semuanya hanya ADD/CREATE OR REPLACE):
  `20261109100002_event_media` (ADR-079), `20261110100001_profile_media` (ADR-083),
  `20261112100001_submission_poster` (ADR-084), `20261112100002_community` (ADR-087).
  Kode aman urutan deploy: tanpa migration ini fitur terkait turun anggun
  (kolom lama, lobi kosong + `lobby_unavailable`, survei tidak dicatat tapi
  pengunjung tetap diantar dengan pertanyaan bawaan, lencana tetap privat,
  kartu tempat studi & bidang spesifik disembunyikan).

## Cabang usang (ada migration, TIDAK di produksi, JANGAN digabung tanpa tinjauan)

| Cabang | Isi | Status |
|---|---|---|
| `ccr-a2058300-u92ao5` | `20260929110001_result_verification` — penyelenggara mengonfirmasi hasil portofolio (ADR-047 versi cabang itu) | Tidak pernah digabung. Ide yang layak dipindahkan (sumber pihak ketiga untuk lencana "Juara"), tetapi nomor ADR-nya bertabrakan dengan ADR-047 `main` — port ulang, jangan merge |
| `ccr-4d61ed42-skxs6m` | `20261006100001_event_registrations` — pendaftaran internal versi awal (ADR-055 versi cabang itu) | Digantikan ADR-056 di `main`. Jangan digabung |
| `ccr-c5c96a43-8eijqc` | 8 migration trust & safety … function_hardening | **Sudah digabung** 2026-11-08 (commit `1d4b3a4`) |

---

## Riwayat (terbaru di atas)

### 2026-11-12 — cabang `claude/brave-cray-xsqigf` (dari `…registration-form-competition-features-sptvfz`)
- Logo baru (ADR-080), tur beranda hanya cuplikan (ADR-081), 12 ragam lencana + animasi (ADR-082).
- Foto profil & banner (ADR-083), poster dilampirkan saat kirim kegiatan (ADR-084),
  gerbang anggota di halaman kegiatan (ADR-085), "Langkah awal" (ADR-086), Komunitas (ADR-087). `LEGAL_REVISION` 2026-11-12.
- Empat migration BELUM diterapkan (lihat bagian Migration). Cabang ini **belum di `main`**.

### 2026-11-09 — cabang `claude/registration-form-competition-features-sptvfz` (bagian 5, setelah PR #27)
- **Serah-terima sesi & langkah konfigurasi pemilik yang sedang berjalan: `docs/progres-sekarang.md`.**
- Poster, slide & video kegiatan (ADR-079): migration `20261109100002_event_media` BELUM diterapkan;
  kode aman urutan deploy (tanpa kolom → poster/video tidak tampil, aksi → `media_unavailable`).
- Kartu & papan kini boleh memuat thumbnail poster (pilihan manusia saja) — membalik sebagian "kartu tanpa gambar".
- Kebijakan privasi & cookie: YouTube/Vimeo hanya setelah Putar; `LEGAL_REVISION` 2026-11-09.

### 2026-11-09 — cabang `claude/registration-form-competition-features-sptvfz` (bagian 4, sebelum merge)
- Bug live: `/submit`, beranda admin, `/admin`, ekspor data crash tanpa `SUPABASE_SERVICE_ROLE_KEY` (log Vercel) → kini turun anggun; kunci itu tetap harus diisi pemilik.
- Pemilih melayang tidak meluber di ponsel; opsi "Lainnya" di prodi/kampus/domisili/lokasi.
- Username, bio, `/u/[username]`, profil terbuka untuk anggota (ADR-077); template email Auth (ADR-078).
- Migration `20261109100001` diganti nama `profile_details` (sebelum diterapkan); migration lobi memakai ALTER POLICY.
  Kelima migration cabang ini lalu diterapkan ke staging & produksi (47).
- Penjaga isian belum disimpan (ADR-067): ketikan/isi otomatis SEBELUM skrip dimuat kini ikut dijaga
  (patokan = isi render server) — `unsaved-guard.spec.ts` menahan skrip untuk membuktikannya.

### 2026-11-09 — cabang `claude/registration-form-competition-features-sptvfz` (bagian 3)
- Pendataan kinerja: pertanyaan diatur admin + Lewati (ADR-073).
- Wilayah lengkap Kepmendagri (ADR-074), bidang peminatan spesifik + 7 kategori (ADR-075),
  direktori tempat studi dari Data Referensi Kemendikdasmen + tampil di profil/lobi/Koneksi (ADR-076).
- Halaman `/sumber-data` (atribusi ODbL), kebijakan privasi diperbarui.
- **Memperbarui data referensi:** jalankan crawler terpisah (bukan bagian build) lalu
  `node scripts/import-institutions.mjs …` dan `node scripts/import-wilayah.mjs …`; tinjau diff-nya.

### 2026-11-08 — cabang `claude/registration-form-competition-features-sptvfz`
> **Status penggabungan:** bagian 1 (gabung versi produksi + form daftar
> penyelenggara, ulangi sandi, email ganda) MASUK `main` lewat PR #26 (`d4ab7c9`).
> Bagian 2 (pendataan kinerja, lobi, lencana publik, penjaga anti-regresi —
> `c0dc1a3`) di-push SETELAH PR #26 di-merge: **belum di `main` sampai PR
> berikutnya digabung.** Jangan mulai sesi baru dari `main` sebelum itu.

- Gabung `ccr-c5c96a43-8eijqc` (versi produksi) ke cabang kerja; konflik Pengaturan diselesaikan dengan hub ADR-067.
- Form daftar penyelenggara terpisah dengan data lembaga; ulangi kata sandi di semua form sandi baru; email ganda ditolak terang (ADR-069).
- Pendataan kinerja sebelum keluar ke tautan resmi + dasbor `/admin/kinerja` (ADR-070).
- Lobi lomba (ADR-071); sesama anggota lobi boleh saling mengajak terhubung.
- Lencana opt-in di profil publik & lobi (ADR-072).
- Penjaga anti-regresi: `npm run check:sync`, `supabase/APPLIED_MIGRATIONS.txt`, tes manifes di `verify`, dokumen ini.

### 2026-11-05/06 — `main` (PR #24, #25)
- ADR-067 (kembali, konfirmasi, Pengaturan per konteks), ADR-068 (lencana dihitung), migration `20261105100001` diterapkan.

### 2026-10-31 — 2026-11-04 — `ccr-8508b1ef` → `ccr-c5c96a43`
- ADR-061–063, 066: keamanan & kepercayaan, MVP operasional, pintu penyelenggara, peluncuran produksi (41 migration).
