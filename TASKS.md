# TASKS.md

Papan tugas untuk mengorkestrasi pekerjaan lintas AI model (Claude, GPT,
Gemini, dst) dan manusia di repo ini. Setiap tugas yang dikerjakan agent
sebaiknya tercatat di sini **sebelum** mulai (klaim) dan diperbarui setelah
selesai — supaya agent lain / sesi lain tidak mengerjakan hal yang sama
secara duplikat atau bertabrakan.

## Cara pakai

- Status: `[ ]` belum dikerjakan · `[~]` sedang dikerjakan · `[x]` selesai.
- Tandai pengerjaan dengan `@siapa` (nama model/agent atau manusia) di akhir
  baris supaya jelas siapa yang sedang pegang, mis. `[~] ... @claude`.
- Kalau tugas menyentuh keputusan arsitektural, tambahkan entri di
  `DECISION.md` saat selesai, lalu tautkan dari sini.
- Kalau tugas menyentuh skema Supabase, jalankan migration baru (jangan
  edit migration lama yang sudah ada), dan catat penyimpangan dari
  blueprint di `supabase/DEVIATIONS.md` kalau relevan.
- Sebelum mengklaim tugas: jalankan `npm run verify` di kondisi awal untuk
  pastikan baseline hijau, supaya kegagalan yang muncul nanti jelas
  berasal dari perubahanmu.

---

## Backlog — Phase 1 (pengerasan / utang teknis yang diketahui)

- [x] `organizerCount` di `SupabaseEventRepository.getStats()` — RPC
      `COUNT(DISTINCT organizer)` dibuat via migration
      `20260913110001_stats_and_saved_events.sql` dan dipanggil di
      `SupabaseEventRepository.getStats()`. Hasil identik dengan MemoryEventRepository @gemini
- [ ] Pencarian FTS memakai konfigurasi `public.indonesian` yang sebenarnya
      = `simple` tanpa stemming (lihat `SCHEMA.md` § Full-text search,
      `supabase/DEVIATIONS.md` #1). Evaluasi pasang dictionary Snowball
      Indonesia, ATAU jadikan pemicu resmi migrasi ke Meilisearch (§2
      blueprint) kalau recall mulai jadi keluhan nyata (bukan spekulatif).
- [ ] Belum ada test end-to-end/integration untuk `SupabaseEventRepository`
      terhadap instance Supabase sungguhan (test yang ada menguji logika
      murni & `MemoryEventRepository`). Pertimbangkan test terhadap
      Supabase local (`supabase start`) sebelum menambah query kompleks baru.
- [ ] Audit aksesibilitas (kontras, fokus, overflow) di README didasarkan
      pada skrip Playwright manual yang "ada di riwayat pengembangan" tapi
      tidak berkas terpisah di repo saat ini — pertimbangkan menyimpan
      skrip auditnya sebagai file nyata (`scripts/` atau `tests/a11y/`)
      supaya bisa dijalankan ulang tanpa menulis ulang dari nol.

## Backlog — Phase 2

- [x] Auth user (Supabase Auth): daftar, masuk, Google OAuth, lupa & setel
      ulang kata sandi, ganti kata sandi, keluar, penyegaran sesi di
      middleware, halaman profil (jenjang + jurusan + minat), menu akun di
      navbar, gerbang admin nyata. Lihat `DECISION.md` ADR-010 s/d ADR-013.
- [x] Tutup celah privilege escalation kolom `users.role` — migration
      `20260913100001_account_hardening.sql`, `DECISION.md` ADR-013.
- [~] **Verifikasi alur auth terhadap Supabase sungguhan.** Skrip verifikasi
      koneksi mandiri ditambahkan (`scripts/verify-database.ts` via `npm run db:verify`).
      Tinggal mengisi kredensial Supabase di `.env.local` saat deploy @gemini
- [x] Rekomendasi personal — `profile` (jenjang + minat) ditambahkan ke
      `EventQuery`, disambungkan ke `sortSummaries()` & `rankEvents()`,
      diintegrasikan ke `listEvents` di kedua repository, serta homepage dan
      listing events (@gemini).
- [x] Saved events (simpan/batal simpan event) — kontrak `EventRepository`
      ditambah `isEventSaved`, `listSavedEventIds`, `saveEvent`, `unsaveEvent`,
      `listSavedEvents` (di kedua repository). Komponen `SaveButton` dan Server
      Action `toggleSaveEventAction` aktif di UI (@gemini).
- [x] Application tracker (`application_tracker`) — method tracker di
      `EventRepository` (Memory & Supabase), Server Action
      `updateTrackerStatusAction` dan `removeTrackerAction`, serta papan
      tracker nyata di `src/app/tracker/page.tsx` (@gemini).
- [x] Notifikasi tenggat & sistem (`notifications`) — `EventRepository` diperluas
      dengan `listNotifications`, `countUnreadNotifications`,
      `markNotificationAsRead`, `markAllNotificationsAsRead` (lengkap di kedua
      repository). Lonceng + menu notifikasi ada di navbar
      (`src/components/layout/notification-menu.tsx`, tanpa JavaScript klien).
      Produsennya fungsi Postgres `create_deadline_notifications()`
      (migration `20260914100001_deadline_notifications.sql`) yang dijadwalkan
      `.github/workflows/deadline-notifications.yml`. Lihat `DECISION.md` ADR-017.
      CATATAN: ambang H-3/H-1 sengaja diduplikasi di `src/lib/notifications.ts`
      dan di SQL — ubah keduanya bersamaan. @claude
- [ ] Pertimbangkan pembatasan laju sendiri untuk percobaan masuk. Saat ini
      bersandar penuh pada pembatasan bawaan Supabase Auth; pembatas
      in-memory tidak dipakai karena tidak berlaku lintas instance di
      lingkungan serverless. Butuh penyimpanan bersama (mis. Redis) kalau
      mau ditambah.

## Backlog — sisa dari kanvas desain (belum diimplementasikan)

Dua elemen di kanvas desain "StudentHub Beranda" sengaja BELUM dibuat saat
penyelarasan desain 2026-09-14. Keduanya butuh data yang belum ada, jadi
membuatnya sekarang berarti menampilkan angka karangan di beranda.

- [ ] **Pita "Minggu ini"** — 7 kolom hari dengan bar jumlah tenggat per hari.
      Konteks: butuh agregasi "berapa tenggat jatuh pada tiap hari kalender
      dalam 7 hari ke depan". `RepositoryStats` sekarang hanya punya
      `closingThisWeek` (satu angka total), bukan rinciannya per hari.
      Definisi selesai: method repository baru yang mengembalikan 7 pasang
      (tanggal, jumlah) di zona WIB, lengkap di kedua repository + test
      untuk kasus lintas tengah malam WIB.

- [ ] **Panel "Linimasa kamu"** — daftar langkah persiapan per kegiatan
      (mis. "sertifikat bahasa", "surat rekomendasi") dengan status selesai
      dan bar kemajuan.
      Konteks: ini BUKAN `application_tracker` (yang melacak satu status per
      kegiatan). Yang dibutuhkan adalah checklist banyak-langkah per
      kegiatan per pengguna — tidak ada tabelnya di skema mana pun.
      Definisi selesai: tabel baru + RLS di migration yang sama, kontrak
      repository, dan UI-nya. Pertimbangkan dulu apakah fitur ini benar-benar
      dipakai sebelum menambah tabel — kanvas desain memakainya sebagai
      contoh tampilan, bukan sebagai kebutuhan yang sudah divalidasi.

## Backlog — Phase 3 (skema DB sudah ada, tidak ada UI sama sekali)

- [ ] UGC Submissions — form publik untuk submit event oleh komunitas/penyelenggara
      Konteks: Tabel `ugc_submissions` sudah menerima `INSERT` publik lewat RLS
      (`20260912100003_row_level_security.sql`). Komunitas mahasiswa butuh halaman
      `/submit` untuk mengirimkan poster dan detail lomba/beasiswa/kegiatan mereka.
      Definisi selesai: Halaman `/submit` dengan validasi Zod + Server Action,
      antrean verifikasi submission di dasbor `/admin` (approve -> salin ke `events`
      status `APPROVED`, reject -> tandai `REJECTED`), paritas di MemoryEventRepository,
      dan `npm run verify` hijau.
- [x] Teams / team_members — cari rekan tim untuk lomba. Halaman `/teams`
      (jelajah + formulir pembuatan tim) dan `/teams/[id]` (detail, gabung,
      keluar, manajemen anggota oleh ketua). Kontrak `EventRepository` diperluas
      dengan `listTeams`, `getTeamById`, `createTeam`, `joinTeam`, `leaveTeam`,
      `removeTeamMember`, `deleteTeam` — lengkap di kedua repository, dengan
      otorisasi ketua diperiksa di dalam repository (bukan hanya mengandalkan
      RLS, supaya mode seed tidak lebih longgar dari produksi).
      Migration `20260914100002_team_member_profiles.sql` menambahkan view
      `team_member_profiles` supaya nama anggota terbaca tanpa melonggarkan
      `users_select_own`. Lihat `DECISION.md` ADR-018. @claude
      CATATAN: jangan tambah kolom ke view itu — lihat alasannya di ADR-018.

## Pipeline & DevOps

- [ ] `pipeline/config/sources.yaml` belum ada di repo (hanya
      `.example.yaml`) — setiap deployment perlu mengisi sumber scraping
      sendiri. Bukan bug, tapi pastikan dokumentasi onboarding menyebutnya
      eksplisit sebelum menjadwalkan cron produksi.
- [ ] Cron scheduler GitHub Actions workflow untuk `pipeline/run.py` dan `expire_past_events()`
      Konteks: Scraper perlu berjalan otomatis setiap pukul 02:00 WIB, dan fungsi
      Postgres `SELECT public.expire_past_events();` perlu dipanggil setiap hari
      agar status event lewat tenggat otomatis berubah dari `APPROVED` ke `EXPIRED`.
      Definisi selesai: File `.github/workflows/scraper-cron.yml` dan
      `.github/workflows/expire-events.yml` ditambahkan ke repo dengan panduan
      konfigurasi GitHub Secrets.
      CATATAN: `.github/workflows/deadline-notifications.yml` sudah ada dan bisa
      dipakai sebagai pola — termasuk `--fail-with-body` pada curl (tanpa itu
      workflow tampak hijau padahal RPC-nya menolak) dan catatan bahwa cron
      GitHub Actions memakai UTC, bukan WIB.
- [ ] `pipeline/run.py` mengasumsikan `gemini-2.0-flash` — recheck nama
      model masih valid sebelum deploy (model id API pihak ketiga bisa
      berubah/deprecated tanpa terkait perubahan repo ini).
- [ ] Skrip audit aksesibilitas otomatis Playwright / axe-core (`tests/a11y/`)
      Konteks: Memastikan standar kontras warna WCAG 2.5.5, navigasi keyboard (target sentuh ≥44px),
      dan atribut ARIA selalu teruji otomatis sebelum rilis.
      Definisi selesai: File pengujian `tests/a11y/axe.spec.ts` yang dapat dijalankan
      mandiri via npm script.

## Template tugas baru

```md
- [ ] <deskripsi tugas singkat, actionable> @<pengklaim>
      Konteks: <kenapa ini perlu, link ke ARCHITECTURE/SCHEMA/DECISION kalau ada>
      Definisi selesai: <kriteria konkret, mis. "npm run verify hijau +
      test baru untuk kasus X">
```

## Riwayat singkat (opsional, isi kalau berguna untuk sesi berikutnya)

- **2026-09-13 — Sistem akun (Phase 2a).** Ditambahkan: middleware
  penyegaran sesi, `/login`, `/register`, `/forgot-password`,
  `/reset-password`, `/auth/callback`, `/profile`, menu akun di navbar,
  dan Server Action akun. Seluruhnya tanpa JavaScript klien. Ditemukan &
  ditutup dalam pengerjaan ini: `REVOKE UPDATE (role)` di migration 0003
  tidak pernah berefek (ADR-013) — setiap pengguna sebenarnya bisa
  mempromosikan diri jadi ADMIN begitu pendaftaran dibuka. Yang BELUM:
  verifikasi terhadap Supabase sungguhan, dan penyambungan profil ke
  peringkat rekomendasi.
- **2026-09-13 — Pengerasan backend, database RPC, saved events & application tracker (Phase 2b).**
  Ditambahkan:
  1. Migration `20260913110001_stats_and_saved_events.sql` untuk RPC `get_distinct_organizer_count()`.
  2. Kontrak `EventRepository` diperluas dengan method saved events & application tracker (diimplementasikan di `MemoryEventRepository` dan `SupabaseEventRepository`).
  3. `EventQuery` kini menerima `profile` dan menyambungkan rekomendasi personal ke `rankEvents()`.
  4. Server Action `toggleSaveEventAction`, `updateTrackerStatusAction`, `removeTrackerAction`, serta komponen `SaveButton`.
  5. Halaman `/tracker` diubah menjadi papan kanban lamaran fungsional.
  6. Skrip verifikasi mandiri koneksi Supabase `npm run db:verify` (`scripts/verify-database.ts`).
- **2026-09-14 — Penyelarasan sistem desain + notifikasi tenggat + tim lomba.**
  Dikerjakan bersama dalam satu sesi (@claude):
  1. **Sistem desain** diselaraskan ke kanvas Claude Design: nilai token di
     `globals.css` diganti (Indigo `#4F46E5` di atas cream `#FAF8F4`, netral
     hangat, amber untuk urgensi), **nama token tidak diubah** sehingga
     jembatan Tailwind & seluruh markup lama ikut tanpa disentuh. Beranda,
     navbar (kini punya penanda halaman aktif), dan footer (panel gelap)
     dirombak; ditambah `DeadlineTicker` dan utility `urgency-dot`.
     `DECISION.md` ADR-016 — **menggantikan ADR-005**.
  2. **Notifikasi tenggat** (ADR-017) — lihat Backlog Phase 2.
  3. **Tim lomba** (ADR-018) — lihat Backlog Phase 3.
  Yang BELUM: belum ada verifikasi visual di browser oleh manusia untuk
  hasil redesain, dan jalur Supabase untuk notifikasi & tim belum pernah
  dijalankan terhadap database sungguhan (keduanya baru diuji lewat
  `MemoryEventRepository`). Dua migration baru (`20260914100001`,
  `20260914100002`) belum pernah di-apply ke project mana pun.
- **2026-09-23 — Koreksi `SupabaseEventRepository.listEvents()` sort
  `relevance` dan paginasi `sitemap.ts` (ADR-019, @claude).** Sambungan
  `rankEvents()` dari ADR-015 ternyata cacat di dua tempat: skor dihitung
  SETELAH `.range()` memotong ke satu halaman (ranking cuma bisa
  mengurutkan ulang di dalam halaman itu sendiri), dan syarat
  `&& query.profile` membuat pengunjung anonim (kondisi paling umum)
  tidak pernah di-ranking sama sekali — cold-start path di `rankEvents()`
  tidak pernah tercapai. Diperbaiki: kandidat ditarik lewat `.limit(500)`
  lalu diberi skor sebelum dipotong per halaman, `profile` diteruskan apa
  adanya termasuk `null`. Terpisah tapi ditemukan bersamaan: `sitemap.ts`
  cuma menarik 48 event pertama tanpa loop — event APPROVED/EXPIRED di
  luar itu tidak pernah masuk sitemap. Test regresi:
  `src/lib/data/supabase-repository.test.ts`,
  `src/app/sitemap.test.ts`. `npm run verify` + build bersih (129 test).
  Yang BELUM: masih belum ada test terhadap Supabase sungguhan (item
  Phase 1 di atas); begitu jumlah event `APPROVED` melewati 500,
  `RANKING_CANDIDATE_LIMIT` perlu dinaikkan atau skoring dipindah ke SQL/RPC.
