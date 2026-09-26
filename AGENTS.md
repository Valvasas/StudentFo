# AGENTS.md

Instruksi ini berlaku untuk **semua** agent/model AI yang bekerja di repo ini
(Claude, GPT, Gemini, Copilot, dst). Ini adalah dokumen paling atas —
file lain (`CLAUDE.md`, `CONVENTIONS.md`, `ARCHITECTURE.md`, `SCHEMA.md`,
`API_SPEC.md`, `DECISION.md`, `TASKS.md`) merinci topik spesifik dan tidak
mengulang isi di sini. Baca dokumen yang relevan dengan tugasmu sebelum
menulis kode.

## Apa proyek ini

StudentFo — agregator lomba/beasiswa/magang/workshop untuk pelajar &
mahasiswa Indonesia. Next.js 15 (App Router) + TypeScript strict + Supabase
(Postgres/Auth/RLS) + pipeline scraping Python terpisah. Lihat `README.md`
untuk pitch produk, `ARCHITECTURE.md` untuk peta kode.

**Fakta paling penting:** aplikasi harus tetap jalan penuh **tanpa** kredensial
apa pun (`npm install && npm run dev`). Tanpa env Supabase, `dataMode` jatuh
ke `'seed'` dan seluruh UI dilayani `MemoryEventRepository`. Jangan pernah
membuat perubahan yang mensyaratkan Supabase untuk `npm run dev` berhasil.

## Perintah wajib sebelum menganggap tugas selesai

```bash
npm run verify   # = typecheck && lint && test — jalankan sebelum menyatakan "selesai"
```

Perintah individual: `npm run dev`, `npm run build`, `npm run typecheck`,
`npm run lint`, `npm test` (Vitest, `src/**/*.test.ts`).

Kalau perubahan menyentuh `supabase-repository.ts` atau migration, jalankan juga
(butuh Postgres lokal, lihat README § Uji):
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run db:test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:integration
```

Pipeline Python (folder `pipeline/`, proyek terpisah dari Next.js — TIDAK
di-lint/typecheck oleh perintah di atas):
```bash
python pipeline/tests/test_models.py
python pipeline/run.py --config pipeline/config/sources.yaml --dry-run
```

## Aturan yang tidak boleh dilanggar tanpa diskusi eksplisit

1. **Repository pattern.** Tidak ada komponen/halaman yang boleh mengimpor
   `@supabase/supabase-js` atau `createSupabaseServerClient`/`createSupabaseAdminClient`
   langsung. Semua akses data lewat `EventRepository`
   (`src/lib/data/repository.ts`), diambil via `getEventRepository()`
   (`src/lib/data/index.ts`). Lihat `API_SPEC.md`.
2. **Paritas tipe domain ↔ enum SQL.** `src/types/domain.ts` (EVENT_TYPES,
   EDUCATION_LEVELS, EVENT_STATUSES, DEADLINE_LABELS) harus identik dengan
   enum di `supabase/migrations/20260912100001_init_types_and_tables.sql`
   dan dengan `pipeline/studentfo_pipeline/models.py`. Ubah salah satu →
   wajib ubah ketiganya di PR yang sama.
3. **RLS deny-by-default.** Setiap tabel baru di `public` WAJIB
   `ENABLE ROW LEVEL SECURITY` + policy eksplisit di migration yang sama.
   Supabase mengekspos semua tabel `public` ke role `anon` secara default —
   lupa RLS = lubang keamanan langsung tayang. Lihat `SCHEMA.md`.
4. **`SECURITY DEFINER` wajib `SET search_path = public, pg_temp`.** Tanpa
   ini rentan CVE-2018-1058. Lihat pola di
   `supabase/migrations/20260912100002_functions_and_triggers.sql`.
5. **Pipeline scraper tidak boleh menulis status selain `PENDING`.**
   Approve/reject adalah keputusan manusia di `/admin`
   (`src/app/admin/actions.ts`). Jangan tambahkan jalur otomatis yang
   men-set `APPROVED`.
6. **Otorisasi diperiksa DI DALAM Server Action**, bukan hanya di halaman
   yang merender tombolnya (Server Action = endpoint HTTP tersendiri).
   Pola: `src/app/admin/actions.ts` memanggil `checkAdminAccess()` sendiri.
7. **`dedup_hash` = sha256(title + organizer) dinormalisasi, TANPA
   `source_url`.** Ini koreksi sengaja dari blueprint asli — lihat
   `supabase/DEVIATIONS.md` butir 7. Jangan kembalikan ke bentuk lama.
8. **Deadline dihitung per hari kalender Asia/Jakarta**, bukan
   `(deadline - now) / 86400000`. Selalu lewat `src/lib/deadline.ts`.
9. **Filter berbasis `<form>` + `<a>` + URL, tanpa state klien.** Jangan
   ganti `FilterBar`/`Pagination` jadi client-state (`useState`) — ini
   keputusan aksesibilitas & SEO yang sengaja (lihat `CONVENTIONS.md`).
10. **Pesan error ke klien selalu manusiawi & aman.** Lewat
    `AppError`/`toApiError()` di `src/lib/errors.ts`. Jangan biarkan pesan
    driver Postgres atau stack trace bocor ke response.
11. **Otorisasi selalu pakai `getSessionUser()` (yang memanggil
    `supabase.auth.getUser()`), tidak pernah `getSession()`.** `getSession()`
    hanya membaca cookie dan mempercayainya; hanya `getUser()` yang
    memverifikasi token ke server auth.
12. **Alur akun tidak boleh membocorkan apakah sebuah email terdaftar.**
    Login, daftar, dan lupa-sandi memakai pesan yang sama untuk "salah
    sandi" dan "email tidak ada". Lihat `src/lib/auth-messages.ts`.
13. **Tujuan redirect dari URL selalu lewat `safeNextPath()`**
    (`src/lib/safe-redirect.ts`). `?next=` mentah = open redirect.
14. **Tabel baru dengan kolom sensitif: atur hak per KOLOM, bukan hanya
    RLS.** `REVOKE UPDATE (kolom)` TIDAK berefek selama hak UPDATE se-tabel
    masih ada — cabut hak tabel dulu, baru `GRANT UPDATE (kolom…)`. Lihat
    migration `20260913100001_account_hardening.sql`.
15. **`REVOKE` dari `anon, authenticated`, bukan hanya dari `PUBLIC`.**
    Supabase memberi hak langsung ke kedua role itu untuk setiap tabel, view,
    dan fungsi baru di `public`. `REVOKE … FROM PUBLIC` saja tidak mencabutnya
    — dua kebocoran nyata pernah lolos karena ini (`DECISION.md` ADR-020).
16. **Umpan balik Server Action = kode dari daftar tertutup.** Jangan oper teks
    pesan lewat URL; pakai `actionError()`/`toActionErrorCode()`/`withQuery()`
    di `src/lib/action-feedback.ts` (atau `auth-messages.ts` untuk alur akun).

## Bahasa

Kode (nama variabel/fungsi/tipe) = **Inggris**. Komentar penjelasan-WHY,
copy UI, pesan error, dan dokumen (`README.md`, `DEVIATIONS.md`, dokumen ini)
= **Bahasa Indonesia**. Ikuti pola yang sudah ada, jangan campur di file yang
sama.

## Sebelum mulai coding

1. Cek apakah tugasmu sudah tercatat/relevan di `TASKS.md`.
2. Kalau tugas menyentuh skema DB → baca `SCHEMA.md` dan
   `supabase/DEVIATIONS.md` dulu.
3. Kalau tugas menyentuh kontrak data/error → baca `API_SPEC.md`.
4. Kalau ragu kenapa sesuatu ditulis seperti itu → cek `DECISION.md` dan
   `supabase/DEVIATIONS.md` sebelum "memperbaikinya" — banyak yang terlihat
   aneh sengaja begitu untuk alasan yang didokumentasikan.
5. Setelah selesai: `npm run verify`, lalu perbarui `TASKS.md` dan (kalau
   relevan) `DECISION.md`.

## Larangan umum

- Jangan menambah dependency baru tanpa alasan kuat — daftar dependency
  sengaja minim (lihat `package.json`).
- Jangan menambah `loading.tsx` di `src/app/` atau `src/app/events/` — lihat
  komentar di `src/app/events/page.tsx` (soft-404 bug yang sudah pernah
  terjadi).
- Jangan commit `.env.local` atau kunci `SUPABASE_SERVICE_ROLE_KEY`.
- Jangan menjalankan migration Supabase produksi tanpa persetujuan eksplisit
  dari pengguna.
