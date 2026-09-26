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
- [x] Pencarian FTS tanpa stemming — ternyata akar masalahnya bug: migration
      0001 gagal di Postgres modern karena salah membaca ketersediaan
      `pg_catalog.indonesian`. Diperbaiki; stemming Snowball Indonesia kini aktif.
      Dikunci oleh `npm run db:test` + job CI `database` (DEVIATIONS #1). @claude
- [ ] Belum ada test end-to-end/integration untuk `SupabaseEventRepository`
      terhadap instance Supabase sungguhan (test yang ada menguji logika
      murni & `MemoryEventRepository`). Pertimbangkan test terhadap
      Supabase local (`supabase start`) sebelum menambah query kompleks baru.
- [x] Audit aksesibilitas (kontras, fokus, overflow) di README didasarkan
      pada skrip Playwright manual yang "ada di riwayat pengembangan" tapi
      tidak berkas terpisah di repo saat ini — pertimbangkan menyimpan
      skrip auditnya sebagai file nyata (`scripts/` atau `tests/a11y/`)
      supaya bisa dijalankan ulang tanpa menulis ulang dari nol.
      → Selesai: `tests/a11y/axe.spec.ts` (`npm run test:a11y`, job CI `a11y`). @claude

- [x] Audit keandalan (2026-09-25), migration `20260925100001`, dikunci
      `supabase/tests/20_pipeline_and_notifications.test.sql`: @claude
      - dedup unik hanya di antara event yang belum EXPIRED (edisi tahunan bisa masuk)
      - notifikasi berbasis rentang H-3..H-2 / H-1..H-0 (tahan cron telat)
      - publisher memakai RPC transaksional `stage_scraped_event` (tanpa event yatim, tanpa N+1)
- [x] Pindahkan `expire_past_events` & `create_deadline_notifications` ke
      `pg_cron` — migration `20260926120001`, ADR-030. Belum di-apply ke Supabase. @claude
- [ ] Integration test `SupabaseEventRepository` terhadap Supabase lokal.

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
- [x] Pembatasan laju sendiri untuk masuk/daftar/lupa sandi — batas bawaan
      Supabase Auth ternyata tidak cukup (melihat IP server, bukan IP
      pengguna). Penyimpanan bersama = Postgres, bukan Redis. ADR-028. @claude

## Backlog — sisa dari kanvas desain (belum diimplementasikan)

Dua elemen di kanvas desain "StudentHub Beranda" sengaja BELUM dibuat saat
penyelarasan desain 2026-09-14. Keduanya butuh data yang belum ada, jadi
membuatnya sekarang berarti menampilkan angka karangan di beranda.

- [x] **Pita "Minggu ini"** — `getDeadlineWeek()` di kedua repository (bucketing
      WIB lewat `buildDeadlineWeek()` di `deadline.ts`, satu fungsi untuk dua
      implementasi) + `DeadlineWeek` di beranda. Test lintas tengah malam WIB di
      `deadline.test.ts`. @claude

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

- [x] UGC Submissions — `/submit` (Zod + honeypot, boleh tamu), antrean
      "Kiriman komunitas" di `/admin`, `createSubmission`/`listSubmissions`/
      `reviewSubmission` di kedua repository. Persetujuan di produksi lewat RPC
      atomik `approve_submission()` (migration 0008). @claude
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

- [x] `pipeline/config/sources.yaml` sengaja tidak di repo (kini juga di
      `.gitignore`). `scraper-cron.yml` menulisnya dari secret
      `PIPELINE_SOURCES_YAML` dan gagal dengan pesan jelas kalau secret kosong;
      README § Menyiapkan Supabase menyebutnya eksplisit. @claude
- [x] Workflow GitHub Actions: `ci.yml` (verify + build + tes pipeline),
      `scraper-cron.yml`, `expire-events.yml`, `deadline-notifications.yml`.
      CATATAN: `deadline-notifications.yml` yang disebut sebelumnya ternyata
      TIDAK pernah ada di repo — kini dibuat. Secret yang dibutuhkan tercantum
      di kepala tiap workflow. @claude
- [~] `pipeline/run.py` kini membaca `GEMINI_MODEL` (default `gemini-2.0-flash`).
      Tetap recheck id model sebelum deploy; mengganti cukup lewat secret CI.
- [x] Skrip audit aksesibilitas otomatis Playwright / axe-core (`tests/a11y/`) @claude
      Konteks: Memastikan standar kontras warna WCAG 2.5.5, navigasi keyboard (target sentuh ≥44px),
      dan atribut ARIA selalu teruji otomatis sebelum rilis.
      Definisi selesai: File pengujian `tests/a11y/axe.spec.ts` yang dapat dijalankan
      mandiri via npm script.

## Backlog — hasil audit 2026-09-23 (belum selesai)

- [ ] **Apply migration `20260923100001_security_hardening.sql`** dan
      `20260923110001_submission_rate_limit.sql` ke Supabase
      lokal/staging dulu, jalankan `npm run db:verify`, uji manual alur tim
      (gabung saat penuh, tamu melihat jumlah anggota), simpan event, dan
      setujui kiriman `/submit`. Belum pernah dijalankan terhadap Postgres
      sungguhan (mesin pengerjaan tidak punya Postgres). Lihat ADR-020.
- [ ] Jalankan `python pipeline/tests/test_models.py` — tidak bisa dijalankan
      di sesi audit (Python tidak terpasang). CI (`ci.yml`) kini menjalankannya.
- [x] Pembatasan laju untuk `/submit` — trigger Postgres (migration 0009,
      ADR-023) + paritas di `MemoryEventRepository`. Kode `submission_rate_limited`. @claude
- [ ] Notifikasi ke pengirim saat kiriman disetujui/ditolak (email tersimpan
      di `ugc_submissions.submitted_by_email`, belum dipakai).

## Template tugas baru

```md
- [ ] <deskripsi tugas singkat, actionable> @<pengklaim>
      Konteks: <kenapa ini perlu, link ke ARCHITECTURE/SCHEMA/DECISION kalau ada>
      Definisi selesai: <kriteria konkret, mis. "npm run verify hijau +
      test baru untuk kasus X">
```

## Riwayat singkat (opsional, isi kalau berguna untuk sesi berikutnya)

- **2026-09-23 (lanjutan) — Rate limit, audit a11y otomatis, dependency (@claude).**
  1. `npm audit`: 1 high (postcss bawaan Next) + moderate (vitest). Ditutup
     dengan `overrides.next.postcss` dan vitest 3 → 4.1.11; 0 kerentanan.
     `engines.node` naik ke >=20.19 (syarat vite 8).
  2. Batas laju `/submit` di Postgres (ADR-023).
  3. `tests/a11y/axe.spec.ts` + job CI `a11y`. Audit pertama menemukan:
     `aria-pressed` di tautan chip filter (→ `aria-current`), `--color-text-muted`/
     `--color-deadline-safe` 4.3:1 di atas panel bersarang & info (→ `#6f6a5e`;
     pasangan itu kini juga ada di `check-contrast.mjs`), dan navbar melebar
     162px di ponsel sejak tab "Tim" ditambahkan (→ tab pindah ke baris kedua
     di bawah `md`).

- **2026-09-23 — Restrukturisasi, audit keamanan, kiriman komunitas (@claude).**
  1. **Struktur:** tiga salinan proyek bertumpuk diratakan jadi satu root;
     salinan lama dipindah ke luar repo (`Downloads/StudentFo-legacy-backup`).
     Komponen keluar dari `page.tsx` ke `components/<domain>/`; logika listing
     bersama di `lib/data/listing.ts`; mapper di `supabase-mappers.ts`;
     pembacaan FormData di `lib/form-data.ts` (ADR-022).
  2. **Keamanan:** teks bebas di `?error=` tidak lagi dirender (ADR-019);
     migration 0008 menutup kebocoran default privileges, peran/kapasitas
     tim, hak kolom notifikasi/UGC, batas ukuran kolom (ADR-020).
  3. **Keandalan & paritas:** `includeClosed` kini menampilkan EXPIRED di
     Supabase; relevansi diperingkat atas jendela kandidat (ADR-021); simpan
     ulang tidak memundurkan tahap tracker; id non-UUID → 404, bukan 502;
     `getEventBySlug`/`getTeamById` di-dedupe per request dengan `cache()`;
     sitemap tidak lagi terpotong di 48 event; tombol "Daftar" benar-benar
     mati saat pendaftaran ditutup.
  4. **Fitur:** `/submit` + antrean admin, pita "Minggu ini", workflow CI &
     job terjadwal. Test 119 → 161.

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
