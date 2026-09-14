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
- Repo ini **bukan** git repository saat ditulis (cek `git status` dulu
  kalau kamu berencana melakukan operasi git — mungkin perlu `git init`
  atas persetujuan user).

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
5. Perbarui `TASKS.md` (checklist) dan, kalau kamu membuat keputusan
   arsitektural baru atau menyimpang dari sesuatu yang terdokumentasi,
   tambahkan entri ke `DECISION.md`.

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

## Menjalankan project (untuk `/run` atau verifikasi manual)

`npm run dev` lalu buka `http://localhost:3000`. Tidak perlu `.env.local`
untuk pengembangan/preview UI. Untuk menguji jalur Supabase sungguhan,
lihat `README.md` § "Menyiapkan Supabase" dan `SCHEMA.md`.
