# Rencana produksi — Fase 0: audit & desain Fase 1–6

Tanggal audit: 2026-09-30 · Basis: `main` @ `8099270` · Status: **menunggu
persetujuan pemilik sebelum Fase 1**. Dokumen ini tidak mengubah kode produk.

Semua angka di bawah diukur di sesi ini, bukan disalin dari dokumen lama.
Yang tidak bisa diukur disebut terang-terangan.

---

## 1. Baseline (output nyata)

| Perintah | Hasil | Catatan |
|---|---|---|
| `npm run verify` | **hijau** — typecheck, lint, Vitest **47 berkas / 421 uji lolos**, kontras 64 pasangan LULUS | |
| `npm run db:test` | **hijau** — 26 migration + 17 berkas uji SQL `ok` | Postgres **16.13** lokal (CI memakai 15) |
| `npm run test:integration` | **hijau** — 8 berkas / **64 uji lolos** (PostgREST v12.2.3, `max_rows=1000`) | PG 16.13 |
| `npx playwright test` (mode seed, 3 proyek) | **359 lolos, 118 dilewati, 0 gagal** (5,7 mnt) | 118 dilewati = `test.skip` sengaja "cukup satu proyek" / "mengubah data demo bersama" |
| `npm run test:e2e:supabase` | **5 lolos** (8,5 dtk) | build produksi mode Supabase + PostgREST + stub auth |
| Pipeline Python | `test_models` **15/15**, `test_publisher` **4/4**, `test_fetch_extract` **13/13** (Chromium sungguhan) = **32/32**; dry-run `--allow-no-sources` OK | venv Python 3.11.15 |

Tidak bisa diuji di sini, dan kenapa:

- **`docker build`** — daemon Docker tidak jalan di sandbox (`/var/run/docker.sock`
  tidak ada). Klien ada, daemon tidak. Tetap belum pernah di-build.
- **GoTrue (login/daftar/OAuth sungguhan), Storage, pg_cron di Supabase** — tidak
  ada project Supabase yang boleh saya sentuh.
- **Gemini sungguhan** — tidak ada `GEMINI_API_KEY`.

---

## 2. Koreksi atas premis brief (baca ini dulu)

Beberapa poin di brief keliru atau tidak lengkap. Saya tulis terang, karena
merencanakan di atas premis salah = membangun ulang yang sudah ada.

1. **"Alasan penolakan kiriman/klaim belum disimpan di skema" — separuh salah.**
   - `events.rejection_reason` (teks bebas) sudah ada sejak migration 0001 dan
     diisi `reviewEventAction` (`reason`, ≤500).
   - `organizer_profiles`, `event_claims`, `event_revisions` sudah punya
     `review_note` (≤500), **wajib** untuk tolak/cabut (ditegakkan Server
     Action), dan **sudah ditampilkan** di studio `/penyelenggara`
     (`Catatan moderator: …`).
   - Yang benar-benar belum ada: alasan untuk **`ugc_submissions`**, dan
     **daftar tertutup kode alasan** di mana pun (semuanya teks bebas).
   - Temuan baru: pemilik profil/klaim/revisi bisa membaca kolom
     **`reviewed_by` (UUID moderator)** lewat PostgREST karena `GRANT SELECT`
     se-tabel ke `authenticated` + policy baris-sendiri. `ugc_submissions`
     sudah benar (dibaca lewat klien admin dengan kolom eksplisit). Ini yang
     harus ditutup di Fase 3, bukan "menyimpan alasan".
   → Fase 3 jauh lebih kecil dari yang brief bayangkan.

2. **"`gemini-2.0-flash` — verifikasi id model" — ini bukan tugas verifikasi,
   ini P0.** Menurut halaman deprecations resmi Gemini API, `gemini-2.0-flash`,
   `-001`, `-lite`, `-lite-001` **dimatikan 1 Juni 2026**. Default di
   `run.py` sudah mati 4 bulan. Kalau cron menyala hari ini: setiap sumber
   gagal di panggilan LLM → peringatan Telegram tiap malam, nol data.
   `gemini-2.5-flash` pun punya tanggal pensiun yang simpang siur (Okt 2026 di
   halaman lifecycle Cloud). Kandidat pengganti (mis. `gemini-3.5-flash`)
   **harus dicek dengan kunci sungguhan** lewat `models.list` — saya tidak
   mengarang id. `google-genai==0.8.0` (Jan 2025) juga kemungkinan perlu naik
   versi. Keputusan desain: pipeline memvalidasi model saat start
   (`models.get`) dan gagal keras dengan pesan jelas, bukan gagal per sumber.

3. **"Jadwal pipeline 02:00 WIB" (Fase 2) sudah ada** —
   `.github/workflows/scraper-cron.yml` (`0 19 * * *`, `concurrency: scraper`,
   secret-only, Telegram). Yang kurang bukan jadwalnya, tapi: idempotensi biaya
   (hash konten), kesehatan per sumber, dan alarm "N malam berturut-turut kosong".

4. **pg_cron sudah punya 4 job + uji `60_pg_cron_jobs`** (expire, notifikasi,
   purge `rate_limit_hits`, purge `event_view_dedup`). Yang kurang: **retensi**
   tabel yang tumbuh (§4) dan **tidak ada yang melihat `cron.job_run_details`**
   — job gagal di database = diam total.

5. **Status migration produksi tidak konsisten antara brief dan TASKS.md.**
   Brief: "20260930100001–03 belum diterapkan". TASKS.md: 20260926*, 20260927*,
   20260928* juga "belum pernah di-apply ke project mana pun". Salah satunya
   basi. Ini menentukan urutan rencana penerapan Fase 6 — butuh konfirmasi
   (atau izin saya membaca `list_migrations` secara read-only).

6. **Sitemap tidak "cukup untuk bertahun-tahun".** `MAX_SITEMAP_PAGES = 100`
   × 48 = **4.800 URL**, lewat 100 `listEvents` paralel berOFFSET. Pada
   100k event (90k publik) ±95% halaman kegiatan tidak masuk sitemap.

7. **Dedup + REJECTED memblokir edisi berikutnya selamanya** bila judul &
   penyelenggara sama persis (index `events_dedup_hash_active_key` mencakup
   REJECTED). Sengaja untuk mencegah scraper memasukkan ulang tiap malam, tapi
   "Lomba X" yang ditolak 2026 karena tautan rusak tidak akan pernah masuk lagi
   di 2027. Perlu keputusan (§6 Fase 1).

8. **Urutan fase: privasi (UU PDP) harus sebelum Pesan/Diskusi.** Produksi
   tidak punya **hapus akun** (hanya reset data demo) dan ekspor data hanya
   mencakup akun/tersimpan/tracker. Fase 4 menambah data pribadi paling
   sensitif (isi pesan). Rekomendasi: tarik "hapus & ekspor akun" + health
   endpoint dari Fase 6 ke **sebelum** Fase 4.

---

## 3. Audit kesiapan produksi per peran

Legenda: ✅ jalan di mode Supabase (teruji integrasi/PostgREST) · 🟡 ada backend
tapi belum pernah menyentuh Supabase sungguhan / bergantung migration yang
belum diterapkan · 🔴 hanya mode seed (localStorage/demo) atau tidak ada.

### Siswa/mahasiswa

| Kemampuan | Status | Catatan |
|---|---|---|
| Jelajah, filter, cari (FTS indonesian), detail | ✅ | `events_listing`; cache 300 dtk (ADR-034) |
| Daftar/masuk/Google/lupa sandi | 🟡 | GoTrue tidak pernah diuji end-to-end; stub auth di integrasi |
| Simpan, tracker, portofolio | ✅ / 🟡 | portofolio butuh migration 20260929 |
| Rekomendasi personal | ✅ | jendela 240 kandidat, skor di Node |
| Notifikasi tenggat H-3/H-1 | 🟡 | produsen pg_cron — belum pernah jalan di Supabase |
| Tim lomba | ✅ / 🟡 | RPC atomik = migration 20260930100002 (belum diterapkan) |
| Koneksi, blokir, profil publik | 🟡 | migration 20260927/28/29 — status penerapan simpang siur (§2.5) |
| Kirim kegiatan + kabar keputusan | ✅ | tanpa alasan penolakan |
| Pesan, Ruang diskusi, persiapan, dokumen, preferensi notif, profil ekstra | 🔴 | localStorage; 404 di produksi |
| Hapus akun | 🔴 | tidak ada di produksi |
| Ekspor data | 🟡 | sebagian (akun, tersimpan, tracker) |

### Penyelenggara

| Kemampuan | Status | Catatan |
|---|---|---|
| Ajukan verifikasi, klaim, revisi, studio | 🟡 | backend lengkap + uji; migration 20260928110001 |
| Analitik per acara | 🟡 | **420 ms per buka** di 100k event (§4, Q5) |
| Catatan moderator saat ditolak | ✅ | tapi `reviewed_by` ikut terbaca (§2.1) |
| Diskusi per acara (moderasi panitia) | 🔴 | Fase 4 |

### Moderator

| Kemampuan | Status | Catatan |
|---|---|---|
| Antrean event/kiriman/penyelenggara, tolak/setujui, pulihkan | ✅ | |
| Log moderasi | ✅ | 100 terakhir, tanpa paginasi (ADR-031) |
| Kalibrasi rekomendasi | ✅ kecil / 🔴 skala | memuat SEMUA sinyal + SEMUA event publik ke Node (§4, Q8) |
| Kesehatan sumber pipeline | 🔴 | tidak ada — Fase 1 |
| Tautan pendaftaran mati | 🔴 | tidak ada — Fase 2 |
| Laporan konten (report) | 🔴 | tidak ada di mana pun — Fase 4 |
| Kesehatan job pg_cron | 🔴 | tidak terlihat dari aplikasi |

---

## 4. Audit skalabilitas (terukur)

**Metode.** Database terpisah `studentfo_scale` (bukan data produk), semua 26
migration, seed sintetis: 10k pengguna, **100k event** (30k APPROVED aktif,
60k EXPIRED, 5k PENDING, 5k REJECTED), 200k simpan, 100k tracker, **1M
notifikasi**, 500k sinyal, **1,2M** baris `event_daily_stats` (20k acara × 60
hari), 200k `rate_limit_hits`, 50k koneksi, 20k kiriman, 95k log moderasi.
`EXPLAIN ANALYZE` sebagai role yang sama dengan PostgREST (anon/authenticated,
RLS aktif). PG 16 lokal, laptop-class, tanpa tuning — angka relatif, bukan SLA.
Skrip: `scratchpad/scale_seed.sql` + `scale_bench.sql` (akan masuk
`supabase/bench/` di Fase 6).

### 4.1 Tiga hotspot nyata

| # | Query | Waktu | Akar masalah | Perbaikan (Fase 6) |
|---|---|---|---|---|
| Q1 | `/events?sort=deadline` hal. 20 **+** `count=exact` (anon) | **373 + 222 ≈ 600 ms** per request (cache 5 mnt per kombinasi filter) | join `events × event_deadlines` untuk 30k baris + policy RLS `event_deadlines` memanggil ulang `events_pkey` **30.000 kali** (visibilitas induk) | denormalisasi `events.primary_deadline_at` (trigger) + index parsial `(primary_deadline_at, id) WHERE status='APPROVED'` — sudah diramal ADR-035, kini terbukti perlu di 30k aktif, bukan 20k |
| Q5 | `event_analytics(p, 90)` (studio penyelenggara) | **408–443 ms** per buka | CTE `peer` (median jenis sama) **seq scan 1,2M** baris `event_daily_stats` — PK `(event_id, day)` tidak membantu filter `day` | tabel ringkas `event_type_daily_benchmark` diisi pg_cron harian, atau minimal index `(day)`; pilih setelah EXPLAIN kedua opsi |
| Q6 | `create_deadline_notifications()` (harian) | **823 ms**, sort **external merge 12 MB di disk** | `UNION` semua simpan+tracker (300k) lalu filter tanggal hasil hitung (tidak sargable) | balik arah: ambil event bertenggat `[hari ini, +3]` lewat `idx_deadlines_primary_at` dulu, baru join pengamatnya |

### 4.2 Per tabel

| Tabel | Index yang relevan | Retensi/purge sekarang | Query terburuk @10k MAU/100k event | Rekomendasi |
|---|---|---|---|---|
| `notifications` (203 MB @1M) | `idx_notifications_user_sent`, partial unread, dedupe | **tidak ada** — tumbuh selamanya | daftar per pengguna **0,2 ms**, hitung belum dibaca **0,1 ms**; produsen harian 823 ms (Q6) | purge dibaca >180 hari & semua >365 hari (pg_cron, batch); tulis ulang produsen |
| `recommendation_signals` (108 MB @500k) | `(created_at)`, `(event_id, kind, created_at)` | **tidak ada** (sengaja, untuk kalibrasi) | `/admin/kalibrasi` menarik **500k sinyal + 90k event** lewat paginasi 1000 baris (≈590 round-trip) lalu `calibrate()` membangun kandidat negatif per sinyal — tidak akan selesai. Diuji hanya 5k×2k (ADR-032) | batasi jendela (mis. 90 hari) + sampel negatif tetap-seed (k=50/sinyal) — Fase 5; retensi 24 bulan (butuh keputusan) |
| `event_daily_stats` (131 MB @1,2M) | PK `(event_id, day)` | **tidak ada**; tumbuh ~1 baris/acara/hari berkunjung | Q5 420 ms | benchmark pra-hitung; baris > 2 tahun boleh diringkas ke total per acara |
| `event_view_dedup` | `(day)` | purge harian ✅ | — | — |
| `rate_limit_hits` (22 MB @200k) | `(bucket, hit_at)` | purge >1 hari ✅ (jendela terpanjang = 86400 dtk, pas) | `consume_rate_limit` **2,4 ms**; purge 100k baris **111 ms** | OK. Catatan: 1 baris per kunjungan detail (ADR-043) — di 100k tayangan/hari = 100k baris/hari, masih aman |
| `moderation_log` (18 MB @95k) | `(created_at DESC)`, `(subject_id, …)` | append-only, sengaja tanpa purge | 100 terakhir **0,05 ms** | paginasi kursor saat >100/minggu (ADR-031); retensi: pertahankan (jejak audit) |
| `connections` | pair unique, `(addressee,status)`, `(requester,status)` | tidak perlu (baris hidup) | `connection_peers` satu orang **0,36 ms** | OK |
| `ugc_submissions` | `(status, created_at)`, email, owner | **tidak ada** — `submitted_by_email` disimpan selamanya | antrean PENDING **0,2 ms** | UU PDP: kosongkan email X hari setelah keputusan (butuh keputusan) |
| `events` (273 MB @100k) | lengkap | EXPIRED tidak dihapus (sengaja, SEO) | Q1 600 ms; sitemap hal. 100 **115 ms** × 100 paralel | Q1 + sitemap index (bukan 100 query OFFSET) |
| Job harian | — | — | `expire_past_events` **141 ms** | OK |

---

## 5. Keputusan yang butuh pemilik (akan ditanyakan lewat AskUserQuestion)

1. **Realtime Fase 4** — rekomendasi: **server-render + form POST + polling
   ringan** (pulau klien kecil `router.refresh()` tiap ±30 dtk saat tab
   terlihat; tanpa JS tetap jalan dengan muat ulang). Ditolak: Supabase Realtime
   (butuh klien Supabase di browser — melanggar ADR-010, memperlebar CSP
   `connect-src`, RLS realtime terpisah); SSE (koneksi panjang di hosting yang
   belum dipilih, rawan di serverless).
2. **Cakupan MVP Fase 4** — rekomendasi: **diskusi per kegiatan dulu**; pesan
   langsung menyusul, dan hanya antar koneksi ACCEPTED.
3. **Identitas bot** — domain info bot + email kontak untuk `User-Agent`
   (tidak boleh saya karang).
4. **Retensi** — notifikasi, sinyal, email kiriman, log pipeline.

Juga butuh tindakan (bukan pilihan): `GEMINI_API_KEY` di secret CI (untuk
cek model + evaluasi opsional), konfirmasi status migration produksi, sumber
nyata untuk fixture evaluasi (ADR-038 #2: memilih situs = keputusan pemilik).

---

### 5.1 Jawaban pemilik (2026-09-30)

| Keputusan | Jawaban |
|---|---|
| Realtime Fase 4 | **Polling ringan** (server-render + form POST, pulau klien refresh ±30 dtk saat tab terlihat) |
| MVP Fase 4 | **Diskusi per kegiatan dulu**; pesan langsung menyusul, hanya antar koneksi ACCEPTED |
| Identitas bot | **Belum punya domain** → `PIPELINE_BOT_URL`/`PIPELINE_BOT_CONTACT` wajib; run sungguhan & dry-run terhadap situs nyata terkunci sampai terisi |
| Retensi | Notifikasi dibaca 180 hari / semua 365 hari · email kiriman dikosongkan 90 hari setelah keputusan · log pipeline & cek tautan 180 hari |
| Retensi sinyal rekomendasi | **Tidak disetujui** → tetap tanpa purge; Fase 5 membatasi jendela analisis, bukan menghapus data |

---

## 6. Desain Fase 1–6

Aturan yang berlaku di setiap fase (dari brief & AGENTS.md): satu fase = satu
branch/PR dari `main` terbaru; migration BARU + RLS + `REVOKE … FROM anon,
authenticated` + uji SQL yang dibuktikan merah tanpa perbaikannya; method
repository di kedua implementasi + `parity.test.ts`; ADR + TASKS; bukti output
nyata keempat suite.

### Fase 1 — Kualitas data masuk (pipeline)

**Berkas:** `pipeline/studentfo_pipeline/{extractor,fetcher,config,models,publisher}.py`,
`run.py`, baru `llm.py` (retry/biaya), `health.py`, `pipeline/eval/`,
`pipeline/tests/*`, `requirements.txt` (naik `google-genai`), migration
`2026100x_pipeline_health.sql`, `supabase/tests/9x_pipeline_health.test.sql`,
`/admin/sumber`, `repository.ts` + dua implementasi, `.github/workflows/ci.yml`.

1. **Model hidup (P0).** `GEMINI_MODEL` wajib/tervalidasi saat start
   (`models.get`); default diganti id yang terbukti ada dengan kunci pemilik.
2. **Tautan tidak hilang.** `html_to_text(html, page_url, …)` menulis `<a>`
   sebagai `Teks (https://abs-url)` setelah `urljoin`, hanya http(s), tanpa
   duplikat berturut. Biaya: teks lebih panjang → ukur ulang terhadap
   `MAX_CONTENT_CHARS`.
3. **Buang kebisingan.** `aside`, `[role=complementary]`, dan blok berkelas/id
   `related|terkait|sidebar|widget` (heuristik konservatif, diuji dengan kasus
   negatif: `<aside>` berisi tenggat resmi di beberapa situs kampus — kalau
   ada, content_selector per sumber menang).
4. **User-Agent dari konfigurasi.** `PIPELINE_BOT_URL`, `PIPELINE_BOT_CONTACT`
   (env/secret, bukan hardcode). Wajib di run sungguhan **dan dry-run** —
   dry-run juga menembak situs nyata dengan UA placeholder hari ini.
5. **Keterlacakan tautan.** `registration_link` (dinormalisasi: tanpa
   fragmen, host lowercase, trailing slash disamakan) harus ada di himpunan
   `href` halaman sumber setelah `urljoin`, atau sama dengan URL halaman itu
   (formulir di halaman). Tidak ada → **ditolak** dengan kode
   `link_not_in_source` dan dihitung di kesehatan sumber. Alternatif (stage
   dengan tanda `needs_link_review`) butuh kolom baru di `events` — ditunda
   kecuali Anda memilihnya.
6. **Ketahanan.** Retry maks 3× dengan backoff eksponensial + jitter untuk
   429/5xx (hormati `Retry-After`), tanpa retry untuk 4xx lain. Anggaran per
   run: `max_llm_calls` + `max_input_chars` (pakai `usage_metadata` bila ada);
   tercapai → berhenti rapi + peringatan. **Tanpa dependency baru** (tenacity
   sudah pernah dibuang di ADR-045).
7. **Hash konten.** sha256 atas teks terpangkas (bukan HTML mentah — token CSRF
   / jam berubah tiap muat). Tabel `pipeline_page_state(url PK, content_hash,
   last_seen_at, last_events)`. Hash sama & run sebelumnya sukses → lewati
   LLM. Dedup lintas edisi tahunan tidak berubah (index lama).
8. **Kesehatan sumber.** `pipeline_runs` + `pipeline_source_runs(run_id,
   source_id, outcome ok|empty|failed|robots_blocked|unchanged, pages,
   valid, inserted, duplicates, rejected_untraceable, reason_code,
   sample_errors ≤5)`. RLS aktif, SELECT admin (`(select is_admin())`), tulis
   hanya service_role, REVOKE eksplisit. `fetcher` mengembalikan hasil
   bertipe (bukan `None`) sehingga **robots.txt melarang ≠ gagal**. Alarm
   Telegram tambahan: sumber `empty/failed` ≥3 run berturut. `/admin/sumber`
   menampilkan yang berturut-turut kosong/gagal.
9. **Harness evaluasi.** `pipeline/eval/fixtures/<id>/{page.html,gold.json,mock.json}`
   + `run_eval.py [--live]`. Presisi/recall per field (judul, penyelenggara,
   tenggat, jenjang, jenis, link), pencocokan event berdasar judul
   ternormalisasi. **Mode mock mengukur pipeline non-LLM** (pemangkasan,
   resolusi & keterlacakan tautan, validasi) — dilaporkan begitu, bukan
   sebagai kualitas model. `--live` hanya dengan kunci.
10. **Keputusan dedup REJECTED (§2.7):** usul — REJECTED memblokir hanya 12
    bulan (atau hanya selama tenggat utamanya belum lewat).

**Risiko:** fixture halaman nyata = salinan konten pihak ketiga di repo (hak
cipta ringan; simpan hanya yang perlu, catat sumber & tanggal) · heuristik
`aside` membuang informasi sah · naik versi `google-genai` mengubah bentuk
respons. **Uji:** tiga skrip lama + uji baru per temuan (dibuktikan merah di
kode lama), eval mode mock di CI, `db:test` untuk tabel baru, integrasi +
paritas untuk `listSourceHealth`, e2e/axe `/admin/sumber`.

### Fase 2 — Otomasi

- `scraper-cron.yml` tetap; tambah langkah pemeriksaan secret wajib (bot UA,
  model) dan ringkasan run ke `pipeline_runs`.
- **Pemeriksa tautan pendaftaran:** workflow harian Python memakai
  `PoliteFetcher` yang sama (robots, jeda, UA). `HEAD` lalu `GET` bila 405.
  Tabel `event_link_checks(event_id, checked_at, http_status, outcome
  ok|dead|robots_blocked|error, consecutive_failures)`. Mati ≥2 cek berturut →
  tampil di `/admin` (tanpa mengubah status). Hanya event APPROVED bertenggat
  di masa depan, dibatasi N/run.
- **pg_cron:** job retensi baru (batch `DELETE … LIMIT` berulang, bukan satu
  DELETE raksasa) sesuai §4; fungsi `cron_health()` (DEFINER + cek admin)
  untuk `/admin` membaca `cron.job_run_details`; uji SQL idempotensi (panggil
  dua kali = hasil sama) + mutation test.
- **Runbook** `docs/RUNBOOK.md`: picu ulang (workflow_dispatch / `SELECT
  public.…()`), membaca alert, rollback migration (migration maju-saja +
  migration kompensasi; backup sebelum apply).

### Fase 3 — Alasan penolakan & alur moderator

- Daftar tertutup `REJECTION_CODES` (domain.ts + `CHECK` SQL, VARCHAR bukan
  enum Postgres — pola `CONNECTION_STATUSES`; bukan aturan tiga tempat karena
  pipeline tidak menulisnya): `DUPLICATE`, `CLOSED_OR_PAST`, `BROKEN_LINK`,
  `NOT_FOR_STUDENTS`, `INSUFFICIENT_INFO`, `UNOFFICIAL_SOURCE`, `SPAM`,
  `OTHER` (catatan wajib untuk `OTHER`).
- Kolom baru: `events.rejection_code`, `ugc_submissions.rejection_code` +
  `rejection_note`, `review_code` di tiga tabel penyelenggara. Kolom teks lama
  jadi "catatan".
- Notifikasi `SUBMISSION_REJECTED`: pesan tetap generik + tautan ke "Kirimanmu";
  label alasan dirender aplikasi dari kode (satu sumber label, tidak disalin ke
  SQL). URL hanya membawa kode umpan balik (ADR-019).
- Tutup kebocoran `reviewed_by`: cabut SELECT se-tabel, `GRANT SELECT (kolom…)`
  tanpa `reviewed_by` (AGENTS §14), repository memilih kolom eksplisit; uji SQL
  membuktikan pemilik tidak bisa membaca `reviewed_by`.

### Fase 4 — Backend Pesan & Ruang Diskusi (menunggu keputusan §5.1–5.2)

- **Skema (MVP diskusi):** `discussion_threads(event_id, author_id, title≤140,
  body≤4000, last_activity_at, reply_count, score, hidden_at, hidden_by,
  hidden_code)`, `discussion_replies(body≤2000, …)`, `discussion_votes`
  (PK pengguna+subjek, ±1), `content_reports(subject_type, subject_id,
  reporter_id, reason_code, note, status)` unik per pelapor+subjek,
  `discussion_memberships`. Hanya untuk event APPROVED/EXPIRED.
- **Privasi:** nama penulis lewat view sempit (pola ADR-018, "jangan tambah
  kolom"); konten orang yang memblokir/diblokir pembaca disaring di view
  (`connection_blocks`, dua arah, seperti `network_directory`).
- **Batas:** `consume_rate_limit` di trigger BEFORE INSERT (utas 10/hari,
  balasan 60/jam, laporan 20/hari). Keyset `(last_activity_at DESC, id DESC)`
  (pola ADR-041/048). Sembunyikan otomatis di ≥3 pelapor berbeda menunggu admin
  (butuh persetujuan). Panitia terverifikasi (`manages_event`) bisa
  menyembunyikan di grup acaranya sendiri.
- `demoFeaturesEnabled` dipecah jadi flag per fitur; mode seed tetap jalan
  tanpa kredensial; `lib/demo/discussions.ts` diganti repository memori.
- Uji: RLS (orang luar tidak bisa baca utas tersembunyi/menulis atas nama
  orang lain/membaca laporan), paritas, e2e + axe, target sentuh.

### Fase 5 — Algoritma berbasis bukti

- Evaluasi offline replay: tiap sinyal pada waktu *t* → kandidat terbuka saat
  *t* (sampel negatif tetap-seed), peringkat event yang dipilih di bawah bobot
  baseline vs usulan → MRR, recall@12 (halaman pertama), NDCG@12.
- **Kejujuran metodologis:** tanpa log impression, data bias posisi (orang
  mengklik yang sudah kita taruh di atas) — replay cenderung membenarkan bobot
  yang berlaku. Di bawah ±200 sinyal/jalur (ADR-032) tidak ada klaim; skenario
  sintetis diberi label sintetis. Jalan tak bias = slot acak kecil (interleaving
  5%), butuh persetujuan produk.
- Perbaiki skala `calibrate()` (jendela + sampel), cold start (profil kosong →
  popularitas per jenjang), keberagaman (re-rank MMR per jenis/bidang, posisi 1
  tidak disentuh), saran koneksi — penjelasan "kenapa disarankan" tetap. Semua
  fungsi murni menerima `now`; bobot baru dikunci uji.

### Fase 6 — Hardening produksi

- `/api/health` (ping DB lewat repository, `no-store`, tanpa rahasia);
  `src/lib/observability.ts` = titik sambung `reportError()` di error boundary
  — **SDK Sentry = dependency baru, butuh persetujuan** (tanpa itu: log JSON
  terstruktur tanpa PII, IP/email di-hash).
- Uji beban: skrip seed §4 masuk `supabase/bench/`, perbaiki Q1/Q5/Q6 + sitemap
  index dengan EXPLAIN sebelum/sesudah.
- CI: `docker build` sungguhan + smoke `curl /api/health` di container.
- Privasi: hapus akun (auth admin API → cascade; email kiriman dikosongkan;
  sinyal sudah `SET NULL`), ekspor lengkap (koneksi, notifikasi, kiriman,
  portofolio, penyelenggara); `/security-review`.
- Rencana penerapan migration ke produksi (urutan, backup/PITR, rollback) —
  disusun, **tidak dijalankan** tanpa persetujuan.

### Urutan yang saya usulkan

`1 (pipeline, mulai dari model P0) → 2 → 3 → 6a (hapus/ekspor akun, health,
docker build CI) → 4 → 5 → 6b (beban, observabilitas, rencana migration)`.
