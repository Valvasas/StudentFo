# Kesiapan hosting & MVP — 25 Oktober 2026

Basis: `main` @ `b80efe6` + perubahan branch `ccr-6ab1004a-hdvfxj` (ADR-059).
Semua angka di bawah diukur di sesi ini. Yang tidak bisa diukur disebut terang.

---

## 1. Putusan

**Kode siap dihosting. Produknya belum siap dibuka ke publik** — dan
penghalangnya bukan di kode, tapi di tiga hal yang hanya bisa dikerjakan
pemilik (§ 6): backend Supabase produksi belum ada, katalog akan kosong di hari
peluncuran karena model LLM pipeline sudah dimatikan Google, dan dokumen hukum
(Kebijakan privasi masih DRAF, Syarat & Ketentuan belum ada).

| Lapisan | Status | Bukti |
|---|---|---|
| Kode aplikasi (typecheck, lint, unit, kontras) | ✅ | `npm run verify` hijau — 738 uji unit |
| Database: 32 migration + RLS + fungsi | ✅ | `npm run db:test` — 32 migration + 21 berkas uji SQL, Postgres 16 |
| Repository produksi lewat PostgREST sungguhan | ✅ | `npm run test:integration` — 91/91 |
| Build produksi mode Supabase (cache, moderasi, sesi) | ✅ (diperbaiki) | `npm run test:e2e:supabase` — **tadinya 1 gagal**, kini 5/5 |
| Antarmuka lintas perangkat | ✅ (diperbaiki) | Sapu 8 perangkat + suite Playwright 3 proyek (§ 4) |
| Backend Supabase produksi | 🔴 | Tidak ada project aktif (§ 6.1) |
| Isi katalog saat peluncuran | 🔴 | Pipeline memakai model yang sudah mati (§ 6.2) |
| Legal | 🔴 | Kebijakan privasi DRAF, S&K belum ada (§ 6.3) |
| Safari iOS / WebView IG-TikTok | ⚪ belum teruji | WebKit tidak tersedia di lingkungan ini |

---

## 2. Soal "hilangkan teks & mode demo"

**Di situs produksi, teks demo sudah tidak ada — dan sekarang terbukti, bukan
diasumsikan.** Build produksi mode Supabase (Postgres + PostgREST lokal,
database kosong) disisir 24 rute × desktop 1366 px & ponsel 390 px:

- **0** kemunculan "demo", "fiktif", "data contoh", "seed", "segera hadir",
  `undefined`, `NaN` di teks halaman.
- `/demo`, `/messages`, `/discussions` → **404** (seolah tidak pernah ada).
- Banner "Mode demo", tautan "Lihat pratinjau dengan akun demo", catatan
  "Mode demo — tidak ada email yang dikirim" — semuanya hanya dirender saat
  `dataMode === 'seed'`.

**Kenapa kode mode seed/demo TIDAK dihapus** (ADR-059 #1): mode seed adalah
jalur `npm install && npm run dev` tanpa kredensial (AGENTS.md aturan #1),
dasar seluruh suite e2e/axe di CI, dan situs pratinjau opsional. Menghapusnya
tidak membuat situs produksi lebih bersih (teksnya sudah tidak tampil di sana)
tapi mematikan onboarding dan ±890 uji browser.

**Yang benar-benar menentukan "tanpa demo" adalah konfigurasi hosting:**

| Env | Nilai di produksi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **wajib diisi** — tanpa ini server produksi menolak jalan |
| `ALLOW_DEMO_IN_PRODUCTION` | **jangan diset** (atau `false`) |
| `DEMO_ALLOWED_HOSTS`, `DEMO_ADMIN_KEY`, `DEMO_SESSION_SECRET` | kosongkan |

Pengaman tambahan: `GET /api/health` melaporkan `dataMode`. Pasang monitor yang
menegaskan `"dataMode":"supabase"` — deploy yang salah konfigurasi dan jatuh ke
data contoh tetap menjawab 200, dan hanya asersi itu yang menangkapnya.

---

## 3. Kinerja

| Ukuran | Nilai | Catatan |
|---|---|---|
| JS bersama semua halaman | 103 kB | Next 15 + React 19 — mendekati batas bawah kerangka ini |
| Halaman terberat | `/connections` 153 kB, formulir penyelenggara 147 kB, `/teams/cocok` 144 kB | kanvas peta, pembuat formulir, tumpukan kartu — semuanya di balik login |
| Middleware | 108 kB | CSP bernonce + penyegaran sesi |
| Hotspot database @100k event (dari `docs/rencana-produksi.md` § 4) | listing + count ≈ 600 ms, analitik ≈ 420 ms | cache 300 dtk menutupi listing publik; belum diperbaiki (Fase 6) |

**Rekomendasi region (berdampak langsung ke kecepatan):** halaman dirender di
server dengan beberapa panggilan PostgREST berurutan per halaman, jadi latensi
app↔database dikalikan beberapa kali. Taruh Supabase **dan** hosting Next di
**Singapura** (Supabase `ap-southeast-1`, Vercel `sin1`), keduanya di region
yang sama. Dua project yang ada di akun sekarang berada di Seoul dan Tokyo;
latensi bolak-balik dari Indonesia ke sana umumnya beberapa kali lipat
Singapura (perkiraan umum, tidak diukur dari lingkungan ini).

---

## 4. Responsivitas & keandalan antarperangkat

### Sapu 8 perangkat (build produksi, Chromium)

Android 360×780 · iPhone 390×844 · ponsel landscape 844×390 · iPad mini
768×1024 · iPad Air 820×1180 · tablet landscape 1024×768 · laptop 1366×768 ·
desktop 1920×1080 — sebagai tamu (16 rute), Mahasiswa (17), Penyelenggara (6),
Admin (5).

| Pemeriksaan | Hasil |
|---|---|
| Overflow horizontal (halaman bisa digeser ke samping) | **0** di semua perangkat |
| Galat konsol / exception | **0** |
| Gambar rusak | **0** |
| Tepat satu `<h1>` per halaman | ✅ semua |
| Tinggi navbar di ponsel landscape (layar 390 px) | 65 px (17%) — wajar |
| **Target sentuh < 44 px di tablet sentuh** | **9 jenis kontrol, 30–36 px** → diperbaiki |

### Temuan utama: tablet diperlakukan seperti desktop bermouse

Kontrol yang diringkas untuk desktop memakai breakpoint LEBAR (`sm:min-h-9`).
iPad lebarnya 768–1194 px tapi dipakai dengan jari, jadi mendapat tombol 30–36
px: navigasi bagian Data diri, pilihan jenjang Beasiswa, filter Magang, daftar
isi Kebijakan privasi, filter peta koneksi, tombol Keluar/Ubah/Unduh data,
pilihan privasi. Suite lama hanya mengukur ≤ 412 px atau desktop non-sentuh,
jadi tidak pernah melihatnya.

Perbaikan: ringkas hanya bila pointer presisi (`sm:pointer-fine:min-h-9`).
Desktop bermouse tidak berubah sama sekali. Dikunci
`touch-targets.spec.ts` § tablet sentuh (820 & 1024 px) — **gagal di build
lama, lolos sesudahnya**. Aturannya kini di `CONVENTIONS.md`.

### Ikon perangkat

| Sebelum | Sesudah |
|---|---|
| `/favicon.ico` 404 (crawler, peramban lama, sebagian WebView memintanya langsung) | 200, dari ikon merek |
| Favicon huruf "S" hitam — palet lama ADR-039, tidak mirip logo | Logo kertas + stabilo yang sama dengan navbar (satu geometri `LOGO_MARK`) |
| "Tambahkan ke layar utama" Android: nama = judul halaman panjang, ikon 32 px | Manifest: nama "StudentFo", ikon 192/512 |
| iOS: nama ikon = judul terpotong | `apple-mobile-web-app-title` = StudentFo |

Manifest sengaja `display: browser` dan meta `mobile-web-app-capable` sengaja
tidak dipasang: mode layar penuh membuang tombol kembali di iOS, padahal alur
detail kegiatan → situs penyelenggara mengandalkannya.

### Belum teruji (butuh perangkat fisik)

- **Safari iOS** — WebKit tidak terpasang di lingkungan ini; semua angka di
  atas dari Chromium. Gestur tumpukan kartu `/teams/cocok` di iOS juga belum.
- **WebView Instagram/TikTok** — perilakunya (tombol Google diganti petunjuk
  "Buka di browser") teruji lewat User-Agent, bukan di aplikasi sungguhan.

---

## 5. Yang diubah di sesi ini

| # | Perubahan | Kenapa |
|---|---|---|
| 1 | Uji e2e mode Supabase disesuaikan dengan kalimat petunjuk Instagram | Merah sejak d32cea9 — job CI `integration` akan gagal |
| 2 | `GET /api/health` + `checkHealth()` tanpa Data Cache | Monitor uptime & kesiapan platform; uji mutasi membuktikan ping yang lewat cache tertangkap |
| 3 | Ikon merek 32/192/512/180, rewrite `/favicon.ico`, manifest, judul iOS | § 4 |
| 4 | 9 jenis kontrol: `pointer-fine:` | § 4 |
| 5 | Tautan profil eksternal 19 px → area sentuh 44 px | Ditemukan uji tablet |
| 6 | `tests/e2e/hosting.spec.ts` | favicon, health, manifest, ikon tidak bisa diam-diam rusak lagi |
| 7 | `/about` tidak menampilkan blok angka saat katalog kosong | Hari peluncuran: empat angka "0" raksasa terbaca "situs mati". Dikunci uji e2e mode Supabase pertama (database kosong) |

---

## 6. Penghalang yang hanya bisa diselesaikan pemilik

### 6.1 Backend Supabase produksi — 🔴 penghalang

Akun Supabase yang terhubung punya dua project, **keduanya `INACTIVE`**
(dijeda), dan tidak ada yang bernama StudentFo (dibaca read-only; tidak ada
yang diubah). Langkah:

1. Buat project baru di **Singapura** (§ 3), atau pulihkan salah satunya
   (kalau memang dimaksudkan untuk StudentFo).
2. Terapkan **32 migration berurutan** (`supabase/migrations/`). Semuanya
   lolos di Postgres 16 kosong sesi ini — tapi menerapkan ke project
   sungguhan butuh konfirmasi eksplisit (CLAUDE.md).
3. `npm run db:verify`.
4. Paket **Free menjeda project setelah ±1 minggu tanpa aktivitas** — itu yang
   terjadi pada dua project sekarang. Situs produksi dengan database dijeda =
   situs mati. Pertimbangkan Pro (juga untuk backup harian), atau minimal
   monitor `/api/health` berkala.

### 6.2 Katalog kosong di hari peluncuran — 🔴 penghalang produk

Tanpa data, produk ini halaman kosong yang rapi ("Belum ada kegiatan yang
tayang", sudah diuji; `/about` kini menyembunyikan statistik nol). Sumber data:

- **Pipeline:** default `gemini-2.0-flash` di `pipeline/run.py` **sudah
  dimatikan Google (1 Juni 2026)** — setiap sumber akan gagal di panggilan LLM.
  Isi secret `GEMINI_MODEL` dengan model yang masih hidup (cek dengan kunci
  sungguhan; id tidak boleh dikarang), plus `PIPELINE_SOURCES_YAML` berisi 10+
  sumber nyata (memilih situs = keputusan pemilik, ADR-038).
- **Manual:** sebelum pipeline siap, isi 30–50 kegiatan awal lewat `/submit`
  lalu setujui di `/admin`. Saran: jangan luncurkan dengan < 30 kegiatan aktif.

### 6.3 Legal — 🔴 sebelum dibuka ke publik

- **Kebijakan privasi** berlabel DRAF sampai `PRIVACY_CONTACT_EMAIL` dan
  `PRIVACY_POLICY_EFFECTIVE_DATE` diisi — isi hanya setelah ditinjau bersama
  penasihat hukum (produk ini menyimpan data pendaftar & bukti bayar → UU PDP).
- **Syarat & Ketentuan** belum ada halamannya (P0 audit 2026-10-05).

### 6.4 Konfigurasi hosting

| Env | Wajib | Catatan |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ✅ | Domain final. Dibekukan saat build; dipakai OAuth, email konfirmasi, sitemap |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | ✅ | Dibekukan saat build (Docker: `--build-arg`) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Hanya runtime, jangan `NEXT_PUBLIC_`, jangan build-arg |
| `RATE_LIMIT_SECRET` | ✅ | ≥ 32 karakter acak, sama di semua instance |
| `TURNSTILE_SITE_KEY` + `_SECRET_KEY` | ✅ | Berpasangan. Jangan aktifkan CAPTCHA bawaan Supabase Auth |
| `CRON_SECRET` | bila bot pengingat dipakai | ≥ 32 karakter |
| `CLIENT_IP_HEADER` | bila di belakang Cloudflare | `cf-connecting-ip` — tanpa ini batas per-IP bisa dipalsukan |
| `ALLOW_DEMO_IN_PRODUCTION`, `DEMO_*` | ❌ | Kosongkan (§ 2) |

Di dashboard Supabase:
- Authentication → URL Configuration: *Site URL* = `NEXT_PUBLIC_SITE_URL`,
  *Redirect URLs* = `<SITE_URL>/auth/callback`.
- **SMTP kustom** — SMTP bawaan hanya beberapa email/jam; pendaftaran akun di
  hari peluncuran akan langsung kena `rate_limited`.
- Google provider (bila dipakai) + uji end-to-end manual (README § Autentikasi).
- *Leaked password protection* ON.

Pilihan hosting — satu hal yang membedakan:
- **Vercel:** badan permintaan fungsi dibatasi ±4,5 MB. Unggahan foto galeri &
  bukti bayar dengan JavaScript aman (dikompres di peramban ke ±0,5 MB), tapi
  unggahan tanpa JS sampai 32 MB (ADR-056) akan ditolak platform.
- **Docker/VPS** (`Dockerfile`, `output: 'standalone'`): tidak ada batas itu,
  tapi pasang plafon di proxy (`client_max_body_size 32m`). `docker build`
  belum pernah dijalankan (tidak ada daemon di lingkungan uji).

### 6.5 Uji asap setelah deploy

```bash
curl -s https://<domain>/api/health          # {"status":"ok","dataMode":"supabase"}
curl -sI https://<domain>/favicon.ico        # 200 image/png
curl -sI https://<domain>/ | grep -i content-security-policy
curl -s https://<domain>/demo -o /dev/null -w '%{http_code}\n'   # 404
```

Lalu manual: daftar akun email → terima email konfirmasi → masuk; kirim satu
kegiatan lewat `/submit` → setujui di `/admin` → tampil di `/events`; buka
situs dari tautan di Instagram (petunjuk "Buka di browser" muncul); scan
securityheaders.com.

---

## 7. Mengulang pengukuran

```bash
npm run verify
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run db:test
DATABASE_URL=… npm run test:integration
DATABASE_URL=… npm run test:e2e:supabase
npx playwright test     # 3 proyek + uji tablet sentuh & hosting
```

Skrip sapu 8 perangkat dan sisir kata-demo mode Supabase hidup di scratchpad
sesi (tidak di-commit, mengikuti kebiasaan `docs/evaluasi-pengunjung-kritis.md`):
Playwright, `page.goto` per rute × viewport, ukur `scrollWidth`, target sentuh,
galat konsol, dan `innerText` terhadap daftar kata terlarang.
