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
| Tur beranda | `landing-tour.tsx` (ADR-065); tur penyelenggara `organizer-tour.tsx` + `product-tour.tsx` (ADR-063/066) | `student-tour.tsx` (dihapus, menjanjikan alur 404) | `landing-tour.spec.ts` |
| Keluar ke tautan resmi | `/events/[slug]/daftar` → **pendataan kinerja** `/sebelum-daftar` sekali per acara → tautan resmi (ADR-070). Pertanyaan **diatur admin** di `/admin/kinerja/pertanyaan` + tombol **Lewati** (ADR-073) | Langsung ke tautan resmi; pertanyaan dikunci di kode/CHECK SQL (`source`/`plan`, ADR-070 awal) | `register-redirect.spec.ts`, `outbound-survey.test.ts`, `110_outbound_surveys.test.sql` |
| Wilayah | `lib/wilayah.ts` + `wilayah-districts.ts`: 38 prov / 514 kab-kota / 7.285 kecamatan (Kepmendagri, ADR-074), `RegionPicker`. `REGIONS` TETAP untuk filter lokasi acara & jarak (butuh titik) | — (jangan "melengkapi" `REGIONS` tanpa koordinat; jangan ganti filter acara ke wilayah lengkap tanpa normalisasi `location`) | `wilayah.test.ts`, `geo.test.ts` |
| Tempat studi | Direktori resmi `src/data/institutions.ts` (±49 rb SMA/SMK/MA/SLB/keagamaan + 5.800 PT) + `/api/institusi` + `InstitutionPicker`; kolom `users.institution_*`, `domicile_code`; tampil lewat `public_profile_details()` (ADR-076) | `CAMPUSES` (50 kampus contoh, dihapus) | `institutions.test.ts`, `study-profile.test.ts`, `study-place.spec.ts`, `113_study_profile.test.sql` |
| Peminatan | 19 kategori + 150 bidang spesifik (`lib/study-fields.ts`, `users.study_fields`), bidang membawa induknya (ADR-075); `MAJORS` ±260 prodi/jurusan | 12 kategori saja; `MAJORS` ±60 contoh | `study-fields.test.ts`, `study-place.spec.ts` |
| Lobi | `/lobi` + `/lobi/[slug]`: lobi per lomba untuk yang SUDAH mendaftar (ADR-071) | "Lobi" ditafsirkan sebagai `/teams` (konteks ADR-065) — JANGAN ditafsirkan ulang | `lobby.spec.ts`, `lobby.test.ts` ×2, `111_event_lobby.test.sql` |
| Lencana | Dihitung dari catatan pihak ketiga (ADR-068); opt-in tampil di profil publik & lobi (ADR-072) | — (jangan buat tabel lencana / aksi klaim) | `achievements.test.ts`, `public-badges.test.ts`, `112_public_badges.test.sql` |
| Penomoran ADR | 061–062 keamanan & MVP ops · 063 tur & pintu penyelenggara · 064/065 kesan AI & tur beranda (dulu 061/062 di `main`) · 066 penggabungan · 067/068 · 069–076 | Nomor ganda 061/062 | — |

## Migration

- Produksi: **42** migration, dicocokkan langsung 2026-11-08 → `supabase/APPLIED_MIGRATIONS.txt`.
- Belum diterapkan (urut): `20261108100001_organizer_signup_fields`,
  `20261108100002_outbound_surveys` (bentuk ADR-073 — diubah di tempat karena belum pernah diterapkan),
  `20261108100003_event_lobby`, `20261108100004_public_badges`, `20261109100001_profile_details`.
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
