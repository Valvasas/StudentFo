# CONVENTIONS.md

Gaya kode yang sudah dipakai konsisten di repo ini. Ikuti pola yang ada,
jangan perkenalkan gaya baru tanpa alasan kuat.

## Bahasa

- **Identifier** (variabel, fungsi, tipe, kolom DB): Inggris.
- **Komentar, copy UI, pesan error, dokumen**: Bahasa Indonesia.
- Jangan campur dua-duanya dalam satu file dengan cara yang tidak konsisten
  dengan file lain di folder yang sama.

## Komentar

- **Default: tanpa komentar.** Nama yang baik sudah menjelaskan APA.
- Tulis komentar **hanya** untuk menjelaskan MENGAPA sesuatu ditulis seperti
  itu ketika alasannya tidak jelas dari kode: constraint tersembunyi,
  invariant halus, workaround untuk bug spesifik, atau perilaku yang bisa
  mengejutkan pembaca. Contoh gaya yang dipakai di repo ini (lihat
  `src/lib/deadline.ts`, `src/lib/data/supabase-repository.ts`,
  `pipeline/studentfo_pipeline/fetcher.py`): jelaskan konsekuensi kalau
  komentar itu diabaikan, bukan hanya mendeskripsikan baris di bawahnya.
- Jangan tulis komentar yang menyebut task/fix/issue saat ini ("diperbaiki
  untuk kasus X", "ditambahkan untuk PR ini") — itu informasi commit
  message/PR description, bukan kode; ia basi begitu konteks berubah.
- Kalau sebuah keputusan menyimpang dari spesifikasi/blueprint asli, catat
  di `supabase/DEVIATIONS.md` (untuk skema) atau `DECISION.md` (untuk yang
  lain) — **bukan** hanya komentar inline yang mudah terlewat.

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true` — akses index array bisa
  `undefined`, tangani secara eksplisit (lihat pola
  `if (!current) return;` di `memory-repository.ts`).
- ESLint melarang `any` eksplisit (`@typescript-eslint/no-explicit-any: error`).
  Kalau bentuk data dari luar (mis. baris DB) tidak diketahui, definisikan
  tipe eksplisit di `src/types/database.ts` — jangan `any`/`unknown` lalu cast diam-diam.
  Lihat komentar di `database.ts`: ini disengaja jadi kontrak eksplisit
  antara SQL dan TS, bukan sekadar menghindari `any`.
- Fungsi murni yang bergantung waktu **selalu** menerima `now: Date = new Date()`
  sebagai parameter (lihat `deadline.ts`, `recommendation.ts`,
  `sortSummaries()`). Ini yang membuatnya testable-deterministik dan yang
  menyamakan render server/klien saat hidrasi. Jangan panggil `new Date()`
  langsung di dalam fungsi murni yang dites.
- Tipe domain (`interface`) memakai `readonly` di semua field/array — data
  yang mengalir dari repository ke komponen tidak boleh dimutasi diam-diam.
- Import alias `@/*` → `src/*` (lihat `tsconfig.json`).

## React / Next.js

- Server Component secara default. Client Component (`'use client'`) hanya
  untuk interaktivitas yang benar-benar butuh state klien (lihat
  `theme-toggle.tsx`) — jangan jadikan default.
- Halaman yang menampilkan hitungan waktu (`H-n`, status moderasi) memakai
  `export const dynamic = 'force-dynamic'`. Jangan hapus ini untuk "optimasi"
  — hasilnya adalah H-n yang membeku di waktu build.
- Filter/pencarian: **`<form>` + `<a>` + query string**, bukan
  `useState`/client-side filtering. Setiap kombinasi filter harus jadi URL
  yang bisa dibagikan dan berfungsi tanpa JavaScript. Lihat
  `FilterBar`/`Pagination`/`search-params.ts`.
- Server Action yang mengubah data **selalu** memeriksa otorisasi di dalam
  dirinya sendiri, tidak mengandalkan halaman pemanggil. Lihat
  `reviewEventAction`.
- Jangan tambahkan `loading.tsx` di level route yang membungkus logic
  `notFound()` — baca komentar di `src/app/events/page.tsx` sebelum
  menambah Suspense boundary baru di sekitar route segment.

## Data & repository

- Komponen/halaman **tidak pernah** mengimpor `@supabase/supabase-js` atau
  factory client Supabase langsung — selalu lewat `getEventRepository()`.
- Menambah field/method ke `EventRepository` berarti mengimplementasikannya
  di **kedua** `MemoryEventRepository` dan `SupabaseEventRepository`, dengan
  perilaku yang setara (test seharusnya bisa jalan di atas keduanya).
- Denormalisasi (`saved_count`) selalu disertai penjelasan alasan performa
  di komentar SQL — jangan denormalisasi tanpa alasan yang didokumentasikan.

## SQL / Supabase

- Setiap tabel baru: `ENABLE ROW LEVEL SECURITY` + policy eksplisit di
  migration yang sama. Tidak ada tabel "sementara tanpa RLS, nanti diisi" —
  Supabase mengekspos tabel `public` ke `anon` secara default.
- Setiap policy `FOR ALL`: tulis `USING` **dan** `WITH CHECK` eksplisit.
- Setiap fungsi `SECURITY DEFINER`: wajib `SET search_path = public, pg_temp`.
- Index baru harus punya alasan query yang jelas di komentar (lihat pola
  index partial `WHERE status = 'APPROVED'` di migration 0001) — jangan
  index kolom yang sudah ter-cover UNIQUE constraint lain.

## Python (pipeline)

- Semua fungsi yang berurusan dengan waktu deadline: asumsikan WIB (`UTC+7`)
  kalau sumber tidak menyebut timezone eksplisit — jangan asumsikan UTC.
- Validasi Pydantic adalah gerbang wajib **setelah** structured output LLM,
  bukan pengganti. Structured output menjamin bentuk, bukan kewarasan isi.
- Fetcher **tidak pernah** melempar exception ke pemanggil untuk kegagalan
  jaringan/robots.txt — mengembalikan `None` dan melewati sumber itu. Gagal
  membaca robots.txt = diperlakukan sebagai **dilarang**, bukan diizinkan.
- Satu event/sumber gagal tidak boleh menghentikan batch keseluruhan.

## Testing

- Test menempel di sebelah kode yang diuji: `foo.ts` + `foo.test.ts` di
  folder yang sama (lihat `src/lib/*.test.ts`). Jangan buat folder `__tests__`
  terpisah.
- Yang diuji adalah tempat bug paling mahal (per README): perhitungan hari
  lintas zona waktu, ambang urgensi deadline, bobot rekomendasi, parsing
  parameter URL, gerbang validasi pipeline. Tambahkan test baru di kategori
  yang sama kalau menyentuh logikanya.
- Jalankan `npm run verify` sebelum menyatakan perubahan selesai.

## Desain / aksesibilitas (ringkas — detail di `README.md` § Sistem desain)

- Warna tidak pernah satu-satunya pembawa makna — selalu sertai ikon+teks.
- Namespace warna semantik (`--color-danger`, dst) dan warna deadline
  (`--color-deadline-*`) terpisah — jangan dipertukarkan.
- Target sentuh minimal 44px; focus ring di semua elemen fokusable.
- Transisi 150–200ms, tanpa `translate`/`scale`. Pengecualiannya dua
  **animasi** (bukan transisi) yang berjalan sendiri dan tidak pernah
  menggeser target klik: `ticker-track` (pita tenggat) dan `reveal`.
  Keduanya patuh `prefers-reduced-motion` lewat aturan global di
  `globals.css` §3.
- **Jangan mengubah nilai token warna tanpa menjalankan
  `npm run check:contrast`.** Nilai yang "kelihatan cukup gelap" berulang kali
  meleset dari 4.5:1 — skripnya ada supaya itu ketahuan sebelum tayang.
  Kalau sebuah nilai sengaja menyimpang dari kanvas desain demi kontras,
  tulis alasannya + angka rasionya di sebelah tokennya di `globals.css`.

## Commit / PR (untuk agent yang membuat commit)

Ikuti format yang sudah ada di attribution footer kalau diminta membuat
commit/PR (lihat instruksi sistem sesi kamu untuk format terbaru — jangan
hardcode di sini karena bisa berubah per sesi).
