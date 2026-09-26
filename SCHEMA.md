# SCHEMA.md

Skema database Supabase (Postgres). Sumber kebenaran adalah
`supabase/migrations/*.sql` — dokumen ini adalah ringkasan yang bisa dibaca
cepat. **Kalau ada perbedaan antara dokumen ini dan file migration, migration
yang benar.** Lihat `supabase/DEVIATIONS.md` untuk alasan setiap penyimpangan
dari blueprint asli — jangan "perbaiki" hal yang sebenarnya sudah sengaja
diubah.

Urutan migration (harus dijalankan berurutan):
1. `20260912100001_init_types_and_tables.sql` — extension, enum, tabel
2. `20260912100002_functions_and_triggers.sql` — fungsi & trigger
3. `20260912100003_row_level_security.sql` — RLS + policy
4. `20260912100004_views_and_seed_taxonomy.sql` — view + seed kategori
5. `20260913100001_account_hardening.sql` — hak kolom `users` + `handle_new_user()`
6. `20260913110001_stats_and_saved_events.sql` — RPC `get_distinct_organizer_count()`
7. `20260914100001_deadline_notifications.sql` — RPC `create_deadline_notifications()` + index dedupe
8. `20260914100002_team_member_profiles.sql` — view `team_member_profiles` + index `teams(event_id)`
 9. `20260923100001_security_hardening.sql` — pengerasan hak akses (default privileges Supabase), kapasitas tim di DB, view `team_member_counts`, RPC `approve_submission()`, batas ukuran kolom, index tambahan
10. `20260923110001_submission_rate_limit.sql` — trigger `enforce_submission_rate_limit()` pada `ugc_submissions` (3/jam per email, 100 PENDING/jam global; angka dicerminkan `SUBMISSION_RATE_LIMIT` di `src/lib/submission-schema.ts`) + index `lower(email), created_at`
11. `20260925100001_pipeline_and_notification_reliability.sql` — dedup edisi tahunan, notifikasi berbasis rentang, RPC `stage_scraped_event()`
12. `20260926100001_rls_initplan.sql` — semua policy memanggil `(select auth.uid())` / `(select public.is_admin())` (InitPlan, sekali per query)
13. `20260926110001_rate_limits.sql` — tabel `rate_limit_hits` + RPC `consume_rate_limit()` / `purge_rate_limit_hits()` (service_role saja, ADR-028)
14. `20260926120001_pg_cron_jobs.sql` — pg_cron + 3 job harian (bersyarat; ADR-030, lihat § Job terjadwal)
15. `20260926130001_moderation_log.sql` — tabel append-only `moderation_log` diisi trigger `log_moderation_change()` di `events`/`ugc_submissions`; kolom `ugc_submissions.reviewed_by/reviewed_at`; `approve_submission()` mengisi peninjau (ADR-031)
16. `20260926140001_recommendation_signals.sql` — tabel `recommendation_signals` (simpan & klik "Daftar" + snapshot profil), tulis hanya service_role (ADR-032)
17. `20260926150001_events_listing_search_vector.sql` — `events_listing` mengekspos `search_vector` (tanpanya setiap pencarian di mode Supabase gagal 42703)

> ⚠️ **Policy baru: selalu `(select auth.uid())`, bukan `auth.uid()`.** Tanpa
> pembungkus, fungsi dievaluasi per baris yang dipindai (8× lebih lambat di
> seq scan 100k baris, `supabase/bench/rls_initplan.sql`).
> `supabase/tests/30_rls_initplan.test.sql` menggagalkan `npm run db:test`
> kalau ada policy yang melanggar.

> ⚠️ **Default privileges Supabase.** Setiap tabel, view, dan fungsi baru di
> `public` OTOMATIS memberi hak ke `anon` dan `authenticated` secara eksplisit.
> `REVOKE ... FROM PUBLIC` saja TIDAK mencabutnya — selalu tulis
> `REVOKE ... FROM anon, authenticated` lalu `GRANT` yang dibutuhkan. Migration
> 0008 menutup dua kebocoran nyata akibat ini (lihat ADR-020).

## Enum types

| Enum | Nilai | Paritas TypeScript |
|---|---|---|
| `user_role` | `USER`, `ADMIN` | — (tidak ada di domain.ts, hanya dipakai `users.role`) |
| `event_status` | `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED` | `EVENT_STATUSES` |
| `event_type` | `LOMBA`, `BEASISWA`, `MAGANG`, `WORKSHOP`, `KONFERENSI`, `PELATIHAN`, `VOLUNTEER` | `EVENT_TYPES` |
| `education_level` | `SMA_SMK`, `D3`, `D4_S1`, `S2`, `S3`, `UMUM` | `EDUCATION_LEVELS` |
| `tracker_status` | `SAVED`, `APPLIED`, `INTERVIEW`, `ACCEPTED`, `REJECTED` | `TRACKER_STATUSES` |

`event_type` diperluas dari blueprint asli yang hanya `LOMBA`/`BEASISWA` —
lihat `DEVIATIONS.md` #8. **Kalau menambah nilai enum baru, ubah bersamaan
di:** migration SQL (`ALTER TYPE ... ADD VALUE`), `src/types/domain.ts`, dan
`pipeline/studentfo_pipeline/models.py`.

`event_deadlines.label` bukan enum Postgres, tapi `CHECK` constraint pada
`VARCHAR`: `'registration' | 'submission' | 'final' | 'announcement'`
(= `DEADLINE_LABELS` di domain.ts).

## Tabel

### `users`
Profil publik, disinkronkan dari `auth.users` lewat trigger
`handle_new_user()`. `role` default `'USER'`; promosi ke `ADMIN` **hanya**
lewat service_role.

> ⚠️ **Hak kolom, bukan cuma RLS.** Migration 0003 mencoba mengunci kolom
> `role` dengan `REVOKE UPDATE (role) … FROM authenticated`, dan itu **tidak
> bekerja**: di PostgreSQL hak level kolom tidak bisa mengurangi hak level
> tabel, sementara Supabase memberi `authenticated` hak UPDATE se-tabel.
> Migration 0005 memperbaikinya dengan mencabut hak tabel lalu memberikan
> kembali hanya `full_name, education_level, major, interests`. Pola yang
> sama wajib dipakai untuk setiap tabel baru yang punya kolom sensitif.

| Kolom | Tipe | Catatan |
|---|---|---|
| id | UUID PK | = `auth.users.id`, `ON DELETE CASCADE` |
| email | VARCHAR UNIQUE | |
| full_name | VARCHAR | fallback: bagian sebelum `@` di email |
| role | user_role | default USER; kolom terkunci dari self-update |
| education_level | education_level? | |
| major | VARCHAR? | |
| interests | TEXT[] | dipakai `recommendation.ts` §6 (Phase 2) |
| created_at / updated_at | TIMESTAMPTZ | updated_at via trigger `touch_updated_at` |

### `categories`
Taksonomi bidang. Read-only publik; tulis hanya admin/service_role. **Ini
adalah sumber enum untuk `categories` field di JSON schema yang dikirim ke
Gemini** — pipeline membaca tabel ini saat runtime
(`publisher.fetch_category_slugs`), tidak hardcode. Di-seed 12 baris awal di
migration 0004 (teknologi, bisnis, sains, desain, karya-tulis, debat, seni,
olahraga, kesehatan, sosial, pendidikan, hukum).

| Kolom | Tipe |
|---|---|
| id | UUID PK |
| name | VARCHAR(50) UNIQUE |
| slug | VARCHAR(50) UNIQUE |

### `events` (tabel master)

| Kolom | Tipe | Catatan |
|---|---|---|
| id | UUID PK | |
| slug | VARCHAR(120) UNIQUE | auto-generated dari title kalau kosong (trigger `events_fill_derived`), tabrakan → suffix numerik |
| title, organizer | VARCHAR | `CHECK` tidak boleh kosong setelah `btrim` |
| description | TEXT? | |
| event_type | event_type | |
| registration_link, source_url | TEXT | `CHECK ~* '^https?://'` |
| dedup_hash | VARCHAR(64) UNIQUE | `sha256(normalize(title)+'|'+normalize(organizer))` — **TIDAK** termasuk `source_url`, lihat DEVIATIONS #7 |
| education_levels | education_level[] | default `{}` |
| location | VARCHAR(120)? | NULL = tidak diketahui |
| is_online | BOOLEAN | default false |
| status | event_status | default PENDING |
| reviewed_by | UUID? → users(id) | |
| reviewed_at | TIMESTAMPTZ? | wajib terisi kalau status APPROVED/REJECTED (`CHECK events_review_trail`) |
| rejection_reason | TEXT? | |
| saved_count | INT | denormalisasi, disinkron trigger `sync_saved_count` dari `saved_events` |
| created_at / updated_at | TIMESTAMPTZ | |
| search_vector | tsvector GENERATED | lihat § Full-text search di bawah |

Index: `status`, `event_type`, GIN `search_vector`, GIN `education_levels`,
partial `(created_at DESC) WHERE status='APPROVED'`. Tidak ada index
terpisah untuk `dedup_hash` — constraint UNIQUE sudah membuatnya (DEVIATIONS #15).

### `event_categories` (join)
`(event_id, category_id)` PK komposit + index balik di `category_id`.

### `event_deadlines`
Multi-stage per event. `label` dibatasi CHECK ke 4 nilai. **Maksimal satu
`is_primary=true` per event**, dipaksa `UNIQUE INDEX idx_one_primary_deadline
(event_id) WHERE is_primary`.

### `saved_events` (Phase 2)
`(user_id, event_id)` PK komposit. Trigger `sync_saved_count` menjaga
`events.saved_count` tetap akurat di INSERT/DELETE.

### `application_tracker` (Phase 2)
Status personal per user per event (`tracker_status`). `UNIQUE(user_id, event_id)`.
`notes` dibatasi 500 karakter (CHECK, 0008). Sejak 0008, INSERT hanya untuk
event yang terlihat publik (`APPROVED`/`EXPIRED`) — berlaku juga untuk `saved_events`.

### `notifications` (Phase 2 — sudah ada UI)
Pengingat tenggat per user. Diisi **hanya** oleh
`create_deadline_notifications()` (service_role); aplikasi cuma membaca dan
menandai dibaca. `type` adalah VARCHAR(50), **bukan enum** — jadi tidak ada
aturan paritas tiga-tempat; penyempitannya di `toNotificationType()`.
Partial unique index `idx_notifications_dedupe (user_id, event_id, type)
WHERE event_id IS NOT NULL` yang membuat produsennya idempoten.

### `teams`, `team_members` (Phase 3 — sudah ada UI di `/teams`)
`teams.slots_needed` punya `CHECK (BETWEEN 1 AND 50)`; batas yang sama
ditegakkan ulang di `src/lib/team-schema.ts` supaya pelanggarannya muncul
sebagai pesan Indonesia, bukan error CHECK constraint. `team_members.role`
VARCHAR(50) tanpa enum (`'leader'` / `'member'`, disempitkan lewat
`toTeamRole()`). Tidak ada policy UPDATE di `team_members` — peran tidak
bisa diubah setelah bergabung.

Batas jumlah anggota ditegakkan database sejak 0008 lewat trigger
`enforce_team_capacity()` (BEFORE INSERT, mengunci baris tim `FOR UPDATE`
sehingga dua "gabung" bersamaan untuk slot terakhir tidak lolos keduanya).
Policy INSERT `team_members` juga mensyaratkan `role = 'member'` kecuali ketua
mendaftarkan dirinya sendiri di tim miliknya. Tim hanya bisa dibuat untuk
event `APPROVED` (`teams_owner_insert`).

### `moderation_log` (riwayat moderasi, ADR-031)
Append-only: `subject_type` (`event`/`submission`), `subject_id`, salinan
`title`, `from_status` → `to_status`, `actor_id` (NULL = sistem/di luar
aplikasi), `reason`, `created_at`. Diisi **hanya** oleh trigger
`log_moderation_change()`; tidak ada hak INSERT/UPDATE/DELETE untuk role API
mana pun, termasuk `service_role`. SELECT: admin (RLS). Dibaca di `/admin/riwayat`.

### `recommendation_signals` (kalibrasi bobot, ADR-032)
`event_id`, `user_id` (NULL = tamu; `ON DELETE SET NULL`), `kind`
(`save` | `register_click`), snapshot `interests` + `education_level` saat itu,
`created_at`. Ditulis **hanya** service_role dari server (tanpa jalur tulis
dari browser — mencegah penggelembungan bobot). SELECT admin. Dibaca
`/admin/kalibrasi`.

### `rate_limit_hits` (pembatas laju, ADR-028)
`(bucket, hit_at)`. `bucket` = `<aturan>:<HMAC-SHA256 hex>` — tidak ada IP atau
email mentah. RLS aktif **tanpa policy** dan semua hak dicabut dari
`anon`/`authenticated`; hanya `consume_rate_limit()` (SECURITY DEFINER) dan
service_role yang menyentuhnya.

### `ugc_submissions` (Phase 3 — UI di `/submit` + antrean di `/admin`)
Publik boleh INSERT, tidak boleh SELECT (mengandung email — lihat
DEVIATIONS §RLS UGC). Sejak 0008: publik hanya boleh mengisi kolom
`submitted_by_email` dan `payload`; `payload` wajib objek JSON ≤ 16 KB dan
email ≤ 254 karakter (CHECK). Bentuk `payload` (snake_case) dikontrak di
`src/lib/submission-schema.ts`. Persetujuan lewat RPC `approve_submission()`.

## Fungsi (semua `SECURITY DEFINER` punya `SET search_path = public, pg_temp`)

| Fungsi | Guna |
|---|---|
| `public.slugify(text)` | Normalisasi judul → slug URL |
| `public.compute_dedup_hash(title, organizer)` | Harus identik dengan `models.compute_dedup_hash` di Python |
| `public.events_fill_derived()` (trigger, BEFORE INSERT) | Isi `slug`/`dedup_hash` otomatis kalau kosong |
| `public.touch_updated_at()` (trigger) | Set `updated_at = NOW()` |
| `public.handle_new_user()` (trigger di `auth.users`) | Sinkron profil publik. Sejak 0005: fallback klaim `name` (OAuth), `ON CONFLICT (id) DO UPDATE`, dan `EXCEPTION WHEN unique_violation` supaya kegagalan membuat profil tidak ikut membatalkan pendaftaran |
| `public.is_admin()` | `STABLE SECURITY DEFINER`; dipakai policy admin. Membungkus subquery ke `users` supaya tidak rekursi RLS (DEVIATIONS #4) |
| `public.sync_saved_count()` (trigger) | Jaga `events.saved_count` |
| `public.get_distinct_organizer_count()` | Hitung `COUNT(DISTINCT organizer)` pada event aktif (`status='APPROVED'`). Dipakai oleh `getStats()`. |
| `public.expire_past_events()` | Jalankan via cron harian: `APPROVED` + primary deadline lewat → `EXPIRED`. **Tidak menghapus baris.** Sejak 0008 EXECUTE hanya `service_role` (sebelumnya bisa dipanggil `anon`). |
| `public.create_deadline_notifications()` | Jalankan via cron harian. Buat notifikasi H-3/H-1 untuk event yang disimpan/dilacak. Idempoten (`ON CONFLICT DO NOTHING` + index dedupe). EXECUTE dicabut dari `anon`/`authenticated` — **hanya `service_role`**. Ambangnya diduplikasi di `src/lib/notifications.ts` (ADR-017). |
| `public.enforce_team_capacity()` (trigger, BEFORE INSERT `team_members`) | Tolak anggota melebihi `slots_needed` dengan `RAISE EXCEPTION 'team_full'`. SECURITY DEFINER karena butuh `FOR UPDATE` atas `teams` (0008) |
| `public.approve_submission(uuid, uuid)` | Salin kiriman ke `events` (APPROVED) + tenggat + kategori + tandai kiriman, SATU transaksi. **Hanya `service_role`** (0008) |

## Row Level Security

RLS **aktif di semua 14 tabel publik**, deny-by-default (DEVIATIONS #2 —
blueprint asli hanya menyalakan 5 tabel, sisanya bisa ditulis publik lewat
anon key). Ringkasan policy:

| Tabel | SELECT | WRITE |
|---|---|---|
| users | pemilik + admin | UPDATE pemilik saja, dan hanya 4 kolom profil (lihat peringatan di atas) |
| categories | publik (anon+authenticated) | admin/service_role |
| events | publik: `status IN ('APPROVED','EXPIRED')` — lihat DEVIATIONS #12 kenapa EXPIRED ikut terbaca | admin `FOR ALL`; INSERT scraper via service_role (bypass) |
| event_categories, event_deadlines | ikut visibilitas event induk | admin |
| saved_events, application_tracker | pemilik (`auth.uid()=user_id`) | pemilik, `WITH CHECK` eksplisit |
| notifications | pemilik | UPDATE pemilik, **hanya kolom `is_read`** (0008); INSERT hanya service_role |
| ugc_submissions | admin saja (privasi email) | INSERT publik, hanya kolom email + payload; persetujuan via `approve_submission()` |
| teams | publik read | INSERT pemilik untuk event APPROVED; UPDATE/DELETE pemilik atau admin (0008) |
| team_members | authenticated read | self-join INSERT sebagai `member` (kapasitas dijaga trigger), self/owner DELETE |

Semua policy `FOR ALL` menulis `WITH CHECK` eksplisit (bukan hanya `USING`) —
tanpa itu user bisa INSERT baris atas nama `user_id` orang lain (DEVIATIONS #6).

## View

`public.events_listing` (`WITH (security_invoker = on)` — tunduk RLS
pemanggil, bukan RLS pemilik view) menyatukan `events` + primary deadline +
`category_slugs` (array agregat) supaya frontend tidak perlu N+1 query.
Ini yang di-`SELECT` oleh `SupabaseEventRepository`, bukan tabel `events`
langsung.

`public.team_member_profiles` — **`security_invoker` sengaja dibiarkan `off`**,
kebalikan dari `events_listing`. View ini berjalan dengan hak pemiliknya
supaya bisa menembus `users_select_own` dan menampilkan nama anggota tim;
tanpa itu daftar anggota hanya berisi UUID. Pembatasnya ada di bentuk view:
kolomnya **hanya** `team_id`, `user_id`, `role`, `joined_at`, `full_name` —
tanpa email/jenjang/jurusan. SELECT diberikan ke `authenticated` saja,
`anon` dicabut.

> ⚠️ **Jangan tambah kolom ke `team_member_profiles`.** Satu kolom baru
> langsung terbuka ke seluruh pengguna yang masuk, tanpa perubahan policy
> yang terlihat di migration mana pun. Alasan lengkap: `DECISION.md` ADR-018.

`public.team_member_counts` (0008) — `team_id` + `member_count` saja, terbaca
`anon` dan `authenticated`. Ada supaya tamu melihat jumlah anggota yang benar
tanpa bisa membaca identitas siapa pun. Aturan "jangan tambah kolom" yang sama
berlaku.

> Catatan: sampai migration 0008, `team_member_profiles` ternyata terbaca
> `anon` karena 0007 hanya mencabut hak dari `PUBLIC` (lihat peringatan default
> privileges di atas). Sudah ditutup.

## Full-text search

Konfigurasi `indonesian` = `pg_catalog.indonesian` bawaan PostgreSQL >= 13
(Snowball, dengan stemming: "perlombaan" -> "lomba", "beasiswanya" -> "beasiswa").
Index dan query aplikasi WAJIB memakai konfigurasi yang sama (DEVIATIONS #1).
`search_vector` = weighted tsvector dari
`title` (A), `organizer` (B), `description` (C). Query dari aplikasi lewat
`sanitizeSearchQuery()` (`src/lib/data/supabase-mappers.ts`) sebelum
`websearch_to_tsquery`.

## Job terjadwal

Dijalankan **pg_cron di database** (migration `20260926120001_pg_cron_jobs.sql`,
ADR-030), jadwal dalam UTC:

| Job pg_cron | Fungsi | Jadwal |
|---|---|---|
| `studentfo-expire-past-events` | `expire_past_events()` | `5 17 * * *` = 00:05 WIB |
| `studentfo-deadline-notifications` | `create_deadline_notifications()` | `0 0 * * *` = 07:00 WIB |
| `studentfo-purge-rate-limit-hits` | `purge_rate_limit_hits()` | `17 18 * * *` = 01:17 WIB |

Periksa di Supabase: `select jobname, schedule, active from cron.job;` dan
riwayat: `select * from cron.job_run_details order by start_time desc limit 20;`.
Workflow `expire-events.yml` / `deadline-notifications.yml` tinggal jalur manual
(`workflow_dispatch`, butuh secret `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
Pipeline scraper tetap di `.github/workflows/scraper-cron.yml` (02:00 WIB) —
ia butuh Python + Gemini, bukan SQL. Semua fungsi idempoten.

## Kolom TypeScript-only (tidak generated dari DB)

`src/types/database.ts` ditulis tangan, sengaja dibatasi ke kolom yang
benar-benar di-`SELECT`. Kalau proyek nanti generate otomatis
(`supabase gen types typescript`), file ini bisa diganti — sampai saat itu
ia adalah kontrak eksplisit SQL ↔ TypeScript. Lihat `API_SPEC.md`.
