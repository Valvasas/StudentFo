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
- [x] Integration test `SupabaseEventRepository` — Postgres + PostgREST
      sungguhan (`npm run test:integration`, job CI `integration`), bukan
      `supabase start`; termasuk test paritas memory ↔ Supabase. ADR-033. @claude
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

- [ ] **(DITUNDA — ADR-038: tunggu ±100 event nyata & data tracker) Panel "Linimasa kamu"** — daftar langkah persiapan per kegiatan
      (mis. "sertifikat bahasa", "surat rekomendasi") dengan status selesai
      dan bar kemajuan.
      Konteks: ini BUKAN `application_tracker` (yang melacak satu status per
      kegiatan). Yang dibutuhkan adalah checklist banyak-langkah per
      kegiatan per pengguna — tidak ada tabelnya di skema mana pun.
      Definisi selesai: tabel baru + RLS di migration yang sama, kontrak
      repository, dan UI-nya. Pertimbangkan dulu apakah fitur ini benar-benar
      dipakai sebelum menambah tabel — kanvas desain memakainya sebagai
      contoh tampilan, bukan sebagai kebutuhan yang sudah divalidasi.

## Backlog — desain StudentHub (ADR-039): backend untuk fitur yang baru ada di mode demo

- [ ] Kolom profil publik (`headline`, `bio`, `city`, `phone`, `linkedin`, `portfolio`, peran & keahlian tim, status) + RLS per kolom & pengaturan visibilitas (kanvas Privasi). Hapus `lib/demo/profile-extras.ts` setelahnya.
- [ ] Pencapaian (tabel sendiri, milik pengguna, RLS own-row).
- [ ] Dokumen siap pakai → Supabase Storage (bucket privat, kebijakan per pengguna, batas 5 MB, PDF/JPG/PNG, pemindaian). Saat ini hanya nama berkas di localStorage.
- [ ] Preferensi notifikasi (topik × kanal, H-7/H-3/H-1, jam kirim) + pengirim email; WhatsApp butuh keputusan penyedia & biaya.
- [ ] Pesan (percakapan, anggota, pesan, laporan penyalahgunaan, batas laju) dan Ruang diskusi (grup per kegiatan, kanal, utas, balasan, suara, moderasi panitia). Keduanya butuh desain moderasi sebelum skema.
- [ ] Profil pencari tim ("Peserta solo" di Cari Tim) + ajakan tim dua arah.
- [ ] Kolom kegiatan dari kanvas yang belum ada: hadiah, stipendium, kuota, pembicara, poster — butuh perubahan pipeline & `models.py` (paritas enum/kolom).
- [ ] Riwayat tahap tracker (tabel event per perubahan) supaya halaman status bisa menampilkan tanggal tiap tahap, bukan hanya `updated_at` terakhir.
- [ ] Kebijakan privasi: pemilik mengisi alamat kontak resmi & meninjau draf bersama penasihat hukum sebelum rilis publik.
- [x] Halaman Tentang (`/about`) & Koneksi (`/connections`) dengan tema StudentHub —
      backend nyata (migration `20260927100001_network.sql`, RLS + view sempit +
      notifikasi + batas laju), peta koneksi ala Obsidian, saran berperingkat. ADR-040. @claude
- [ ] **BUTUH KONFIRMASI PEMILIK.** Apply migration `20260927100001_network.sql` dan
      `20260928100001_connection_blocks.sql` ke Supabase staging, `npm run db:verify`,
      lalu uji alur dua akun sungguhan (opt-in → cari → ajak → terima → notifikasi →
      blokir → buka blokir). Belum pernah di-apply ke Supabase mana pun.
- [x] Koneksi: blokir — tabel `connection_blocks` + `is_blocked()` di policy INSERT/UPDATE
      `connections`, trigger pemutus, kunci pasangan (balapan blokir vs ajakan),
      direktori tersaring dua arah, view `blocked_people`, UI di baris koneksi / kartu
      ajakan / panel peta + bagian "Diblokir". Uji: `96_connection_blocks.test.sql`,
      `lib/data/network.test.ts`, integration & paritas, e2e tanpa JS. ADR-041. @claude
- [x] Koneksi: paginasi `listConnections` (kursor keyset, `countConnections()` untuk
      angka, "Muat lebih banyak" = `?tampil=N`). Uji paritas memori ↔ Supabase +
      1.200 baris melewati `max_rows`. ADR-041. @claude
- [ ] Koneksi: **laporkan** (antrean moderasi) — tunggu desain moderasi bersama Pesan/Ruang diskusi (ADR-041).
- [ ] DITUNDA — Koneksi: `pg_trgm` untuk pencarian nama bila profil opt-in > ±50k (ADR-040).
      Belum ada data pengguna nyata (pola penundaan Linimasa, ADR-038 #1); jangan tambah
      indeks sebelum ada sinyal butuhnya.

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

- [~] **Apply migration `20260923100001_security_hardening.sql`** dan
      `20260923110001_submission_rate_limit.sql` ke Supabase
      lokal/staging dulu, jalankan `npm run db:verify`, uji manual alur tim
      (gabung saat penuh, tamu melihat jumlah anggota), simpan event, dan
      setujui kiriman `/submit`. Belum pernah dijalankan terhadap Postgres
      sungguhan (mesin pengerjaan tidak punya Postgres). Lihat ADR-020.
- [x] Jalankan `python pipeline/tests/test_models.py` — 12/12, `test_publisher.py`
      4/4, dry-run OK (venv Python 3.11, 2026-09-26). @claude
- [x] Pembatasan laju untuk `/submit` — trigger Postgres (migration 0009,
      ADR-023) + paritas di `MemoryEventRepository`. Kode `submission_rate_limited`. @claude
- [x] Notifikasi ke pengirim saat kiriman disetujui/ditolak — in-app ke akun
      yang masuk saat mengirim (`submitted_by`), bukan email. ADR-037. @claude

## Hasil sesi 2026-09-26 (@claude) — keamanan, login, skalabilitas, demo

Selesai (detail & bukti di commit + ADR):
- [x] CSP bernonce + HSTS (ADR-027) · [x] kartu moderasi menampilkan sumber
- [x] RLS `(select auth.uid())` — InitPlan, 8× di seq scan (migration 20260926100001)
- [x] Pembatas laju masuk/daftar/lupa-sandi/submit per IP + Turnstile (ADR-028)
- [x] Job harian ke pg_cron (ADR-030) · [x] log moderasi append-only + `/admin/riwayat` (ADR-031)
- [x] Sinyal niat + `/admin/kalibrasi` (ADR-032) · [x] akun demo tidak dipulihkan — disengaja (ADR-029)
- [x] Integration test PostgREST + paritas (ADR-033) — menemukan pencarian produksi gagal total (20260926150001)
- [x] Cache lapisan data + `revalidateTag` (ADR-034) · [x] benchmark 5k–50k + count otomatis (ADR-035)
- [x] Browser dalam aplikasi: tombol Google → "Buka di browser" (ADR-036)
- [x] Kabar ke pengirim kiriman (ADR-037) · [x] indikator jam reset demo
- [x] Target sentuh 44px, axe di balik login, 320/375px, `/events` tanpa JS diperbaiki
- [x] `EventRepository` dipecah 9 interface

Belum / butuh akses pemilik:
- [ ] Apply SEMUA migration 20260926* ke Supabase staging, lalu `npm run db:verify`
      (belum pernah di-apply ke project mana pun — jangan langsung produksi).
- [ ] Google OAuth end-to-end sungguhan (runbook: README § Autentikasi).
- [ ] Isi `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` + `RATE_LIMIT_SECRET` di hosting;
      uji widget Turnstile asli (egress ke Cloudflare diblokir di lingkungan pengerjaan).
- [ ] Scan securityheaders.com setelah staging publik (ADR-038 #3).
- [ ] Uji di perangkat fisik: Safari iOS privat, WebView Instagram/TikTok (ADR-036).
- [ ] 10+ sumber scraping nyata (keputusan pemilik per sumber, ADR-038 #2).
- [ ] Bila katalog > 20.000 event: denormalisasi `primary_deadline_at` + index (ADR-035).
- [ ] Job CI `integration` (PostgREST + e2e mode Supabase) belum pernah berjalan di GitHub.

## Hasil sesi 2026-09-28 (@claude) — penyelenggara terverifikasi + analitik

Selesai:
- [x] CI: Node 22 (WebSocket bawaan untuk supabase-js) + `--allow-no-sources` di dry-run pipeline
- [x] IP klien dari entri TERAKHIR `x-forwarded-for` (+ `CLIENT_IP_HEADER` opsional) — pembatas laju tidak bisa dilewati dengan XFF palsu
- [x] CSP juga untuk rute dinamis berakhiran ekstensi (`/events/x.png`)
- [x] SubmitButton (status memproses) di form jaringan/simpan/submit; favicon + kartu OG
- [x] Penyelenggara terverifikasi, klaim, permintaan perubahan, antrean admin `/admin/penyelenggara` (ADR-042)
- [x] Studio `/penyelenggara` + analitik per acara (grafik, corong, audiens k-anon, pembanding, saran) (ADR-043)
- [x] Uji: pgTAP 97/98, integration PostgREST `organizers.test.ts`, e2e `organizer.spec.ts`, axe untuk halaman baru

Belum / butuh keputusan atau akses pemilik:
- [ ] Apply migration `20260927*`, `20260928*` ke staging (BUTUH KONFIRMASI eksplisit), lalu `npm run db:verify`
      + uji manual dua akun (koneksi/blokir) dan alur penyelenggara (ajukan → verifikasi → klaim → revisi).
- [ ] Set `CLIENT_IP_HEADER` bila hosting di belakang Cloudflare (`cf-connecting-ip`).
- [ ] Uji beban nyata (k6/autocannon) terhadap staging: detail acara kini memanggil 2 RPC per kunjungan (ADR-043).
- [ ] Fase berikut yang diminta: audit visual & animasi menyeluruh, uji skalabilitas ribuan postingan (EXPLAIN ANALYZE), review DB & login.

## Monetisasi, kepercayaan, kalender, dispatch 2026-10-03 (@claude) — ADR-049/050/051

Brief "8 modul". Baseline sebelum mulai: verify 421/421, db:test lolos, integrasi 64/64.

- [x] **Modul 0** — RPC `list_personalized_events` (migration `20261003100002`): rumus `rankEvents()`
      (ADR-026, BUKAN 0.5/0.3/0.2 brief) di SQL sebelum LIMIT/OFFSET, personal + cold start;
      jendela 240 dihapus. Paritas SQL↔Node 4 profil + halaman 21/260 (`relevance-and-attributes.test.ts`).
      Diukur ulang 5k/20k/50k di mesin yang sama — angka & trade-off di ADR-050.
- [x] **Modul 1** — `/submit` diperluas (biaya, nominal, buku panduan, kontak & bukti panitia privat),
      `stripMarkup()`, kartu moderasi menampilkan semuanya. Tabel/RLS/rate limit/antrean sudah ada (Phase 3) —
      TIDAK membuat `event_submissions` baru (ADR-049 #5).
- [x] **Modul 2** — `lib/calendar.ts` (Google URL + .ics RFC 5545), `GET /api/events/[slug]/calendar`,
      `AddToCalendarButton` di panel samping & tab Tahapan.
- [x] **Modul 3** — `is_free` NULLABLE (bukan DEFAULT true — ADR-049 #1), `price_amount`, `?biaya=`,
      chip FilterBar, `PriceBadge` di EventCard + 5 papan per jenis + detail.
- [x] **Modul 4** — promosi `is_featured`/`featured_until` + index parsial, `is_promoted` di view, opt-in
      `promoted` hanya daftar umum, label "Promosi", `/admin/promosi`.
- [x] **Modul 5** — `verification_badge` (VARCHAR+CHECK), `VerifiedBadge` + tooltip CSS tanpa JS.
- [x] **Modul 6** — `guidebook_url` (https), `GuidebookViewer` (PDF di balik <details>, CSP frame-src
      hanya di rute detail).
- [x] **Modul 7** — antrean dispatch klaim/sewa/ack (`20261003100003`), route POST + `/ack`, `CRON_SECRET`.
- [x] Uji: `93_cost_promotion_dispatch.test.sql` (mutation-tested), unit 421 → 468, integrasi 64 → 76,
      e2e `cost-calendar-promotion.spec.ts`, axe & target sentuh untuk halaman baru. Playwright penuh
      (3 proyek) + e2e Supabase 5/5 hijau. Uji cache e2e-supabase kini ikut menghitung hit RPC; axe
      persona memulai dari atas halaman (sisa gulir redirect login memicu target-size palsu).
- [x] Ikut dibetulkan: tautan remah roti "Lomba" di detail 41px → ≥44px; asersi bench >20k (total perkiraan).

Belum / butuh keputusan pemilik:
- [ ] **BUTUH KONFIRMASI.** Apply migration `20261003100001..03` ke staging, lalu `npm run db:verify`.
      Urutan rilis WAJIB: migration dulu, baru deploy kode — kode ini membaca kolom & RPC baru di setiap
      listing; terbalik = `/events` error. `db:verify` kini memeriksa keduanya.
- [ ] **Jangan nyalakan bot pengirim** sebelum ada preferensi & persetujuan kanal per pengguna (backlog
      "Preferensi notifikasi") dan kolom nomor WA / chat id Telegram — payload memuat email (ADR-051).
- [ ] Bot konsumen antrean dispatch (Telegram/WA/email) — keputusan penyedia & biaya.
- [ ] Pipeline: ekstrak biaya & buku panduan (`models.py` + `stage_scraped_event`); sampai itu event hasil
      scraping tampil tanpa info biaya (disengaja, bukan "Gratis").
- [ ] Revisi penyelenggara (`EventRevisionChanges`) belum bisa mengubah biaya / buku panduan.
- [ ] Audit lencana & promosi: perubahan belum masuk `moderation_log` (trigger hanya status).
- [ ] `/submit` masih satu tenggat (pendaftaran); brief menyebut "deadlines" jamak — butuh desain form tahapan.
- [ ] Ditemukan uji baru, utang lama: chip filter `/events` 36px & judul kartu stretched-link < 44px.
- [ ] Bila katalog aktif > 20.000: komponen skor non-profil dihitung harian via pg_cron (ADR-050).

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

## Audit UI/UX 2026-09-29 (@claude) — horror vacui & alur (ADR-044)

- [x] Detail kegiatan: panel daftar di samping judul (terlihat tanpa gulir),
      tenggat/jenjang/tim tidak lagi diulang, navigasi bagian cukup tab.
- [x] Navbar konsisten di semua halaman (+ "Semua"), hero → "Jelajahi kegiatan".
- [x] Banner demo satu baris; kartu statistik duplikat di `/teams` & `/connections` dihapus.
- [x] Kartu kegiatan & kartu lomba: tanpa tag slug mentah / tanggal tiga kali.
- [x] FilterBar: "Tampilkan yang ditutup" dipisah dari urutan; chip satu baris geser di ponsel.
- [x] Kelengkapan profil & form "Cara orang menemukanmu" hanya menonjol saat butuh tindakan.
- [x] Hydration mismatch `nonce` palsu di setiap halaman (badge "1 Issue" di dev).
- [x] `/connections`: peta turun di bawah direktori (tetap satu halaman — tautan panel peta).
- [x] Beranda: bagian "Fitur utama" dihapus (duplikat Tur); klaim "formulir terisi otomatis" dikoreksi.
- [x] Ruang diskusi demo: "Gabung" membuat grup sungguhan, bukan jalan buntu "segera hadir".
- [x] Judul tab Persiapan memuat nama kegiatan; "Keluar" → "Tutup"; placeholder "segera hadir" produksi dihapus.
- [x] Crawler tautan (tamu + 4 persona, ~870 halaman): 0 tautan internal mati, 0 error konsol.
- [ ] Judul tab analitik penyelenggara masih generik ("Analitik acara") — butuh cek
      otorisasi di `generateMetadata`; nilai kecil, belum dikerjakan.

## Audit pipeline & moderasi 2026-09-29 (@claude) — ADR-045

- [x] Uji jalur scraping sungguhan (`test_fetch_extract.py`, 10 uji) + tanggal tanpa jam (`test_models`).
- [x] Judul `<article><header>` kini sampai ke LLM; robots.txt 5xx dilewati; jeda robots→halaman.
- [x] Alarm palsu untuk halaman tanpa kegiatan buka; dry-run tanpa Telegram; crash setup ikut diperingatkan.
- [x] `requires_javascript` dirender Playwright (diuji dengan Chromium sungguhan); `tenacity` yang tak terpakai dihapus.
- [x] Uji end-to-end manual: situs palsu → pipeline → Postgres + PostgREST → `/admin` → setujui → tayang.
- [x] Kartu moderasi: jenjang/tempat/bidang (+penanda kosong), deskripsi lengkap, konfirmasi "Tolak".
- [x] `scripts/e2e-supabase.sh` menghapus Data Cache lama sebelum build.
- [ ] Ekstraksi Gemini sungguhan belum pernah diuji di lingkungan ini (tidak ada `GEMINI_API_KEY`);
      jalankan satu sumber nyata dengan `--dry-run` dimatikan di staging sebelum cron diaktifkan.
- [x] `max_pages_per_source` dipakai lewat `link_selector` (halaman daftar → detail) — ADR-046.
- [x] Jalan balik untuk kegiatan yang tertolak: "Kembalikan ke antrean" di `/admin/riwayat` — ADR-046.

## Portofolio & riwayat per peran 2026-09-29 (@claude) — ADR-046

- [x] Pipeline: panjang judul dicek setelah dirapikan; `registration_link` relatif diselesaikan ke URL sumber.
- [x] Pipeline: `link_selector` + `detail_content_selector` (host sama, unik, dibatasi, jeda & robots tetap).
- [x] Migration `20260929100001_portfolio_and_history.sql` + uji SQL `99_portfolio_history` (mutation-tested).
- [x] Portofolio otomatis dari tracker APPLIED+; form hasil/catatan/bukti/visibilitas di `/tracker/[slug]`.
- [x] Tab "Portofolio" di profil (pemilik + pratinjau publik), menggantikan "Pencapaian" demo.
- [x] Profil publik `/orang/[id]` (aturan jaringan, 404 seragam, tombol Hubungkan); nama di Koneksi menautkannya.
- [x] Penyelenggara: "Riwayat acara" dengan angka akhir, terpisah dari "Acara aktif".
- [x] Admin: pulihkan kegiatan/kiriman tertolak ke antrean, tercatat di log moderasi.
- [x] Paritas memori ↔ Supabase (integrasi), e2e + axe untuk rute baru.
- [x] Demo: masuk ulang sebagai Penyelenggara tidak lagi melipatgandakan simpan/klik analitik.
- [ ] Verifikasi hasil oleh penyelenggara (hasil kini dilaporkan sendiri, ditandai begitu).
- [ ] Ekspor portofolio (PDF/tautan bagikan) — butuh keputusan soal akses tanpa login.

## Pengerasan produksi 2026-09-30 (@claude) — ADR-047

- [x] `global-error.tsx` + `withFallback()` untuk data navbar (root layout tidak jatuh karena lonceng).
- [x] `events.category_slugs` fisik + GIN + trigger sinkron (termasuk ganti slug) — `91_category_slugs` dengan uji negatif index.
- [x] RPC `create_team_with_leader` (INVOKER, tunduk RLS) — `92_team_atomic_rpc` + paritas integrasi.
- [x] `output: 'standalone'`, `Dockerfile`, `serverActions.allowedOrigins`.
- [x] Ditolak dengan alasan (ADR-047): `join_team_atomic` (IDOR, race sudah dijaga), Suspense `/events` (no-JS), CSP statis kedua.
- [x] Tur beranda: ritme zoom 1.0–1.9× + pembuka bab yang benar-benar mundur penuh (diukur di Chromium).
- [x] Semua `<select>` lewat `SelectInput` + panah `select-chevron`; bug zoom iOS (`text-sm`) di select tracker.
- [x] "Kirimanmu" di `/submit` + kiriman yang belum tayang di studio penyelenggara (index pemilik).
- [x] Pendaftaran: blok "Tutup dalam 7 hari, belum kamu daftar" menggantikan satu ubin terdekat.
- [x] `/admin`: panel kondisi antrean (umur tertua, lewat batas 48 jam, keputusan 7 hari).
- [x] CTA beranda tanpa teks latar berjalan.
- [ ] `docker build` belum dijalankan (tanpa daemon di lingkungan ini) — uji di CI/staging.
- [ ] Simpan alasan penolakan kiriman (kolom + form admin) supaya "Kirimanmu" bisa menyebut alasan spesifik.
- [ ] Terapkan migration 20260930100001–03 ke project Supabase — butuh persetujuan eksplisit pemilik.

## Skalabilitas UI & ruang napas 2026-09-30 (@claude) — ADR-048

- [x] `listConnections({ kind, search })` di kedua repository + unit & paritas integrasi.
- [x] `/connections` dipecah per tab; semua daftar dipaginasi kursor; cari di koneksi sendiri.
- [x] Kartu saran: 2 alasan terkuat, tanpa chip minat yang mengulang alasan; 12 chip → `<select>`.
- [x] `/messages` & `/discussions` tanpa AccountShell; diskusi: temukan grup dilipat, utas datar.
- [x] `/teams`: chip kegiatan → `<select>` (GET).
- [x] e2e/axe/target sentuh diperbarui untuk tab baru (+ uji pencarian koneksi & URL aneh).
- [ ] Backend diskusi/pesan (masih demo) — paginasi utas & percakapan saat dibangun.
- [ ] Hitungan hasil pencarian di Koneksimu ("N hasil") butuh `count` dengan saringan yang sama.

## Rencana produksi — Fase 0 audit 2026-09-30 (@claude)

Dokumen: `docs/rencana-produksi.md` (baseline nyata, koreksi premis, audit per peran,
audit skala terukur 10k pengguna / 100k event, desain Fase 1–6). Menunggu persetujuan pemilik.

- [x] Baseline: verify 421/421, db:test lolos, integrasi 64/64, Playwright 359 lolos (118 skip sengaja), e2e Supabase 5/5, pipeline 32/32.
- [ ] **P0** `gemini-2.0-flash` sudah dimatikan (1 Jun 2026) — ganti & validasi model saat start (Fase 1).
- [ ] Hotspot terukur: listing tenggat + count ≈600 ms (Q1), `event_analytics` ≈420 ms (Q5), produsen notifikasi 823 ms + sort di disk (Q6) — Fase 6.
- [ ] `reviewed_by` terbaca pemilik profil/klaim/revisi penyelenggara (hak SELECT se-tabel) — Fase 3.
- [ ] Sitemap hanya 4.800 URL; retensi `notifications`/`recommendation_signals`/email kiriman belum ada.
- [ ] Konfirmasi status migration produksi (brief vs catatan di atas tidak konsisten).

## Redesain "buku sketsa" 2026-10-04 (@claude) — ADR-052

- [x] Tipografi (Jakarta Sans + Bricolage + Caveat), palet kertas hangat, aksen stabilo, utilitas `hand`/`marker`/`sketch-box`.
- [x] `/events`: filter dilipat ke "Saring" + menu "Urutkan", chip filter aktif yang bisa dihapus, hitungan hasil.
- [x] Papan Lomba/Magang/Seminar/Workshop: filter dilipat di ponsel (`CollapsibleFilters`); Beasiswa 320px tanpa tumpang-tindih.
- [x] Kartu kegiatan didesain ulang (tidak ada badge bertabrakan), grid lebih lega.
- [x] Menu akun bisa dilipat jadi rel ikon (cookie `sf_sidebar`, tanpa JS).
- [x] Beranda (pratinjau ponsel 4:3, eyebrow tulisan tangan), detail (bagikan + persiapan di ponsel), `/submit` (kolom opsional dilipat).
- [x] Audit navigasi `scripts/crawl-links.mjs` (tamu + 4 persona).
- [x] Ilustrasi/coretan tambahan untuk empty state & 404 — dikerjakan di ADR-053.

## Penyelesaian sebelum hosting 2026-10-05 (@claude) — ADR-053

Dokumen: `docs/audit-fitur-enterprise.md` (keamanan, uji alur demo, kesenjangan per peran).

- [x] Cookie sesi Supabase `httpOnly` + `Secure` (produksi) di server & middleware.
- [x] Batas verifikasi ulang sandi (per IP+email & per akun) di `changePasswordAction`.
- [x] Batas identitas demo yang di-seed (`DEMO_SEEDED_USER_LIMIT`).
- [x] `Permissions-Policy` + `payment=()`/`usb=()`.
- [x] Beranda pribadi untuk pengguna masuk (`PersonalHome`), `DeadlineWeek` dipakai lagi.
- [x] Bilah progres navigasi (pengganti skeleton, tanpa `loading.tsx`).
- [x] Ilustrasi sketsa: 404 (+ cari & jenis kegiatan), error, hasil kosong, tracker tamu, logomark navbar/footer, coretan hero.
- [x] Pesan hasil kosong menyebut penyebab sebenarnya (kata kunci vs filter).
- [x] Ponsel: tepi pudar tab kategori; navigasi `/admin` satu baris geser + petak antrean 2 kolom.
- [ ] **P0** Syarat & Ketentuan (halaman belum ada) — butuh tinjauan legal pemilik.
- [ ] **P0** Pemantauan error (Sentry = dependency baru, butuh persetujuan) + `/api/health` + alarm pg_cron.
- [ ] **P0** Manajemen pengguna admin (cari, tangguhkan, cabut peran) + jejak audit lencana/promosi.
- [ ] **P0** Buat acara langsung dari studio penyelenggara (semua kolom, termasuk biaya & buku panduan).
- [ ] **P1** CAPTCHA Supabase Auth di daftar & lupa sandi; MFA wajib untuk ADMIN.
- [ ] **P1** Laporkan kegiatan + antrean laporan; pengingat email + preferensi kanal (ADR-051).
- [ ] **P2** `markNotificationReadAction`: batasi `revalidatePath` ke path yang dikenal.

## Fitur unggulan: tim, koneksi, kotak masuk 2026-10-05 (@claude) — ADR-054

- [x] `/teams/baru`: form buka tim di halamannya sendiri (3 langkah, pratinjau `TeamCard` asli, −/+, chip bantu-tulis).
- [x] `/teams`: kepala berilustrasi, "kamu tampil sebagai", statistik, "Tim kamu", grid kartu bersampul tint.
- [x] `/teams/[id]`: sampul, kartu anggota & kursi kosong, perayaan `team_created`, konfirmasi bubarkan/keluarkan; bug judul kegiatan tak terlihat di panel gelap.
- [x] `/connections`: kepala berilustrasi, tab pil berikon, kartu saran bersampul + alasan berikon (`suggestionReasonItems`), ajakan bergelembung, carousel ponsel, pratinjau pengaturan = kartu asli; bug overflow `sr-only` 31–100px.
- [x] `/discussions`: state di URL (back button), composer layar sendiri, sampul grup + monogram, baris utas bisa diklik penuh, linimasa balasan.
- [x] `/messages`: avatar per jenis, latar kisi, animasi pesan baru, info = Radix Dialog.
- [x] Bilah progres navigasi tidak lagi macet pada form klien (`preventDefault`).
- [x] Token tint + `check:contrast`, `lib/tint.ts`, `monogramOf`, `Avatar`/`AvatarStack`, `FeatureHero`/`IllustrationStage`/`StatTile`.
- [ ] **P2** Halaman lain belum memakai `Avatar` bertint (profil `/orang/[id]`, menu akun, panel peta) — samakan bila disentuh.
- [ ] **P2** Peta koneksi (kanvas) masih monokrom; simpul orang bisa memakai `tintOf` yang sama dengan kartunya.
- [ ] **P2** Formulir `/teams/baru`: kegiatan > 48 butuh pemilih dengan pencarian (`Picker`) alih-alih `<select>`.


## Pendaftaran langsung + studio performa 2026-10-06 (@claude) — ADR-055

- [x] Domain & aturan: `lib/registration.ts` (gerbang, kuota, antrean FIFO, transisi keputusan, form Zod, CSV aman, statistik, saran) + `registration-basics.ts` (aman-klien). 35 uji.
- [x] Repository memori (`memory-registrations.ts`, 5 formulir contoh) & Supabase (13 metode, pemetaan RAISE utuh) + migration `20261006100001` + `supabase/tests/94_registrations.test.sql` (lolos `npm run db:test` di Postgres 16; uji dicek dengan mutasi FIFO).
- [x] Peserta: CTA & meter kursi di detail acara, wizard `/events/[slug]/pendaftaran` (tanpa JS tetap jalan), tiket `/…/tiket`, batal & daftar ulang, pelacak → "Sudah daftar".
- [x] Penyelenggara: tab studio, dasbor performa, pendaftar (saring/cari/keputusan berurutan), penyusun formulir (ide cepat, peringatan data sensitif, pratinjau), ekspor CSV privat, ringkasan di `/penyelenggara`.
- [x] Katalog: lencana "Daftar di StudentFo" di semua papan, daftar umum, beranda; hero workshop & magang berilustrasi; perbaikan kontras strip tanggal workshop & tombol "Saring" di kepala gelap seminar.
- [x] Uji: `tests/e2e/registration.spec.ts` (wizard, tanpa JS + daftar tunggu, keputusan sampai ke peserta, CSV 403, data sensitif ditolak), 18 rute baru di audit axe (tiga proyek), dan `tests/integration/registrations.test.ts` — 13 metode Supabase lewat PostgREST + Postgres 16 sungguhan (`npm run test:integration`, 79/79).
- [x] Lencana katalog hanya untuk formulir OPEN yang gerbangnya terbuka (`nativeRegistrationIds`); studio menulis "Tertutup otomatis" untuk formulir OPEN yang lewat tenggat; tautan luar sekunder & nama tombol daftar setara di ponsel.
- [ ] **BUTUH KONFIRMASI PEMILIK.** Apply migration `20261006100001_event_registrations.sql` ke proyek Supabase, lalu coba alur penuh dengan akun penyelenggara sungguhan (uji lokal PostgREST sudah lolos).
- [ ] **P1** Moderator bisa menangguhkan satu formulir (status `SUSPENDED` + log moderasi) tanpa mencabut verifikasi lembaganya — formulir saat ini tayang tanpa moderasi per formulir (ADR-055).
- [ ] **P1** Tinjau hukum kebijakan privasi bagian "data pendaftaran ke penyelenggara" (bersama tugas kebijakan privasi di atas).
- [ ] **P2** Kirim email/WhatsApp untuk keputusan pendaftaran (saat ini hanya lonceng notifikasi) — ikut antrean dispatch ADR-051.
- [ ] **P2** Unggah berkas di formulir (Storage privat + pemindaian) — sekarang lewat pertanyaan tautan.
- [ ] **P2** Kuota per sesi/tiket bertingkat dan check-in hari H (pemindai kode) — keduanya butuh desain dulu.
- [ ] **P3** Studio > 2.000 pendaftar: paginasi server untuk daftar & ekspor bertahap.
