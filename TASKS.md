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
- [ ] Belum disentuh, layak dievaluasi: `/connections` masih memuat peta + direktori +
      sidebar dalam satu halaman (pertimbangkan peta di tab/rute sendiri);
      beranda punya dua bagian yang tumpang tindih (Tur singkat vs Fitur utama).
