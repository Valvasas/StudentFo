# ARCHITECTURE.md

Peta sistem StudentFo. Untuk kontrak data/error lihat `API_SPEC.md`, untuk
skema database lihat `SCHEMA.md`, untuk alasan di balik keputusan tertentu
lihat `DECISION.md` dan `supabase/DEVIATIONS.md`.

## Gambaran besar

```
┌─────────────────────┐        ┌──────────────────────────┐
│  pipeline/ (Python)  │        │   Next.js app (src/)     │
│  cron 02:00 WIB      │        │   App Router, RSC        │
│                      │        │                          │
│  fetch → Gemini      │        │  UI ──▶ EventRepository  │
│  → Pydantic validate │──INSERT│         (interface)      │
│  → dedup             │  PENDING│        ┌────┴────┐       │
│  → events(PENDING)   │  (svc  │   Memory│         │Supabase│
│                      │  role) │ Repository│       │Repository│
└──────────┬───────────┘        │  (seed) │         │(prod) │
           │                    └──────────────────────────┘
           │ tidak pernah menulis APPROVED                │
           ▼                                               ▼
   ┌───────────────┐                              ┌──────────────┐
   │ /admin (RSC)  │── reviewEventAction (Server ─▶│  Supabase    │
   │ approve/reject│    Action, cek auth di dalam) │  Postgres    │
   └───────────────┘                              │  + RLS       │
                                                    └──────────────┘
```

Prinsip inti: **satu titik kebenaran untuk asal data** (`src/lib/data/index.ts`),
**satu titik kebenaran untuk bentuk data** (`src/types/domain.ts`), dan
**tidak ada jalur otomatis yang bisa mempublikasikan event** — hanya manusia
di `/admin` yang mengubah status jadi `APPROVED`/`REJECTED`.

## Struktur folder

```
src/
├── middleware.ts               Penyegaran sesi Supabase (no-op di mode seed)
├── app/                        Next.js App Router (route = folder)
│   ├── layout.tsx              Root layout: navbar, footer, theme script
│   ├── page.tsx                Beranda — bento grid "sorotan minggu ini"
│   ├── error.tsx / not-found.tsx
│   ├── robots.ts / sitemap.ts  SEO — dibangun dari repository, bukan statis
│   ├── events/
│   │   ├── page.tsx            Listing + filter (force-dynamic, Suspense manual)
│   │   └── [slug]/page.tsx     Detail event
│   ├── (auth)/                 Route group — layout kartu terpusat
│   │   ├── login/              Masuk (email + Google)
│   │   ├── register/           Daftar
│   │   ├── forgot-password/    Minta tautan setel ulang
│   │   └── reset-password/     Setel kata sandi baru (butuh sesi pemulihan)
│   ├── auth/
│   │   ├── actions.ts          Server Action: masuk, daftar, Google, keluar, sandi
│   │   └── callback/route.ts   Pendaratan OAuth + tautan email (code & token_hash)
│   ├── profile/                Akun: profil, minat, ganti kata sandi, keluar
│   ├── admin/
│   │   ├── page.tsx            Antrean moderasi (RSC, force-dynamic)
│   │   └── actions.ts          Server Action reviewEventAction (auth di dalam)
│   └── tracker/page.tsx        Phase 2 — papan belum ada, akun sudah aktif
│
├── components/
│   ├── ui/                     Primitif tanpa domain-knowledge (Button, Badge, Card,
│   │                           Skeleton, Field/TextInput/SelectInput/FormAlert)
│   ├── event/                  DeadlineTag, DeadlineRing, EventCard, EventGrid,
│   │                           FilterBar (+ SearchForm), Pagination, EmptyState
│   ├── auth/                   GoogleButton, AuthFeedback
│   └── layout/                 Navbar, AccountMenu, Footer, ThemeToggle, ThemeScript, DemoBanner
│
├── lib/
│   ├── data/                   ← lapisan repository, lihat di bawah
│   ├── deadline.ts             H-n, urgensi, ring progress — Asia/Jakarta [teruji]
│   ├── recommendation.ts       Skoring §6 + cold start [teruji]
│   ├── search-params.ts        Parsing/serialisasi query URL [teruji]
│   ├── auth.ts                 getSessionUser(), requireUser(), checkAdminAccess()
│   ├── auth-schema.ts          Aturan validasi form akun (Zod) [teruji]
│   ├── auth-messages.ts        Kode & pesan auth, pemetaan error Supabase [teruji]
│   ├── safe-redirect.ts        Penjaga open redirect untuk `?next=` [teruji]
│   ├── env.ts                  Validasi env (Zod) + penentuan dataMode
│   ├── errors.ts               AppError, ERROR_CODES, toApiError()
│   ├── utils.ts                cn() classnames helper
│   └── supabase/
│       ├── server.ts           Klien Server Component & admin (service_role)
│       └── middleware.ts       Klien khusus middleware (tanpa `server-only`)
│
└── types/
    ├── domain.ts                Bentuk data sisi aplikasi — sumber kebenaran
    └── database.ts              Bentuk baris PostgREST (tulisan tangan, lihat API_SPEC.md)

supabase/
├── migrations/                 4 file, berurutan (lihat SCHEMA.md)
└── DEVIATIONS.md                ← WAJIB dibaca sebelum mengubah skema

pipeline/                       Proyek Python terpisah (scraper + ekstraksi LLM)
```

## Lapisan repository (bagian paling penting untuk dipahami)

`EventRepository` (`src/lib/data/repository.ts`) adalah **satu-satunya**
kontrak yang boleh dipakai UI untuk mengambil/mengubah data event. Tidak ada
komponen yang mengimpor `@supabase/supabase-js` langsung.

```
getEventRepository()  (src/lib/data/index.ts)
        │
        ├─ dataMode === 'seed'      → MemoryEventRepository  (in-process array, dari SEED_EVENTS)
        └─ dataMode === 'supabase'  → SupabaseEventRepository (PostgREST via @supabase/ssr)
```

`dataMode` (`src/lib/env.ts`) ditentukan sekali saat startup:
`'supabase'` hanya kalau **kedua** `NEXT_PUBLIC_SUPABASE_URL` dan
`NEXT_PUBLIC_SUPABASE_ANON_KEY` terisi. Setengah-terkonfigurasi sengaja
dianggap `'seed'`, bukan dicoba-coba — supaya gagalnya jelas di satu tempat,
bukan berupa 401 acak di tiap query.

Import Supabase di `index.ts` **dinamis** (`await import(...)`) supaya
bundler tidak menarik `server-only` ke jalur yang seharusnya bisa jalan
tanpa backend sama sekali.

Kedua implementasi menghasilkan bentuk domain yang identik
(`EventSummary`/`EventDetail`), sehingga:
- Semua komponen bisa diuji tanpa menyalakan database.
- Migrasi pencarian dari Postgres FTS → Meilisearch (rencana §2 blueprint)
  = tulis satu implementasi baru dari `EventRepository`, nol perubahan di
  komponen.

## Autentikasi & sesi (Phase 2)

```
 Daftar / Masuk ──► Server Action (src/app/auth/actions.ts)
                        │  validasi Zod → supabase.auth.*
                        │  gagal → redirect ?error=<kode dari daftar tertutup>
                        ▼
 Google ───────► signInWithOAuth → URL consent → /auth/callback?code=…
 Tautan email ─────────────────────────────────► /auth/callback?code|token_hash
                        │  tukar jadi sesi (cookie)
                        ▼
 Tiap request ──► src/middleware.ts → updateSession() menyegarkan token
                        ▼
 Halaman/Action ► getSessionUser() → requireUser() / checkAdminAccess()
```

Keputusan yang membentuk bagian ini:

- **Nol JavaScript klien.** Seluruh alur akun berbasis `<form>` + Server
  Action + redirect, sama seperti filter `/events`. Tidak ada
  `useActionState`, tidak ada klien Supabase di browser. Hasil aksi dioper
  lewat `?error=`/`?notice=` berisi **kode dari daftar tertutup**
  (`src/lib/auth-messages.ts`), bukan teks pesannya — kalau teksnya yang
  dioper, URL bisa dipakai menampilkan kalimat karangan di domain kita.
- **Middleware hanya menyegarkan sesi, tidak menjaga akses.** Refresh token
  Supabase berputar dan token baru harus ditulis ke cookie; Server Component
  tidak boleh menulis cookie, jadi tugas itu wajib di middleware. Otorisasi
  tetap di halaman/Action (`requireUser()`, `checkAdminAccess()`) supaya
  penjaganya tidak terlewat saat ada rute baru.
- **`getUser()`, bukan `getSession()`.** Yang kedua hanya membaca cookie
  kiriman klien; hanya yang pertama memverifikasi token ke server auth.
- **Mode seed tetap utuh.** Tanpa kredensial Supabase, middleware keluar
  lebih awal, `getSessionUser()` mengembalikan `null` tanpa menyentuh
  cookie (jadi tidak ada rute yang ter-deopt jadi dinamis), dan halaman
  akun menampilkan penanda bahwa pendaftaran belum berfungsi.

## Alur data pipeline → publikasi

```
cron 02:00 WIB
  → fetcher.py     : robots.txt check, rate-limit per domain, honest UA
  → extractor.py   : trim HTML, kirim ke Gemini dgn JSON schema
                     (enum kategori DIBACA dari tabel categories saat itu juga)
  → models.py      : validasi Pydantic (tanggal masuk akal, 1 primary deadline, dst)
  → publisher.py   : dedup by hash, INSERT ke `events` status=PENDING
                     (service_role key — bypass RLS by design)
  → alerts.py      : crash ATAU >30% sumber gagal → Telegram
  → /admin         : manusia approve/reject (Server Action, auth diperiksa di dalam)
  → cron harian     : SELECT expire_past_events() → APPROVED lewat tenggat jadi EXPIRED
```

Tidak ada satu baris kode pun di `pipeline/` yang menulis status selain
`PENDING`. Lihat `pipeline/README.md` dan `API_SPEC.md` § Pipeline contract.

## Rendering & SEO

- `/` dan `/events` dan `/admin` : `export const dynamic = 'force-dynamic'` —
  H-n dan status moderasi harus dihitung ulang tiap request, bukan dibekukan
  di build output.
- `Suspense` di `/events` dipasang **manual** di sekitar hasil pencarian
  saja — sengaja **tidak** ada `loading.tsx` di level route (lihat komentar
  panjang di `src/app/events/page.tsx`: `loading.tsx` membuat Next.js
  men-stream shell dengan status 200 sebelum `notFound()` sempat mengubah
  status jadi 404 → soft-404 yang ikut terindeks).
- `sitemap.ts` dan `robots.ts` dibangun dari repository yang sama dengan UI,
  bukan daftar statis terpisah.

## Sistem desain

Token warna/spasi/radius didefinisikan sekali di `src/app/globals.css` dan
dijembatani ke Tailwind v4 lewat `@theme inline`. Penamaan mengikuti
Blueprint v3 §4 (`--color-accent`, `--color-deadline-*`, dst) — lihat
`CONVENTIONS.md` untuk aturan pemakaiannya (warna tidak pernah satu-satunya
pembawa makna, namespace warna semantik vs warna deadline dipisah, target
sentuh ≥44px, dll).

## Aksesibilitas & performa — batasan yang disengaja

- Filter (`FilterBar`, `Pagination`) berbasis `<form>`/`<a>` murni: berfungsi
  tanpa JS, setiap kombinasi filter = satu URL, tombol back berfungsi. Lihat
  `src/lib/search-params.ts` untuk parsing/serialisasi query.
- `DeadlineTag`/`DeadlineRing` adalah Server Component — dihitung ulang tiap
  request lewat `force-dynamic`, bukan dikirim sebagai JS klien.
- Transisi dibatasi 150–200ms, tanpa `translate`/`scale` (produk ini dipindai,
  bukan dinikmati).

## Fase produk (dari blueprint, lihat juga `TASKS.md`)

| Fase | Cakupan | Status di kode |
|---|---|---|
| Phase 1 | Listing, filter, detail, moderasi admin | Aktif |
| Phase 2 | Auth user, saved events, application tracker, rekomendasi personal | **Aktif penuh** (auth & akun, saved events, papan tracker lamaran `/tracker`, perangkingan personal `rankEvents` di beranda & jelajah) |
| Phase 3 | UGC submissions, teams, notifications | Skema DB sudah ada (`ugc_submissions`, `teams`, `team_members`, `notifications`); tidak ada UI |
