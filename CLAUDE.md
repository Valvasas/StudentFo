# CLAUDE.md

Panduan ini khusus untuk Claude Code. Aturan lintas-model yang wajib ada di
setiap sesi ada di **`AGENTS.md`** — baca itu dulu, dokumen ini hanya
menambahkan hal yang spesifik untuk cara Claude bekerja di repo ini.

## Orientasi cepat

- `npm install && npm run dev` → jalan tanpa kredensial apa pun (mode seed).
- Peta kode lengkap: `ARCHITECTURE.md`. Skema DB: `SCHEMA.md`. Kontrak
  data/error: `API_SPEC.md`. Gaya kode: `CONVENTIONS.md`. Alasan di balik
  keputusan yang tidak jelas dari kode: `DECISION.md` dan
  `supabase/DEVIATIONS.md`. Pekerjaan yang belum selesai: `TASKS.md`.
- **Langkah 0:** `git fetch origin && npm run check:sync -- --fetch`, lalu
  baca `CHANGELOG.md`. Banyak permintaan pemilik adalah pengulangan fitur yang
  SUDAH dibuat di cabang yang tak tergabung — cek dulu sebelum membangun ulang.
- Supabase MCP tersedia? Cocokkan `list_migrations` produksi
  (`urmmihzjkkbxcwfzvuao`) dengan `supabase/APPLIED_MIGRATIONS.txt` (baca saja).

## Alur kerja yang disarankan

1. Sebelum menyentuh kode: baca file `*.md` yang relevan dengan area yang
   diubah (jangan asumsikan dari nama file/fungsi saja — banyak keputusan
   di repo ini punya alasan non-obvious yang didokumentasikan).
2. Buat perubahan sekecil mungkin yang menyelesaikan tugas. Ikuti
   `CONVENTIONS.md` — terutama: tanpa komentar WHAT, komentar WHY hanya
   kalau non-obvious, tanpa abstraksi spekulatif.
3. Jalankan `npm run verify` sebelum melaporkan tugas selesai. Kalau
   perubahan menyentuh `pipeline/`, jalankan juga
   `python pipeline/tests/test_models.py`.
4. Kalau perubahan menyentuh migration Supabase: **jangan** jalankan
   `supabase db push` atau apply ke project remote tanpa konfirmasi
   eksplisit — itu operasi yang menyentuh state bersama.
5. Perbarui `TASKS.md` (checklist), `CHANGELOG.md` (baris peta "versi yang
   berlaku" bila perilaku pengguna berubah), dan — kalau kamu membuat keputusan
   arsitektural baru atau menyimpang dari sesuatu yang terdokumentasi —
   tambahkan entri ke `DECISION.md`.
6. Sebelum sesi berakhir: commit & push, dan sampaikan ke pemilik bila cabang
   belum digabung ke `main`. Cabang yang menggantung adalah sumber "versi lama
   dipakai lagi".

## Hal spesifik yang sering salah kalau tidak dicek dulu

- **Jangan** mengimpor Supabase langsung di komponen/halaman — selalu lewat
  `getEventRepository()`. Lihat `API_SPEC.md` § Repository.
- **Jangan** "menyederhanakan" filter `/events` jadi client-state — itu
  keputusan sengaja (form-based, tanpa JS, URL kanonik per kombinasi filter).
- **Jangan** menambah `src/app/loading.tsx` atau
  `src/app/events/loading.tsx` — sudah ada catatan insiden soft-404 di
  komentar `src/app/events/page.tsx`.
- **Jangan** mengubah `dedup_hash` untuk mengikutkan `source_url` lagi —
  itu koreksi sengaja dari blueprint asli (`supabase/DEVIATIONS.md` #7).
- Kalau menambah tabel Supabase baru: RLS + policy WAJIB di migration yang
  sama (lihat `SCHEMA.md`).
- Kalau menambah nilai enum baru (`EventType`, `EducationLevel`, dst): ubah
  di tiga tempat sekaligus — `src/types/domain.ts`, migration SQL, dan
  `pipeline/studentfo_pipeline/models.py`.
- Aturan paging/sort/visibilitas publik ada di `src/lib/data/listing.ts` dan
  dipakai KEDUA repository. Jangan menulis ulang logika itu di salah satunya.
- Pesan hasil Server Action: lempar `actionError('kode')` dari repository dan
  redirect dengan `withQuery(returnTo, { error: toActionErrorCode(err) })`.
  Jangan pernah menaruh teks pesan di URL (ADR-019).
- Migration yang membuat tabel/view/fungsi baru: `REVOKE … FROM anon,
  authenticated` eksplisit — `FROM PUBLIC` saja tidak cukup di Supabase (ADR-020).
- Pengaturan akun = hub + halaman per konteks (ADR-067). Pengingat email
  tinggal di `/profile/settings/notifikasi`, Hapus akun di `/profile/privacy`.
  Jangan menyatukannya kembali ke satu halaman.
- Server Action yang menuju tautan LUAR: `redirect(urlLuar)` langsung. Redirect
  ke path internal yang lalu 303 ke luar membuat Next merender & mengikuti
  tujuan itu di server (ADR-070).
- Wilayah: `lib/wilayah.ts` (514 kab/kota, 7.285 kecamatan, ADR-074) untuk
  "dari mana orangnya"; `lib/regions.ts` (`REGIONS`) TETAP untuk filter lokasi
  acara & jarak tim karena butuh titik-tengah. Jangan menyatukan keduanya.
- Data referensi besar (`src/data/institutions.ts`) = string TSV hasil
  `scripts/import-institutions.mjs`, JANGAN diedit tangan dan jangan diubah ke
  JSON (impor JSON multi-MB memperlambat `tsc` ±10 detik). Singkatan PT hanya
  dari `src/data/institution-aliases.json` — jangan menebak singkatan.
- Pertanyaan pendataan kinerja diatur admin (ADR-073): jangan menambah
  pertanyaan di kode/CHECK SQL; ubah `DEFAULT_OUTBOUND_CONFIG` hanya bersama
  baris bawaan migration (dikunci tes).
- Proyek hanya punya SATU root (folder ini). Salinan lama yang dulu bertumpuk
  sudah dipindah keluar repo — jangan buat salinan proyek di dalam repo.

## Menjalankan project (untuk `/run` atau verifikasi manual)

`npm run dev` lalu buka `http://localhost:3000`. Tidak perlu `.env.local`
untuk pengembangan/preview UI. Untuk menguji jalur Supabase sungguhan,
lihat `README.md` § "Menyiapkan Supabase" dan `SCHEMA.md`.
