# Audit menyeluruh StudentFo — 13–14 Nov 2026

Peran: Senior Full-Stack Engineer, QA, dan UI/UX. Setiap temuan di bawah punya
**bukti** (kode, data produksi, atau pengukuran), bukan daftar periksa generik.
Kandidat yang ternyata bukan masalah dicatat di §0 supaya tidak diaudit ulang.

**Status:** ✅ diperbaiki di PR Valvasas/StudentFo#31 · 📝 rekomendasi (belum dikerjakan) · ✔️ diperiksa, aman.
**Tingkat:** KRITIS · TINGGI · SEDANG · RENDAH · INFO.

## 0. Cara audit & ringkasan

| Alat | Cakupan | Hasil |
|---|---|---|
| Sapuan statis | 64 halaman, 23 berkas Server Action, 16 route handler, 185 komponen | Pola double-submit, listener/interval tanpa pembersihan, fetch tanpa pembatalan, rahasia di klien, aksi tanpa penjaga |
| Advisor Supabase **produksi** | keamanan + performa | 6 view SECURITY DEFINER, 51 RPC SECURITY DEFINER, 25 FK tanpa indeks, 29 indeks belum terpakai, kebocoran sandi |
| `npm audit` (dependensi produksi) | — | **Sebelum: 1 kritis + 3 tinggi.** Sesudah: 0 kritis, 2 tinggi (lihat S2, S3) |
| Playwright, build produksi | 51 rute × 360/768/1280px, 4 persona (tamu, Mahasiswa, Admin, Penyelenggara) = **153 muat halaman** | 0 geser horizontal · 0 galat HTTP · 0 galat konsol · 0 `<img>` tanpa `alt` · 1 target sentuh < 24px yang nyata |
| Uji regresi | e2e 1.073 (35 + 546 + 492) · unit 1.088 · axe a11y | Semua lulus setelah perbaikan |

**Lima temuan terpenting:**
1. **KRITIS — `next` 15.5.26** punya RCE tanpa autentikasi di Image Optimization API ✅
2. **SEDANG — ketuk ganda membalik aksi toggle** (hapus dari Tersimpan, ciutkan menu akun) ✅
3. **SEDANG — kegagalan SMTP tidak terlihat oleh admin.** Tadi malam semua email Auth gagal (`535`) tanpa ada yang tahu 📝
4. **SEDANG — dua konsep "Tersimpan" vs "Papan lamaran"** membingungkan, terbukti dari pemilik sendiri 📝 (perilakunya sudah ditambal di ADR-090 ✅)
5. **RENDAH — `team_member_profiles`** bisa ditarik utuh oleh anggota mana pun 📝

**Kandidat yang ternyata AMAN** (jangan diaudit ulang):

| Kandidat | Kenapa aman |
|---|---|
| 3 aksi admin "tanpa penjaga" | `reviewOrganizer/Claim/RevisionAction` lewat `runTrustDecision()` → `checkAdminAccess()` (`app/admin/actions.ts:162`) |
| `target="_blank"` tanpa `rel` di kartu admin | `rel` ada di baris berikutnya; grep per baris salah baca |
| Race di `region-picker` (fetch tanpa AbortController) | Penanda `cancelled` membuang respons basi (`ui/region-picker.tsx:55`) |
| Listener `popstate` tanpa remove | Dipasang sekali di level modul, bukan per render |
| 17 target "22×43px" di semua halaman anggota (360px) | Isi `<details>` menu akun yang tertutup; hilang setelah disaring `checkVisibility()` |
| Tautan 22px di `/penyelenggara` | Area ketuk sudah diperluas `after:-inset-y-[11px]` (efektif 44px) |
| "Multiple permissive policies" di `events` dkk. | Kebijakan admin sudah `( SELECT is_admin() )` → dievaluasi sekali per query |
| `dangerouslySetInnerHTML` | Hanya skrip tema statis bernonce (`layout/theme-script.tsx`) |

---

## 1. Fungsi & semua tombol

| # | Temuan | Tingkat | Status |
|---|---|---|---|
| F1 | **Toggle tanpa status pending.** "Hapus dari tersimpan" (`app/profile/page.tsx`, `toggleSaveEventAction`) dan "Ciutkan/Lebarkan menu akun" (`layout/account-shell.tsx`) memakai `<button>` mentah. Di koneksi lambat, ketukan kedua sebelum pengalihan selesai **membalik** yang pertama: acara yang dihapus tersimpan lagi | SEDANG | ✅ `SubmitButton` |
| F2 | **Aksi penting tanpa umpan balik.** "Simpan profil" (`profile/interests/page.tsx`) dan "Ya, tolak" admin (`admin/reject-confirm.tsx`): tidak ada tanda proses, pengguna mengetuk ulang atau meninggalkan halaman | RENDAH | ✅ `SubmitButton` + `pendingLabel` |
| F3 | **Sisa tombol mentah di form idempoten:** `layout/notification-menu.tsx` (3), `tracker/[slug]/page.tsx` (2), `events/[slug]/persiapan/page.tsx`, `home/next-steps-card.tsx`, `match/card-summary.tsx`, `auth/demo-login.tsx`. Ketuk ganda aman (idempoten), tetapi tanpa umpan balik | RENDAH | 📝 |
| F4 | Klik "Daftar" tidak tercatat di Papan lamaran | SEDANG | ✅ ADR-090 |
| F5 | **SMTP gagal tanpa ada yang tahu.** Halaman lupa sandi sengaja seragam (benar untuk keamanan, ADR-011), jadi `535 BadCredentials` 13 Nov 22.47 hanya terlihat di log Supabase | SEDANG (operasional) | 📝 tombol "Kirim email uji" khusus admin |

✔️ Yang sudah benar:
- `SubmitButton`: `useFormStatus` + `disabled` + `aria-busy` + label pending.
- `ConfirmSubmit` untuk aksi merusak, plus Urungkan.
- Server Action memvalidasi ulang di server (`formTrimmed`, zod, `actionError`).
- Keadaan kosong punya ajakan, misalnya "Belum ada yang disimpan. Tekan ikon simpan…".
- 153 muat halaman tanpa 4xx/5xx. Catatan: ini rute yang dikunjungi, bukan crawl semua tautan.

**Pola perbaikan F3**, yaitu tombol yang sama dengan status pending:

```tsx
// sebelum
<button type="submit" className="…">Tandai dibaca</button>
// sesudah — disabled + aria-busy + spinner selama aksi berjalan
import { SubmitButton } from '@/components/ui/submit-button';
<SubmitButton className="…" pendingLabel="Menandai…">Tandai dibaca</SubmitButton>
```

**Sketsa F5:** admin mengirim email uji ke alamatnya sendiri dan melihat galatnya, sementara pengguna biasa tetap mendapat pesan seragam.

```ts
// app/admin/actions.ts
export async function sendTestEmailAction(): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin');
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const { error } = await supabase.auth.resetPasswordForEmail(data.user!.email!, {
    redirectTo: `${siteUrl}/reset-password`,
  });
  // Khusus admin: galat SMTP (mis. 535) ditampilkan apa adanya, tidak diseragamkan.
  redirect(withQuery('/admin', error ? { error: 'email_test_failed' } : { notice: 'email_test_sent' }));
}
```

## 2. Desain, UX & responsivitas

Hasil pengukuran: **0 geser horizontal** di 360, 768, dan 1280px pada 51 rute.
Kontras semua pasangan token lolos (`npm run verify`), audit axe lulus, dan
teks 255 karakter tanpa spasi tetap rapi (ADR-088).

| # | Temuan | Tingkat | Status |
|---|---|---|---|
| D1 | Tautan judul di `/lobi` tingginya 23px, di bawah minimum WCAG 2.5.8 (24px), tanpa perluasan area ketuk | RENDAH | ✅ `after:-inset-y-1.5`, pola yang sama dengan `/penyelenggara` |
| D2 | Panel lonceng muncul tanpa animasi, padahal menu akun memakai `pop`. Dua menu bersebelahan, perilakunya berbeda | RENDAH | ✅ `pop` |
| D3 | **Dua konsep untuk satu niat.** "Tersimpan" (bookmark di profil, `saved_events`) dan "Papan lamaran" (`application_tracker`). Tombolnya berlabel "Simpan ke **Tracker**", tetapi menghapus dari Tersimpan tidak mengeluarkan dari Papan lamaran. Pemilik sendiri salah menebak alurnya. ADR-090 menambal perilakunya, arsitektur informasinya masih ganda | SEDANG | 📝 jadikan Papan lamaran satu-satunya "rumah"; tab Tersimpan di profil cukup menautkan ke kolom "Disimpan" |
| D4 | Katalog produksi: 1 acara tayang. Halaman daftar yang rapi tetap terasa kosong. Ini masalah produk, bukan tata letak | SEDANG | 📝 `docs/progres-sekarang.md` §5 E |

✔️ Sudah benar:
- Menu melayang (ADR-089).
- Teks panjang (ADR-088).
- Tombol "taktil" `active:pt-0.5` (ADR-055). **Jangan** diganti `active:scale`; alasannya di `globals.css` §9.
- Mode gelap.
- `prefers-reduced-motion` global.

## 3. Bug, performa & keamanan

| # | Temuan | Tingkat | Status |
|---|---|---|---|
| S1 | **`next` 15.5.26:** RCE tanpa autentikasi di Image Optimization API (GHSA-2464-fhr4-w9xw), DoS App Router lewat Server Actions (GHSA-p3m5-59mp-jv5r), dan 2 cache poisoning SSG/ISR. `sharp` 0.35.4: celah librsvg (CVE-2026-96889) | **KRITIS** | ✅ `next` & `eslint-config-next` 15.5.29, `sharp` 0.35.5. Patch level, e2e 492 lulus |
| S2 | `zod` 3.25.76: memori habis saat memvalidasi koleksi raksasa (GHSA-mrhx-c7xc-m3w5). Perbaikan hanya di zod 4 (breaking). Batas body Server Action 32 MB (perlu untuk unggahan), jadi array besar bisa sampai ke validator | TINGGI (teoretis) | 📝 batasi jumlah elemen **sebelum** parse; migrasi zod 4 terjadwal |
| S3 | `source-map-js` 1.2.1 lewat `@tailwindcss/postcss`: DoS dari source map berbahaya | RENDAH (hanya saat build, tidak ada source map dari luar) | 📝 naik bersama rilis Tailwind berikutnya |
| S4 | View `team_member_profiles` (SECURITY DEFINER) **tanpa filter**: anggota mana pun bisa menarik nama lengkap + id semua anggota semua tim lewat `/rest/v1/team_member_profiles` dalam satu panggilan | RENDAH | 📝 filter ke tim yang memang boleh dilihat penanya |
| S5 | Advisor "security_definer_view" (level ERROR) untuk 5 view lain | INFO | ✔️ disengaja (pola ADR-018). Difilter `auth.uid()`/opt-in, dan anon hanya membaca 2 view agregat publik |
| S6 | RPC `list_event_questions` bisa dipanggil tamu | INFO | ✔️ sesuai ADR-085 (gerbang = etalase, bukan keamanan). Hanya nama depan |
| S7 | Turnstile belum dipasang, jadi captcha lolos otomatis. Leaked password protection mati (butuh Supabase Pro) | SEDANG (konfigurasi) | 📝 `docs/progres-sekarang.md` §5 |
| P1 | 25 FK tanpa indeks. Mayoritas kolom `reviewed_by` (jarang dibaca); 4 ada di jalur panas | RENDAH sekarang, naik seiring data | 📝 migration di bawah, **belum diterapkan** |
| P2 | 29 indeks "tidak terpakai" | INFO | ✔️ DB baru tanpa trafik. **Jangan dihapus** |

✔️ Diperiksa, aman:
- Semua Server Action admin dijaga.
- Tidak ada `console.log`.
- Tidak ada env rahasia di berkas `'use client'`.
- Interval & listener dibersihkan.
- Tautan luar ber-`rel`.
- CSP bernonce.
- Region `sin1` = DB `ap-southeast-1`, jadi tidak ada latensi lintas benua.

**Mitigasi S2** (sebelum zod 4): tolak array kebesaran sebelum validator jalan.

```ts
// lib/form-data.ts
export function formAllBounded(formData: FormData, name: string, max: number): string[] {
  const values = formData.getAll(name);
  // Ditolak SEBELUM zod: validator v3 memproses seluruh array dulu baru mengecek .max().
  if (values.length > max) throw actionError('invalid_submission');
  return values.filter((v): v is string => typeof v === 'string');
}
// pemakaian: formAllBounded(formData, 'education_levels', EDUCATION_LEVELS.length)
```

**S4** (`CREATE OR REPLACE`, tanpa DROP; ikuti aturan keterlihatan yang sama dengan `/teams/[id]`):

```sql
CREATE OR REPLACE VIEW public.team_member_profiles WITH (security_invoker = off) AS
SELECT tm.team_id, tm.user_id, tm.role, tm.joined_at, u.full_name
FROM public.team_members tm
JOIN public.users u ON u.id = tm.user_id
WHERE public.can_view_team(tm.team_id);  -- fungsi/kriteria yang sama dengan halaman detail tim
```

**P1**, indeks di jalur panas (migration baru; terapkan ke staging dulu, produksi atas persetujuan):

```sql
CREATE INDEX IF NOT EXISTS idx_application_tracker_event ON public.application_tracker (event_id);
CREATE INDEX IF NOT EXISTS idx_notifications_event ON public.notifications (event_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_signals_user ON public.recommendation_signals (user_id);
CREATE INDEX IF NOT EXISTS idx_outbound_surveys_event ON public.outbound_surveys (event_id);
```

## 4. Fitur esensial yang belum ada

**Sudah ada, jangan dibangun ulang:**
- konfirmasi aksi merusak + Urungkan
- filter & urutkan berbasis URL
- pintasan `/` untuk cari
- Esc menutup menu & dialog
- ekspor data akun (UU PDP, `/profile/privacy/ekspor`)
- berkas kalender `.ics` per acara
- pengingat tenggat (in-app & email)
- lapor konten
- mode gelap
- Urungkan

| Prioritas | Fitur | Kenapa berdampak |
|---|---|---|
| 1 | **Aksi massal di antrean moderasi** (pilih banyak → Setujui/Tolak) | Begitu pipeline jalan, antrean berisi puluhan item. Menyetujui satu per satu dari HP (seperti 13 Nov) tidak berskala |
| 2 | **Peringatan "acara baru sesuai filter/minatku"** | Alasan orang kembali tanpa harus ingat membuka situs; retensi untuk agregator |
| 3 | **Kirim email uji (admin)** (F5) | Insiden SMTP 13 Nov tidak akan terulang tanpa ketahuan |
| 4 | **Analitik tanpa cookie** (Vercel Web Analytics) | Beta butuh angka konversi gerbang anggota (ADR-085) |
| 5 | **Langganan kalender pribadi** (satu URL ICS berisi semua tenggat di Papan lamaran) | Tenggat masuk Google Calendar sekali pasang |
| 6 | **Simpan instan (UI optimistis)**, §5.1 | Ikon langsung terisi; mencegah ketuk ganda sekaligus |

Sketsa prioritas 1:

```tsx
// app/admin/page.tsx — kotak centang per kartu + satu tombol di atas daftar
<form action={bulkReviewEventsAction}>
  {pending.map((e) => <input key={e.id} type="checkbox" name="ids" value={e.id} aria-label={`Pilih ${e.title}`} />)}
  <ConfirmSubmit name="decision" value="APPROVED" title="Setujui yang dipilih?">Setujui yang dipilih</ConfirmSubmit>
</form>
// actions.ts: checkAdminAccess() SEKALI, ids dibatasi (formAllBounded(formData, 'ids', 50)),
// lalu jalur yang sama dengan reviewEventAction per id (moderation_log tetap tercatat per acara).
```

## 5. Animasi & micro-interactions

Proyek sudah punya sistem gerak CSS:
- 12 keyframe (`sf-enter`, `sf-pop`, `sf-shimmer`, …)
- utilitas `enter` / `pop` / `shimmer`
- aturan `prefers-reduced-motion` global

**Jangan menambah Framer Motion.** Itu menambah puluhan KB JavaScript untuk hal yang
sudah bisa dikerjakan CSS. Juga jangan `active:scale` (ADR-055).

**5.1 Simpan instan tanpa merusak no-JS.** Form tetap Server Action biasa. Ikon
membalik selama aksi berjalan, dan tombolnya terkunci sehingga ketuk ganda mustahil.

```tsx
'use client';
import { Bookmark } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

export function SaveToggle({ saved, label }: { saved: boolean; label: string }) {
  const { pending } = useFormStatus();
  const shown = pending ? !saved : saved; // optimistis: tampil hasil akhirnya sejak ketukan
  return (
    <button type="submit" disabled={pending} aria-pressed={shown} aria-label={label} className="flex size-11 items-center justify-center rounded-sm">
      <Bookmark aria-hidden className={cn('size-4 transition-colors duration-150 ease-snap', shown && 'fill-current', pending && 'pop')} />
    </button>
  );
}
```

**5.2 Skeleton di dalam `<Suspense>`, bukan `loading.tsx`.** `loading.tsx` di
`/` dan `/events` pernah menyebabkan soft-404 (catatan di `app/events/page.tsx`).
Skeleton per bagian aman dan memakai utilitas `shimmer` yang sudah ada:

```tsx
<Suspense fallback={<CardsSkeleton count={3} />}>
  <RecommendedEvents userId={user.id} />
</Suspense>

function CardsSkeleton({ count }: { count: number }) {
  return (
    <ul aria-hidden className="grid gap-3">
      {Array.from({ length: count }, (_, i) => <li key={i} className="shimmer h-28 rounded-card" />)}
    </ul>
  );
}
```

**5.3 Konsistensi panel** ✅. Lonceng kini memakai `pop` seperti menu akun.

**5.4 Transisi antarhalaman: belum disarankan.** View Transitions di Next 15.5
masih eksperimental. Navigasi yang sudah cepat lebih berharga daripada animasi
yang menahan konten 200–300 ms.
