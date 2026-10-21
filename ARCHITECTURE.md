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
.github/workflows/              CI (verify + build + a11y + tes pipeline) dan job terjadwal:
                                scraper 02:00, expiry 00:05, notifikasi 07:00 WIB
scripts/                        check-contrast.mjs, verify-database.ts, crawl-links.mjs (penelusur tautan
                                per persona demo: HTTP ≥400, error konsol, exception — ADR-052)
tests/a11y/                     Audit axe-core (Playwright) — `npm run test:a11y`, konfigurasi di playwright.config.ts
supabase/
├── migrations/                 berurutan menurut stempel waktu (lihat SCHEMA.md)
└── DEVIATIONS.md               ← WAJIB dibaca sebelum mengubah skema
pipeline/                       Proyek Python terpisah (scraper + ekstraksi LLM)

src/
├── middleware.ts               Penyegaran sesi Supabase (no-op di mode seed)
├── app/                        Next.js App Router — page.tsx HANYA menyusun komponen
│   ├── layout.tsx              Root layout: navbar, footer, theme script
│   ├── template.tsx            Pembungkus per navigasi: animasi masuk halaman (opasitas saja, ADR-055)
│   ├── page.tsx                Beranda — GuestLanding untuk tamu; RoleHome bila masuk: peserta/penyelenggara/admin (ADR-053/056)
│   ├── error.tsx / not-found.tsx
│   ├── robots.ts / sitemap.ts  SEO — dibangun dari repository, bukan statis
│   ├── events/                 Listing + filter (force-dynamic, Suspense manual), [slug] detail + [slug]/formulir (isi formulir internal, ADR-056)
│   ├── (auth)/                 Route group — login & register (form biasa), demo/ (akun demo, tidak ditautkan dari mana pun — ADR-057), forgot/reset password
│   ├── auth/                   actions.ts (akun) + callback/route.ts (OAuth & tautan email)
│   ├── profile/                Akun: profil, data diri, minat, personalisasi (tema & gerak per perangkat, ADR-055), pengaturan, privasi
│   ├── tracker/                Papan lamaran + actions.ts (simpan, ubah tahap, hapus)
│   ├── teams/                  Cari rekan tim + baru/ (buka tim, halaman sendiri — ADR-054) + [id] detail + actions.ts
│   │   └── cocok/              Pencocokan tim/partner otomatis (ADR-057, 058): page.tsx = router tipis → form-view.tsx | results-view.tsx, shared.ts, actions.ts
│   ├── connections/            Koneksi, satu tab per tugas (?tab= untukmu|koneksi|ajakan|peta|pengaturan) + actions.ts (ADR-040, ADR-048)
│   ├── orang/[id]/             Profil publik + portofolio orang lain, wajib masuk, 404 seragam (ADR-046)
│   ├── penyelenggara/          Dasbor penyelenggara: acara aktif, riwayat acara (ADR-042/043/046); acara/[id]/ = ruang kerja
│   │                           per acara dengan tab Ringkasan (analitik) · formulir/ · pendaftar/ (+ ekspor/ CSV) · galeri/ (ADR-056)
│   ├── pembayaran/             Pendaftaran & tagihan peserta; [id]/ status, instruksi bayar, unggah bukti + actions.ts (ADR-056)
│   ├── media/                  foto/[id] (foto galeri, publik, cache 1 hari) · bukti/[id] (bukti bayar, privat, 404 bila tak berhak)
│   ├── about/                  Tentang — angka dari getStats(), klaim sesuai perilaku sistem
│   ├── submit/                 Kirim kegiatan (kiriman komunitas, boleh tamu) + actions.ts
│   ├── notifications/          actions.ts (tandai dibaca)
│   ├── api/events/[slug]/calendar/   GET berkas .ics semua tenggat (RFC 5545, ADR-049)
│   ├── api/cron/dispatch-deadline-notifications/   POST klaim + /ack — antrean pengingat untuk bot, Bearer CRON_SECRET (ADR-051)
│   └── admin/                  Antrean moderasi event + kiriman komunitas; promosi/ (lencana & promosi, ADR-049); actions.ts (auth di dalam); AdminNav di semua halaman (ADR-055).
│                               Semua halaman memakai requireAdmin() = 404 bagi non-admin dan generateMetadata (ADR-057)
│
├── components/
│   ├── ui/                     Primitif tanpa domain-knowledge (Button, Badge, Card,
│   │                           Field/TextInput/SelectInput/TextArea/FormAlert + controlClass),
│   │                           form-step.tsx (FormStep, ChoiceGroup), scroll-rail.tsx (rel tab, ADR-055),
│   │                           image-upload-field.tsx (pilih + kompres gambar di peramban sebelum diunggah, ADR-056),
│   │                           turnstile.tsx (widget CAPTCHA eksplisit, satu untuk /submit & halaman akun; `key` baru per render),
│   │                           illustrations.tsx (404/error/kosong/kalender, logomark, coretan hero — ADR-053),
│   │                           avatar.tsx (Avatar/AvatarStack bertint), feature-hero.tsx (FeatureHero,
│   │                           IllustrationStage, StatTile), feature-illustrations.tsx (tim, koneksi,
│   │                           kotak masuk, buka tim, perayaan + Confetti — ADR-054)
│   ├── landing/                GuestLanding + Hero — beranda tamu
│   ├── home/                   RoleHome memilih per peran tampilan (account-role.ts): PersonalHome (peserta — tagihan,
│   │                           perlu tindakan, pantauan), OrganizerHome (pendaftar baru, bukti bayar menunggu), AdminHome (antrean)
│   ├── registration/           Sisi peserta formulir internal: RegistrationFieldInput, RequiredChoiceGroup, RegistrationCta,
│   │                           registration-view.ts (registrationCta, registrationEventClosed — aturan tutup per detik), langkah (ADR-056)
│   ├── organizer/              Ruang kerja acara (event-workspace.tsx: tab & header), FormBuilder + registration-settings.ts
│   │                           (cermin aturan simpan server untuk setCustomValidity, diuji paritas), RegistrationRow, grafik analitik
│   ├── feedback/               ActionFeedback — render kode ?error=/?notice= (daftar tertutup); CelebrationBurst (perayaan hasil aksi, ADR-055)
│   ├── event/                  DeadlineTag/Ring/Ticker/Week, EventCard/Grid, FilterBar, Pagination,
│   │                           EmptyState, SaveButton, PriceBadge/PromotedBadge, VerifiedBadge (tooltip CSS),
│   │                           GuidebookViewer, AddToCalendarButton (<details>, tanpa JS),
│   │                           RegisterLaunch (Daftar → kartu "formulir dibuka" + tandai terdaftar, ADR-055),
│   │                           EventGallery + GalleryViewer (galeri foto acara, dialog lightbox, ADR-056), event-photo.ts (src/alt foto)
│   ├── team/                   TeamCard, TeamSeats, SeatMeter, MyTeamLink, CreateTeamForm (klien, pratinjau)
│   ├── match/                  Pencocokan (ADR-057, 058): MatchRadar + ScanStage + ScanSession (pemindaian), MatchRing & ScoreHex (skor),
│   │                           MatchCard (kartu koleksi, Server Component), MatchEndCard, MatchEmpty, ActiveFilterChips, MatchFilters (<form method="get">),
│   │                           CardSummary, SeekerForm + SkillMatrix + CardBuilder + CardMiniBar + use-seeker-draft (form pembuat kartu),
│   │                           deck/ (MatchDeck, DeckBar, InviteSheet <dialog>, use-card-drag, DeckProvider/controls — klien, mode rail→stack/grid)
│   ├── network/                NetworkGraphView (kanvas, klien), GraphDetail, kartu orang, NetworkSettings + NetworkSettingsForm (pratinjau hidup), blokir (BlockPersonDetails)
│   ├── tracker/                TrackerCard, PortfolioPanel (form hasil & visibilitas)
│   ├── profile/                PortfolioList (profil sendiri & /orang/[id])
│   ├── admin/                  SubmissionReviewCard, AdminNav
│   ├── auth/                   GoogleButton, AuthFeedback
│   └── layout/                 Navbar, NavLinks, AccountMenu, NotificationMenu, Footer,
│                               ThemeToggle, ThemeScript, DemoBanner, AccountShell (menu akun
│                               bisa dilipat jadi rel ikon — cookie `sf_sidebar`, ADR-052),
│                               NavigationProgress (bilah progres + kartu pemuat di tengah layar, ADR-053/055/056),
│                               route-scene-art.tsx (sketsa mini per adegan rute)
│
├── lib/
│   ├── data/                   ← lapisan repository, lihat di bawah
│   │   ├── repository.ts       Kontrak EventRepository (satu-satunya API data untuk UI)
│   │   ├── index.ts            getEventRepository() — pemilih implementasi
│   │   ├── listing.ts          Paging, sort, visibilitas publik — DIPAKAI KEDUA implementasi [teruji]
│   │   ├── memory-repository.ts   Mode seed (in-process)
│   │   ├── supabase-repository.ts Produksi (PostgREST, server-only)
│   │   ├── supabase-mappers.ts    Baris → domain, isUuid, sanitizeSearchQuery [teruji]
│   │   ├── seed-data.ts        Data contoh (event, kategori, tim)
│   │   └── demo-media.ts       Struk transfer contoh (PNG digambar dari kotak) untuk persona Penyelenggara
│   ├── deadline.ts             H-n, urgensi, pita 7 hari WIB — Asia/Jakarta [teruji]
│   ├── recommendation.ts       Skoring §6 + cold start [teruji] — kembaran SQL: list_personalized_events (ADR-050)
│   ├── calendar.ts             URL Google Calendar + .ics RFC 5545 (escape, lipat 75 oktet, VALARM) [teruji]
│   ├── currency.ts             formatRupiah, priceLabel (null = tidak ditebak gratis) [teruji]
│   ├── guidebook.ts            Validasi ulang tautan buku panduan + deteksi PDF [teruji]
│   ├── event-presentation.ts   Form admin lencana & promosi (Zod) [teruji]
│   ├── cron-auth.ts            Bearer CRON_SECRET, banding waktu-konstan, gagal tertutup [teruji]
│   ├── matchmaking.ts          Pencocokan tim/partner: skor 6 komponen, saringan keras, alasan & "kimia", parse/serialize query [teruji, murni] (ADR-057)
│   ├── matchmaking-schema.ts   Validasi form kartu pemain (Zod) [teruji]
│   ├── deck-gesture.ts         Matematika gestur tumpukan kartu (ambang, karet, kemiringan, kecepatan lempar) [teruji, murni] (ADR-058)
│   ├── deck-state.ts           Riwayat lewati/urungkan + `parseSkipStore` (sessionStorage yang tak dipercaya) [teruji, murni] (ADR-058)
│   ├── match-filter-release.ts Saringan aktif → kelompok & "lepas satu saringan" untuk chip dan keadaan kosong [teruji, murni] (ADR-058)
│   ├── motion-pref.ts          `isMotionReduced()` — satu-satunya pintu gerak JS ke preferensi gerak (ADR-058)
│   ├── geo.ts                  Titik pusat kota Indonesia + jarak haversine dibulatkan 5 km; koordinat rumah tidak pernah disimpan [teruji]
│   ├── network.ts              Peringkat saran koneksi, alasan, validasi form jaringan, kursor paginasi koneksi [teruji]
│   ├── network-graph.ts        Data peta koneksi (simpul/sisi, batas) dibangun di server [teruji]
│   ├── graph-layout.ts         Simulasi gaya deterministik, zoom, hit-test, penempatan label [teruji]
│   ├── search-params.ts        Parsing/serialisasi query URL [teruji]
│   ├── action-feedback.ts      Kode umpan balik Server Action + withQuery() [teruji]
│   ├── form-data.ts            Pembacaan FormData yang seragam
│   ├── auth.ts                 getSessionUser(), requireUser(), checkAdminAccess(), requireAdmin() (404 bagi non-admin), adminMetadata()
│   ├── demo/                   access.ts (murni: host demo & kunci Admin, ADR-057) [teruji], gate.ts (membaca env + header Host), personas, profile-extras
│   ├── legal.ts                Status Kebijakan privasi (draf/final) dari env, bukan dari kode (ADR-057) [teruji]
│   ├── page-title.ts           NOT_FOUND_TITLE, sectionTitle("Bagian · Subjek")
│   ├── date-input.ts           formatPickedDate(): "2026-12-12" → "Sabtu, 12 Desember 2026", dipakai DateInput [teruji]
│   ├── destination-label.ts    Nama halaman tujuan untuk "Masuk untuk membuka …" di /login (daftar tertutup per awalan path) [teruji]
│   ├── auth-schema.ts          Validasi form akun (Zod) [teruji]
│   ├── auth-messages.ts        Kode & pesan auth, pemetaan error Supabase [teruji]
│   ├── team-schema.ts          Validasi form tim (Zod) [teruji]
│   ├── submission-schema.ts    Validasi kiriman komunitas + bentuk payload JSONB [teruji]
│   ├── notifications.ts        Ambang H-3/H-1 (duplikat sadar dari SQL, ADR-017) [teruji]
│   ├── safe-redirect.ts        Penjaga open redirect untuk `?next=` [teruji]
│   ├── env.ts                  Validasi env (Zod) + penentuan dataMode
│   ├── errors.ts               AppError, ERROR_CODES, toApiError(), upstreamFailure()
│   ├── utils.ts                cn(), sanitizeExternalUrl(), safeHostname()
│   ├── greeting.ts             Sapaan & tanggal menurut jam WIB untuk beranda pribadi [teruji]
│   ├── tint.ts                 tintOf()/coverTintOf() — tint identitas deterministik (ADR-054) [teruji]
│   ├── route-scene.ts          Rute tujuan → adegan pemuat navigasi, cocok per segmen (ADR-055) [teruji]
│   ├── celebration.ts          Daftar tertutup notice yang dirayakan (ADR-055) [teruji]
│   ├── appearance.ts           Preferensi tema & gerak per perangkat, kunci localStorage (ADR-055) [teruji]
│   ├── initials.ts             initialsOf() (orang), monogramOf() (grup/kegiatan) [teruji]
│   ├── registration-form.ts    Formulir internal: skema kolom, validasi jawaban, mesin status bayar, CSV aman (ADR-056) [teruji]
│   ├── image-file.ts           Unggahan gambar: jenis dari byte, batas piksel, buang EXIF/GPS (ADR-056) [teruji]
│   ├── account-sidebar.ts      Peran tampilan (accountRoleOf) + satu daftar menu akun untuk dropdown & menu samping [teruji]
│   ├── security-headers.ts     CSP halaman + CSP ketat untuk /media/* (isMediaPath) [teruji]
│   └── supabase/
│       ├── server.ts           Klien Server Component & admin (service_role)
│       ├── middleware.ts       Klien khusus middleware (tanpa `server-only`)
│       └── cookie-options.ts   Atribut cookie sesi: httpOnly + Secure di produksi (ADR-053) [teruji]
│
└── types/
    ├── domain.ts                Bentuk data sisi aplikasi — sumber kebenaran
    └── database.ts              Bentuk baris PostgREST (tulisan tangan, lihat API_SPEC.md)
```

Aturan penempatan berkas baru:
- Komponen yang dipakai lebih dari satu halaman, atau yang membuat `page.tsx`
  lebih dari sekadar komposisi → `src/components/<domain>/`.
- Logika murni (tanpa I/O) → `src/lib/`, dengan `*.test.ts` di sebelahnya.
- Server Action → `actions.ts` di folder rute pemiliknya.
- Tidak ada folder `utils/`, `helpers/`, atau `common/` baru; beri nama
  sesuai isinya.

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
- Transisi dibatasi 150–200ms, tanpa `translate`/`scale` pada target klik (produk
  ini dipindai, bukan dinikmati). Animasi masuk & hiasan fitur unggulan: ADR-054.

## Fase produk (dari blueprint, lihat juga `TASKS.md`)

| Fase | Cakupan | Status di kode |
|---|---|---|
| Phase 1 | Listing, filter, detail, moderasi admin | Aktif |
| Phase 2 | Auth user, saved events, application tracker, rekomendasi personal | **Aktif penuh** (auth & akun, saved events, papan tracker lamaran `/tracker`, perangkingan personal `rankEvents` di beranda & jelajah) |
| Phase 3 | UGC submissions, teams, notifications | **Aktif** — `/submit` + antrean admin, `/teams`, lonceng notifikasi (produsen: job terjadwal) |
