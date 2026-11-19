# Audit pra-produksi StudentFo — 19 Nov 2026

Lanjutan `docs/audit-menyeluruh.md` (13–14 Nov). Yang sudah dinyatakan aman di sana
tidak diaudit ulang. Fokus audit ini: kode yang lahir SETELAH audit itu (ADR-090–092),
keadaan produksi sungguhan (Vercel + Supabase `urmmihzjkkbxcwfzvuao`), konfigurasi
yang belum diisi, dan algoritma peringkat.

**Tingkat:** KRITIS · TINGGI · SEDANG · RENDAH · INFO. **Bukti** = kode, log, atau data produksi.

## 0. Cara audit

| Alat | Hasil |
|---|---|
| `npm run verify` di `2350ff9` (= `main` produksi) | **GAGAL**: 1 dari 1.138 tes unit (§1 B1). typecheck, lint, kontras lulus |
| `npm audit --omit=dev` | 2 tinggi (zod, source-map-js) — sama dengan audit 14 Nov, belum ditangani |
| Supabase produksi: `list_migrations`, advisor keamanan, `cron.job`, log edge/Postgres 18 Nov | 51 migration = repo; 7 job pg_cron sukses; 262 permintaan 400 dalam 2,5 jam |
| Vercel: env produksi (nama saja), runtime errors 7 hari, deployment | 3 kelompok galat; 15 env yang dibaca kode belum diisi |
| GitHub Actions 25 run terakhir | Scraper gagal **setiap hari** sejak awal; CI hijau |
| Playwright 390×844 mode seed: `/`, `/events`, detail, `/register`, `/login`, `/komunitas`, `/submit` | 0 geser horizontal, 0 galat konsol, target sentuh kecil hanya tautan sebaris |

## 1. Bug & alur sistem

| # | Temuan | Tingkat | Bukti |
|---|---|---|---|
| B1 | **Tes bom-waktu, CI merah mulai 19 Nov.** `engagement.test.ts` "kegiatan unggulan langsung punya suka" membuat repo dengan jam tetap `2026-11-16`, tetapi `listEvents()` memakai `new Date()`. Suka contoh meluruh (paruh 72 jam) dan kalah dari sinyal lain yang ditanam relatif ke jam asli. Setiap PR berikutnya akan gagal CI | TINGGI (memblokir rilis) | `memory-repository.ts:797` `const now = new Date()` vs `seedEngagement(base)`; tes baris 38–40 |
| B2 | **`/events` produksi gagal untuk 11 pengunjung** (18 Nov 20.03–22.17 UTC, deployment `dpl_MiEny…`). Dua jalur sekaligus: RPC `list_personalized_events` (9× HTTP 400) dan view `events_listing` jalur cadangan (1× 400) | TINGGI | `get_runtime_errors`; log edge Supabase. Kueri yang sama lolos saat dijalankan langsung sebagai `anon` → penyebab pasti **belum terkonfirmasi** (lihat B3, O1) |
| B3 | **Penyebab galat hulu tidak tercatat.** Log Vercel hanya `[cause]: [Object]`; PostgREST tidak mencatat badan respons. Insiden B2 tidak bisa didiagnosis | SEDANG | Runtime error B2 |
| B4 | **`?page=` tanpa batas atas.** `toPositiveInt()` menerima `page=999999999`; offset (`(page−1)×12`) melewati `int4` → RPC 400 → halaman galat 502 dan entri cache baru per angka halaman. Mode seed menjepit di memori, jadi tidak terlihat saat dev | SEDANG | `lib/search-params.ts:34`, `lib/data/listing.ts:29`, argumen `p_offset integer` |
| B5 | **"Lagi ramai" di produksi = 2 kueri per kunjungan.** Kode ADR-092 sudah tayang, migration `20261116100001` belum → setiap `sort=popular` meminta `trend_score` (400), lalu mengulang tanpa kolom. 253 kueri gagal dalam 2,5 jam | RENDAH (biaya & kebisingan log) | log edge `events_listing … trend_score` |
| B6 | **7 kiriman PENDING menunggu sejak 13 Nov; katalog tayang = 1 acara.** Scraper gagal tiap hari (`PIPELINE_SOURCES_YAML` kosong) | **KRITIS produk** | `events` produksi: APPROVED 1, PENDING 7; run Scraper #52–#57 `failure` |

Perbaikan B1 — bekukan jam di tes, supaya data contoh dan `listEvents()` memakai jam yang sama:

```ts
// engagement.test.ts
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-16T03:00:00Z')); });
afterEach(() => vi.useRealTimers());
```

Jangan menambah bobot suka contoh demi "lulus": tes itu benar menangkap bahwa data contoh tidak tahan waktu.
Sapu juga tes lain yang memberi tanggal tetap ke `new MemoryEventRepository(…)` lalu memanggil metode yang memakai `new Date()`.

Perbaikan B4 — jepit di parser (satu tempat, berlaku untuk kedua repository):

```ts
// lib/search-params.ts
const MAX_PAGE = 500; // 500 × 48 = 24.000 kartu, jauh di atas katalog realistis
page: Math.min(toPositiveInt(params.page, 1), MAX_PAGE),
```

Perbaikan B3 — catat kode & pesan PostgREST (bukan objeknya) di `upstreamFailure`:

```ts
console.error('[upstream]', message, { code: cause?.code, details: cause?.details, hint: cause?.hint, msg: cause?.message });
```

## 2. Keamanan & integritas

| # | Temuan | Tingkat | Bukti |
|---|---|---|---|
| S1 | **"Lagi ramai" bisa dimanipulasi tanpa akun.** Pengunjung unik = HMAC(hari, IP, **User-Agent**); batasnya 300 tampilan/jam **per IP, lintas acara**. Satu IP yang mengganti User-Agent menghasilkan ±300 "pengunjung unik"/jam ke SATU acara × 0,25 = ±75 poin/jam (= 12 pendaftaran). Hasilnya juga mencemari analitik penyelenggara | TINGGI (integritas peringkat beranda) | `lib/event-views.ts`, `RATE_LIMITS.eventViewPerIp`, `TREND_WEIGHTS.visitor` |
| S2 | CAPTCHA mati di produksi (`TURNSTILE_*` kosong) → pendaftaran akun hanya dibatasi 5/jam/IP; akun boneka bisa menyuka/berkomentar/menyimpan | SEDANG | env Vercel |
| S3 | `formList()` masih tanpa batas (mitigasi zod GHSA-mrhx-c7xc-m3w5 dari audit 14 Nov §3 S2 belum dikerjakan) | TINGGI (teoretis) | `lib/form-data.ts:19` |
| S4 | `mutual_connection_counts(uuid[])` tidak memeriksa blokir/keterlihatan: siapa pun yang masuk bisa mengukur jumlah koneksi bersama dengan uuid mana pun | RENDAH | definisi fungsi produksi |
| S5 | Leaked password protection mati | SEDANG (butuh Supabase Pro) | advisor |
| S6 | `team_member_profiles` tanpa filter (audit 14 Nov §3 S4) — masih terbuka | RENDAH | advisor `security_definer_view` |

✔️ Diperiksa, aman: migration ADR-092 (RLS + `REVOKE … FROM anon, authenticated` + batas laju per pengguna untuk suka 300/hari, komentar 30/hari, bagikan 20/hari, lapor 10/hari; fungsi admin hanya `service_role`); `shareEventAction` (slug divalidasi, penerima disaring di RPC); RPC profil `public_profile_*`/`public_badge_facts` dijaga `can_view_profile()` + potong 100 elemen.

Perbaikan S1 (migration + kode, tanpa DROP):

```sql
-- refresh_event_trends(): sumbangan pengunjung per acara per hari dibatasi & dilunakkan
SELECT v.event_id, 0.25::float8 * least(v.visitors, 40), …   -- maks 10 poin/hari
```

```ts
// event-views.ts — satu IP = satu pengunjung per acara per hari (UA hanya untuk filter bot)
const visitor = await eventVisitorHash(bucketSecret(), jakartaDateKey(new Date()), ip, eventId);
```

## 3. Konfigurasi produksi yang belum diisi

Env yang dibaca `src/lib/env.ts` tetapi **tidak ada** di Vercel Production:

| Variabel | Akibat sekarang |
|---|---|
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_LINK_SECRET`, `CRON_SECRET` (+ secret GitHub) | Pengingat email tenggat di `/profile/settings/notifikasi` **tidak pernah terkirim**; workflow "Send deadline emails" hijau palsu (dilewati) |
| `ERROR_ALERT_WEBHOOK_URL` | Insiden B2 tidak memberi tahu siapa pun |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | §2 S2 |
| `RATE_LIMIT_SECRET` | Jatuh ke service role key: memutar kunci itu ikut mereset semua ember batas laju & hash pengunjung |
| `LEGAL_OPERATOR_NAME`, `PRIVACY_CONTACT_EMAIL`, `*_EFFECTIVE_DATE` | Kebijakan privasi & S&K tayang berlabel DRAF |
| `PIPELINE_SOURCES_YAML` (secret GitHub), `GEMINI_MODEL` | §1 B6 |

Di luar env: Google OAuth gagal untuk semua orang (TASKS 18 Nov); migration ADR-092 belum diterapkan;
Vercel **Hobby**: log hanya 1 jam (insiden B2 sudah tak terbaca 6 jam kemudian) dan ketentuan
Hobby melarang penggunaan komersial — padahal ada acara berbayar & badge "Promosi".
Pendaftaran PSE, DPIA, DPA (TASKS ADR-057) masih terbuka.

## 4. UI & UX

| # | Temuan | Tingkat | Saran |
|---|---|---|---|
| U1 | **Beranda tamu: kartu kegiatan pertama di y=1.155px** pada ponsel 390×844. Layar pertama = judul, cari, chip jenis. Untuk agregator, bukti isi adalah ajakan terkuat | SEDANG | Taruh 2–3 kartu "tenggat terdekat" tepat di bawah kotak cari; pindahkan chip jenis ke baris gulir horizontal satu baris |
| U2 | **"Suka 0 · Komentar 0" tampil ke tamu** di detail, tepat di bawah "Disimpan 619 orang". Angka nol = bukti sosial negatif | RENDAH | Sembunyikan angka bila 0 ("Suka" saja) |
| U3 | Tombol lekat bawah di detail untuk tamu berbunyi **"Masuk"** — tidak menjelaskan bahwa itu jalan menuju Daftar | RENDAH | "Masuk untuk daftar" (gerbang ADR-085 tetap) |
| U4 | Beranda tamu 5.546px (±6,5 layar) di ponsel | INFO | Ukur gulir sebelum memangkas; jangan potong tanpa data |
| U5 | Katalog produksi 1 acara: tata letak rapi tetapi terasa kosong (sama seperti audit 14 Nov D4) — akar = B6 | KRITIS produk | Setujui 7 kiriman PENDING hari ini |

✔️ Sudah benar: 0 geser horizontal, 0 galat konsol, checkbox `/submit` berlabel 44px, header tetap, mode demo jelas berlabel.

## 5. Urutan kerja yang disarankan

1. **Hari ini (pemilik, 15 menit):** setujui 7 kiriman PENDING di `/admin`; isi `ERROR_ALERT_WEBHOOK_URL`.
2. **Kode (satu PR kecil):** B1 tes, B4 batas halaman, B3 log penyebab, S3 `formList` berbatas, S1 kunci pengunjung + migration batas.
3. **Pemilik + staging:** terapkan `20261116100001` (staging → produksi), lalu B5 hilang dengan sendirinya.
4. **Pemilik:** Turnstile, Resend + `CRON_SECRET`, Google OAuth consent screen, `PIPELINE_SOURCES_YAML`.
5. **Sebelum promosi publik:** Vercel Pro (atau log drain), dokumen hukum ditinjau, PSE.
