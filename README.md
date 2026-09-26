# StudentFo

Agregator informasi lomba, beasiswa, magang, workshop, dan kegiatan pengembangan
lain untuk pelajar dan mahasiswa di Indonesia — terkumpul di satu tempat,
tervalidasi manusia, dan selalu menampilkan sisa waktu pendaftaran.

## Jalankan dalam 30 detik

```bash
npm install
npm run dev
```

Buka http://localhost:3000. **Tidak butuh database, tidak butuh kunci API.**
Tanpa kredensial Supabase, aplikasi otomatis memakai repository in-memory berisi
data contoh, dan menampilkan penanda "Mode data contoh" di setiap halaman.

Menghubungkan backend sungguhan cukup mengisi `.env.local`; tidak ada satu baris
kode pun yang perlu diubah.

### Akun demo

Semua fitur akun bisa dicoba tanpa database. Buka **Masuk**, lalu pilih persona:

| Persona | Untuk mencoba |
|---|---|
| Mahasiswa | Rekomendasi personal (profil lengkap), simpan, tracker, tim, notifikasi |
| Siswa baru | Urutan *cold start*, lalu lengkapi profil dan lihat urutannya berubah |
| Admin moderator | Antrean `/admin`: setujui/tolak kegiatan & kiriman, atur ulang data demo |

Setiap login membuat akun sementara terisolasi (cookie bertanda tangan HMAC,
`src/lib/demo/`). Data demo diatur ulang otomatis setiap 6 jam. Detail: `DECISION.md`
ADR-024.

**Akun demo sengaja tidak bisa dipulihkan** — bukan bug. Identitasnya hanya ada
di cookie; keluar, menghapus cookie, ganti browser, atau reset 6 jam = akun
baru yang kosong. Jangan tambahkan "pulihkan akun demo" (ADR-029).

**Deploy situs demo** (mis. pratinjau Vercel tanpa Supabase): build produksi
menolak jalan tanpa kredensial, supaya situs publik tidak diam-diam menampilkan
data fiktif. Setel `ALLOW_DEMO_IN_PRODUCTION=true` dan `DEMO_SESSION_SECRET`
(`openssl rand -hex 32`) secara eksplisit.

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm run typecheck` | TypeScript strict, tanpa emit |
| `npm run lint` | ESLint |
| `npm test` | Unit test (Vitest) |
| `npm run check:contrast` | Uji kontras token warna (WCAG) |
| `npm run test:a11y` | Audit aksesibilitas axe-core di browser (Playwright; build produksi, mode seed) |
| `npm run db:verify` | Verifikasi koneksi & kesiapan database Supabase |
| `npm run db:test` | Terapkan semua migration ke Postgres kosong + test SQL (butuh `DATABASE_URL`; juga dijalankan CI) |
| `npm run verify` | typecheck + lint + test + kontras — jalankan sebelum commit (juga dijalankan CI) |

## Arsitektur

Peta folder lengkap dan aturan penempatan berkas baru ada di
[`ARCHITECTURE.md`](ARCHITECTURE.md). Ringkasnya:

```
src/app/          Rute (page.tsx hanya menyusun komponen) + actions.ts per rute
src/components/   ui/ (primitif), feedback/, event/, team/, tracker/, admin/, auth/, layout/
src/lib/          Logika murni + lapisan repository (lib/data/)
src/types/        Bentuk data domain & baris database
supabase/         Migration berurutan + DEVIATIONS.md
pipeline/         Scraper Python + ekstraksi LLM (proyek terpisah)
.github/workflows/ CI + job terjadwal (scraper, expiry, notifikasi)
```

Dokumen panduan: `AGENTS.md` (aturan wajib semua kontributor & agent AI),
`CONVENTIONS.md` (gaya kode), `API_SPEC.md` (kontrak), `SCHEMA.md` (database),
`DECISION.md` (alasan keputusan), `TASKS.md` (papan tugas).

### Lapisan repository

Seluruh UI berbicara ke `EventRepository` (`src/lib/data/repository.ts`), tidak
pernah langsung ke supabase-js. Ada dua implementasi:

| Implementasi | Kapan aktif | Untuk apa |
|---|---|---|
| `MemoryEventRepository` | Kredensial Supabase kosong | Pengembangan, tinjauan desain, uji |
| `SupabaseEventRepository` | `NEXT_PUBLIC_SUPABASE_URL` + anon key terisi | Produksi |

Manfaat konkretnya: kontributor baru cukup `npm install && npm run dev`; logika
query bisa diuji tanpa menyalakan database; dan migrasi Postgres FTS →
Meilisearch nanti hanya berarti menulis satu implementasi baru.

## Menyiapkan Supabase

1. Buat project di [supabase.com](https://supabase.com).
2. Jalankan migration berurutan (SQL Editor, atau `supabase db push`):
   ```
   supabase/migrations/20260912100001_init_types_and_tables.sql
   supabase/migrations/20260912100002_functions_and_triggers.sql
   supabase/migrations/20260912100003_row_level_security.sql
   supabase/migrations/20260912100004_views_and_seed_taxonomy.sql
   supabase/migrations/20260913100001_account_hardening.sql
   supabase/migrations/20260913110001_stats_and_saved_events.sql
   supabase/migrations/20260914100001_deadline_notifications.sql
   supabase/migrations/20260914100002_team_member_profiles.sql
   supabase/migrations/20260923100001_security_hardening.sql
   supabase/migrations/20260923110001_submission_rate_limit.sql
   ```
   Ringkasan tiap migration ada di `SCHEMA.md`. Dua migration terakhir menutup
   beberapa celah hak akses (ADR-020) dan membatasi laju `/submit` (ADR-023) —
   **wajib**, jangan dilewati.
3. Salin `.env.example` ke `.env.local` dan isi URL + anon key.
4. Uji koneksi dan kesiapan database dengan:
   ```bash
   npm run db:verify
   ```
5. Job terjadwal sudah ada di `.github/workflows/` (expiry harian, notifikasi
   tenggat, scraper). Isi GitHub Secrets `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, dan `PIPELINE_SOURCES_YAML`
   (isi lengkap `sources.yaml` — berkas itu sengaja tidak disimpan di repo).

### Autentikasi

5. **Authentication → URL Configuration**
   - *Site URL*: sama persis dengan `NEXT_PUBLIC_SITE_URL`.
   - *Redirect URLs*: tambahkan `<NEXT_PUBLIC_SITE_URL>/auth/callback`.
     Tanpa ini, tautan konfirmasi email dan kembalinya Google akan ditolak.
6. **Masuk dengan Google** — Authentication → Providers → Google:
   - Buat OAuth client di Google Cloud Console (tipe *Web application*).
   - *Authorized redirect URI* di sisi Google adalah milik Supabase, bukan
     milikmu: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Tempel Client ID & Secret ke Supabase, lalu aktifkan providernya.
   - Tombolnya selalu tampil selama Supabase terkonfigurasi; kalau provider
     belum aktif, pengguna melihat pesan yang mengarahkannya ke pengelola.
   - **Uji end-to-end (manual, belum pernah dijalankan — butuh project Google
     Cloud sungguhan):** (1) buka `/login` di jendela penyamaran, klik
     "Masuk dengan Google", **dengan JavaScript mati juga** (CSP `form-action`
     harus mengizinkan redirect ke Supabase & Google); (2) setujui consent →
     harus mendarat di `/` dalam keadaan masuk, bukan `/login?error=…`;
     (3) SQL Editor: `select full_name, role from public.users where email = '<email>'`
     → nama dari Google, peran `USER`; (4) `/profile` menampilkan nama itu dan
     TIDAK menampilkan form ganti sandi (akun OAuth tanpa sandi); (5) batalkan
     consent sekali → kembali ke `/login` tanpa pesan error. Sisi database
     langkah (3) sudah dikunci `supabase/tests/50_oauth_profile_sync.test.sql`.
7. **Menjadikan seseorang admin** — hanya lewat SQL Editor (service_role),
   tidak ada jalur dari aplikasi:
   ```sql
   UPDATE public.users SET role = 'ADMIN' WHERE email = 'kamu@contoh.com';
   ```

`SUPABASE_SERVICE_ROLE_KEY` hanya dibutuhkan pipeline dan aksi admin. Kunci itu
mem-bypass RLS — jangan pernah diberi prefix `NEXT_PUBLIC_`, dan jangan di-commit.

## Pipeline data

Lihat [`pipeline/README.md`](pipeline/README.md). Ringkasnya: cron 02:00 WIB →
ambil HTML (patuh `robots.txt`, jeda 2–5 detik per domain, User-Agent yang jujur)
→ ekstraksi Gemini dengan JSON schema → validasi Pydantic → dedup → masuk sebagai
`PENDING` → **disetujui manusia** di `/admin` → tayang.

Tidak ada satu pun jalur di pipeline yang boleh menulis `APPROVED`.

## Sistem desain

Token didefinisikan sekali di `src/app/globals.css` dan dijembatani ke Tailwind v4
lewat `@theme inline`. Penamaan mengikuti Blueprint v3 §4 (`--color-accent`,
`--color-deadline-*`, `--space-*`, `--radius-*`) supaya dokumen desain dan kode
tidak terpisah jalan.

**Nilainya** mengikuti kanvas desain produk (Indigo `#4F46E5` di atas cream
`#FAF8F4`, netral hangat, amber untuk urgensi) — lihat `DECISION.md` ADR-016,
yang menggantikan ADR-005. Beberapa nilai sengaja **menyimpang** dari kanvas
karena gagal ambang kontras; setiap penyimpangan ditulis alasannya tepat di
sebelah tokennya di `globals.css`, lengkap dengan angka rasionya.

Prinsip yang dipegang:

- **Warna tidak pernah jadi satu-satunya pembawa makna.** Setiap penanda tenggat
  punya ikon dan teks, bukan hanya merah/kuning.
- **Warna semantik dan warna tenggat dipisah namespace.** "Mendesak" di tenggat
  soal waktu; "error" soal aksi yang gagal. Menukar keduanya membuat pengguna
  salah baca prioritas.
- **Target sentuh minimal 44px** di semua elemen interaktif (WCAG 2.5.5).
- **Focus ring di semua elemen fokusable**, bukan hanya `<button>`.
- **Transisi 150–200ms, tanpa translate/scale.** Produk ini dipindai, bukan
  dinikmati; kartu yang melompat menggeser target klik.
- **Filter berbasis `<form>` dan `<a>`, tanpa state klien.** Tetap berfungsi
  tanpa JavaScript, setiap kombinasi filter punya URL sendiri, tombol back bekerja.

## Aksesibilitas — yang sudah diukur, bukan diasumsikan

### Audit halaman — axe-core di browser sungguhan

```bash
npx playwright install chromium   # sekali saja
npm run test:a11y                 # juga dijalankan CI (job `a11y`)
```

`tests/a11y/axe.spec.ts` membangun build produksi (mode seed) lalu mengaudit
setiap halaman publik dengan aturan WCAG 2.2 A/AA di tiga proyek: terang,
gelap, dan ponsel. Juga memeriksa tautan lompat-ke-konten dan bahwa tidak ada
halaman yang bisa digeser ke samping. Audit pertamanya (2026-09-23)
menemukan tiga cacat nyata yang lolos dari audit token: `aria-pressed` di
tautan filter, teks redup di atas panel bersarang/info (4.3:1), dan navbar
yang melebar 162px di ponsel.

### Kontras token — otomatis, bisa dijalankan ulang

```bash
npm run check:contrast   # ikut dijalankan oleh `npm run verify`
```

`scripts/check-contrast.mjs` membaca nilai token **langsung dari
`globals.css`** (termasuk mengomposit warna semi-transparan ke latarnya),
lalu menguji 27 pasangan di kedua tema terhadap ambang yang relevan — 4.5:1
untuk teks (WCAG 1.4.3) dan 3:1 untuk komponen non-teks seperti focus ring
dan titik urgensi (WCAG 1.4.11). Saat ini **48/48 lulus**; yang paling ketat
`--color-text-placeholder` 4.58:1 (terang) dan teks putih di atas accent
gelap 4.54:1.

Skripnya sengaja dibuat sebagai berkas, bukan angka yang diketik di README:
versi sebelumnya mengklaim "18/18 lolos" dengan nilai yang jadi usang diam-
diam begitu palet diganti. Klaim aksesibilitas yang basi lebih berbahaya
daripada tidak ada klaim, karena ia menghentikan orang memeriksa ulang.

Tiga temuan nyata dari audit ini saat palet diselaraskan ke kanvas desain:
amber kanvas (`#B0701F`) cuma 3.82:1 sebagai teks, amber terangnya
(`#F4A340`) cuma 1.95:1 sebagai titik penanda (gagal 1.4.11, bukan cuma
1.4.3), dan accent dark-mode yang "terlihat pas" menjatuhkan label tombol
putih ke 4.31:1. Ketiganya sudah dikoreksi.

### Yang masih diperiksa manual (belum otomatis)

Poin-poin berikut diverifikasi pada tata letak **sebelum** penyelarasan
desain terakhir, dengan Chromium headless di 320/390/768/1440px:

- **Tidak ada horizontal overflow** di keempat lebar, kedua tema. Termasuk 320px,
  yang juga mewakili zoom 200% di layar 640px (syarat WCAG 1.4.4).
- **Tidak ada tombol/tautan tanpa nama aksesibel.**
- Setiap elemen fokusable punya focus ring; skip-link tersedia di awal halaman.
- Penanda tenggat membawa ikon + teks, tidak mengandalkan warna saja.

> ⚠️ Beranda, navbar, dan footer **dirombak setelah** pengukuran itu, dan
> halaman `/teams` sepenuhnya baru. Keempatnya belum diperiksa ulang untuk
> overflow dan urutan fokus. Lihat `TASKS.md` § Pipeline & DevOps untuk
> rencana mengubah audit ini jadi skrip Playwright/axe yang tersimpan.

## Uji

```bash
npm test                                  # 195 uji: deadline & pita WIB, skoring, notifikasi, sesi demo, env, akun, tim, kiriman
python pipeline/tests/test_models.py      # 12 uji: validasi & dedup pipeline
python pipeline/tests/test_publisher.py   # 4 uji: payload RPC staging
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  npm run db:test                         # semua migration + RLS, FTS, staging, dedup, notifikasi
```

Jalankan Postgres lokal untuk `db:test` dengan
`docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15`.

Yang diuji adalah tempat bug paling mahal: perhitungan hari lintas zona waktu,
ambang urgensi, bobot rekomendasi, parsing parameter URL dari pihak tak dipercaya,
aturan kata sandi & penyaringan tujuan redirect, dan gerbang validasi sebelum
data masuk database.
