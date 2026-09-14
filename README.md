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
| `npm run verify` | Ketiganya sekaligus — jalankan sebelum commit |

## Arsitektur

```
src/
├── app/                    Rute Next.js (App Router)
│   ├── page.tsx            Beranda — bento grid, sorotan tenggat
│   ├── events/             Pencarian + filter + halaman detail
│   ├── admin/              Antrean moderasi (approve/reject)
│   └── tracker/            Phase 2, keadaan terkunci
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
   ```
3. Salin `.env.example` ke `.env.local` dan isi URL + anon key.
4. Jadwalkan `SELECT public.expire_past_events();` sebagai cron harian.

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

Diverifikasi dengan Chromium headless di 320/390/768/1440px, tema terang dan gelap:

- **Kontras:** 18/18 pasangan warna teks-latar lolos WCAG AA (≥ 4.5:1 untuk teks,
  ≥ 3:1 untuk focus ring). Yang paling ketat: `--color-text-placeholder` 4.72:1
  (terang) dan 4.56:1 di atas permukaan kartu (gelap).
- **Tidak ada horizontal overflow** di keempat lebar, kedua tema. Termasuk 320px,
  yang juga mewakili zoom 200% di layar 640px (syarat WCAG 1.4.4).
- **Tidak ada tombol/tautan tanpa nama aksesibel.**
- Setiap elemen fokusable punya focus ring; skip-link tersedia di awal halaman.
- Penanda tenggat membawa ikon + teks, tidak mengandalkan warna saja.

Skrip auditnya ada di riwayat pengembangan dan mudah dijalankan ulang dengan
Playwright kalau tata letak berubah.

## Uji

```bash
npm test                                  # 44 uji: deadline, skoring, parsing URL
python pipeline/tests/test_models.py      # 12 uji: validasi & dedup pipeline
```

Yang diuji adalah tempat bug paling mahal: perhitungan hari lintas zona waktu,
ambang urgensi, bobot rekomendasi, parsing parameter URL dari pihak tak dipercaya,
dan gerbang validasi sebelum data masuk database.
