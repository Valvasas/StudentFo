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

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm run typecheck` | TypeScript strict, tanpa emit |
| `npm run lint` | ESLint |
| `npm test` | Unit test (Vitest) |
| `npm run db:verify` | Verifikasi koneksi & kesiapan database Supabase |
| `npm run verify` | Ketiganya sekaligus — jalankan sebelum commit |

## Arsitektur

```
src/
├── middleware.ts           Penyegaran sesi Supabase
├── app/                    Rute Next.js (App Router)
│   ├── page.tsx            Beranda — bento grid, sorotan tenggat
│   ├── events/             Pencarian + filter + halaman detail
│   ├── (auth)/             Masuk, daftar, lupa & setel ulang kata sandi
│   ├── auth/               Server Action akun + rute callback OAuth/email
│   ├── profile/            Akun: profil, bidang minat, ganti kata sandi
│   ├── admin/              Antrean moderasi (approve/reject)
│   └── tracker/            Papan pelacakan lamaran (kanban per tahapan)
├── components/
│   ├── ui/                 Primitif (Button, Badge, Card, Skeleton)
│   ├── event/              DeadlineTag, DeadlineRing, EventCard, FilterBar
│   └── layout/             Navbar, Footer, ThemeToggle
├── lib/
│   ├── data/               ← Lapisan repository (lihat di bawah)
│   ├── deadline.ts         Logika H-n & tingkat urgensi  [teruji]
│   ├── recommendation.ts   Skoring §6 + cold start       [teruji]
│   ├── search-params.ts    Parsing URL yang defensif     [teruji]
│   ├── env.ts              Validasi environment (Zod)
│   └── errors.ts           Kontrak error terstruktur
supabase/migrations/        Skema, fungsi, RLS
supabase/DEVIATIONS.md      ← Baca ini: di mana implementasi berbeda dari blueprint
pipeline/                   Scraper Python + ekstraksi LLM
```

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
   ```
   Migration 0005 menutup celah privilege escalation role ADMIN (ADR-013), dan
   migration 0006 menyediakan RPC distinct organizer untuk statistik beranda.
3. Salin `.env.example` ke `.env.local` dan isi URL + anon key.
4. Uji koneksi dan kesiapan database dengan:
   ```bash
   npm run db:verify
   ```
5. Jadwalkan `SELECT public.expire_past_events();` sebagai cron harian.

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

### Kontras token — otomatis, bisa dijalankan ulang

```bash
npm run check:contrast   # ikut dijalankan oleh `npm run verify`
```

`scripts/check-contrast.mjs` membaca nilai token **langsung dari
`globals.css`** (termasuk mengomposit warna semi-transparan ke latarnya),
lalu menguji 24 pasangan di kedua tema terhadap ambang yang relevan — 4.5:1
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
npm test                                  # 80 uji: deadline, skoring, parsing URL, aturan akun
python pipeline/tests/test_models.py      # 12 uji: validasi & dedup pipeline
```

Yang diuji adalah tempat bug paling mahal: perhitungan hari lintas zona waktu,
ambang urgensi, bobot rekomendasi, parsing parameter URL dari pihak tak dipercaya,
aturan kata sandi & penyaringan tujuan redirect, dan gerbang validasi sebelum
data masuk database.
