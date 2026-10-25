# API_SPEC.md

StudentFo tidak punya REST/GraphQL API publik — Next.js App Router memakai
React Server Components + Server Actions. "API" di proyek ini berarti tiga
kontrak internal: **repository interface**, **Server Actions**, dan
**bentuk error**. Ditambah kontrak query-string untuk `/events`, dan kontrak
I/O pipeline Python. Semua ada di sini.

## 1. `EventRepository` — kontrak akses data

> **Sejak 2026-09-26** `EventRepository` adalah gabungan interface per domain
> (`EventCatalogRepository`, `ModerationRepository`, `SubmissionRepository`,
> `SavedEventRepository`, `TrackerRepository`, `NotificationRepository`,
> `TeamRepository`, `NetworkRepository`, `RateLimitRepository`, `RecommendationSignalRepository`,
> dan sejak ADR-056 `RegistrationRepository` & `GalleryRepository`) di
> `src/lib/data/repository.ts` — sumber kebenaran tanda tangan method. Blok di
> bawah adalah ringkasan historis; method baru sejak itu (antrean detail,
> `listModerationLog`, `consumeRateLimit`, sinyal & kalibrasi) hanya tercatat
> di berkas tersebut dan DECISION.md ADR-028/031/032.

`src/lib/data/repository.ts`. Satu-satunya API yang boleh dipanggil UI.

```ts
interface EventRepository {
  listEvents(query: EventQuery): Promise<Paginated<EventSummary>>;
  getEventBySlug(slug: string): Promise<EventDetail | null>;
  listClosingSoon(limit: number): Promise<readonly EventSummary[]>;
  listCategories(): Promise<readonly Category[]>;
  getStats(): Promise<RepositoryStats>;
  getDeadlineWeek(): Promise<readonly DeadlineDay[]>;   // 7 hari WIB mulai hari ini

  // Hanya dipanggil dari rute /admin
  listByStatus(status: EventStatus, limit: number): Promise<readonly EventSummary[]>;
  reviewEvent(input: ReviewEventInput): Promise<void>;

  // Kiriman komunitas (Phase 3). createSubmission boleh tamu; dua lainnya admin saja.
  createSubmission(input: CreateSubmissionInput): Promise<void>;
  listSubmissions(status: EventStatus, limit: number): Promise<readonly Submission[]>;
  // Kiriman milik userId (dari sesi server, bukan input), terbaru dulu — /submit & studio.
  listMySubmissions(userId: string, limit: number): Promise<readonly Submission[]>;
  reviewSubmission(input: ReviewSubmissionInput): Promise<void>;

  // Saved events (Phase 2)
  isEventSaved(userId: string, eventId: string): Promise<boolean>;
  listSavedEventIds(userId: string): Promise<readonly string[]>;
  saveEvent(userId: string, eventId: string): Promise<void>;
  unsaveEvent(userId: string, eventId: string): Promise<void>;
  listSavedEvents(userId: string): Promise<readonly EventSummary[]>;

  // Notifikasi (Phase 2)
  listNotifications(userId: string, limit: number): Promise<readonly AppNotification[]>;
  countUnreadNotifications(userId: string): Promise<number>;
  markNotificationAsRead(userId: string, notificationId: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;

  // Tim lomba (Phase 3)
  listTeams(eventId?: string): Promise<readonly Team[]>;
  getTeamById(teamId: string): Promise<Team | null>;
  createTeam(input: CreateTeamRepositoryInput): Promise<string>; // -> teamId; Supabase: RPC create_team_with_leader (atomik)
  joinTeam(actorId: string, actorName: string, teamId: string): Promise<void>;
  leaveTeam(actorId: string, teamId: string): Promise<void>;
  removeTeamMember(actorId: string, teamId: string, memberId: string): Promise<void>;
  deleteTeam(actorId: string, teamId: string): Promise<void>;

  // Application tracker (Phase 2)
  listTrackerItems(userId: string): Promise<readonly TrackerItem[]>;
  upsertTrackerItem(
    userId: string,
    eventId: string,
    status: TrackerStatus,
    notes?: string | null,
  ): Promise<void>;
  addTrackerItemIfAbsent(userId: string, eventId: string): Promise<void>; // tidak menimpa tahap
  removeTrackerItem(userId: string, eventId: string): Promise<void>;
}
```

**Kontrak id.** Id dari URL/form yang bukan UUID tidak pernah dikirim ke
Postgres: method baca mengembalikan `null`/kosong, method tulis melempar
`actionError(...)`. Tanpa ini `/teams/abc` berujung 502, bukan 404.

**Kontrak `Team.memberCount`.** Jumlah anggota selalu benar untuk siapa pun;
`members` (nama) kosong bagi tamu di produksi karena view nama anggota hanya
untuk `authenticated`. UI memakai `memberCount` untuk hitungan dan slot.

Ambil instance lewat `getEventRepository()` (`src/lib/data/index.ts`) —
jangan `new MemoryEventRepository()` / `new SupabaseEventRepository()`
langsung di kode aplikasi (boleh di test).

**Kontrak notifikasi.** Repository hanya MEMBACA dan menandai dibaca; ia
tidak pernah membuat notifikasi. Produsennya ada di luar (fungsi Postgres
terjadwal di produksi, turunan on-the-fly di `MemoryEventRepository`) —
lihat `DECISION.md` ADR-017.

**Kontrak otorisasi tim.** `actorId` pada `joinTeam`/`leaveTeam`/
`removeTeamMember`/`deleteTeam` diperiksa **di dalam implementasi**, bukan
diasumsikan sudah dicek pemanggil. `removeTeamMember` dan `deleteTeam`
melempar `AppError` `FORBIDDEN` kalau pemanggil bukan ketua tim. Alasannya:
di Supabase RLS jadi penjaga terakhir, tapi `MemoryEventRepository` tidak
punya RLS sama sekali — tanpa pemeriksaan di lapisan ini, mode seed akan
mengizinkan hal yang produksi tolak dan bedanya baru ketahuan saat deploy.
`actorName` hanya dipakai jalur memory; jalur Supabase mengambil nama dari
tabel `users` lewat view `team_member_profiles`, tidak pernah dari input
pemanggil.

### `EventQuery` → `Paginated<EventSummary>`

```ts
interface EventQuery {
  search?: string;
  types?: readonly EventType[];
  categories?: readonly string[];   // category slugs
  levels?: readonly EducationLevel[];
  locations?: readonly string[];
  mode?: 'online' | 'onsite';
  sort?: 'relevance' | 'deadline' | 'newest';
  includeClosed?: boolean;
  cost?: 'free' | 'paid';           // ADR-049; `isFree === null` tidak masuk keduanya
  page?: number;
  pageSize?: number;   // default 12, maks 48 (DEFAULT_PAGE_SIZE / MAX_PAGE_SIZE)
  profile?: UserProfile | null;     // personalisasi rekomendasi (§6)
  promoted?: boolean;               // ADR-049; OPT-IN, default false
}
```

Perilaku sort:
- `relevance` — rumus `rankEvents()` dari `recommendation.ts` (personalized
  jika profil lengkap, cold-start jika `profile` null/belum lengkap). Mode
  seed menjalankannya di Node; Supabase menjalankan kembarannya di SQL lewat
  RPC `list_personalized_events()` atas SEMUA hasil filter sebelum
  LIMIT/OFFSET — halaman berapa pun benar (ADR-050, menggantikan jendela 240
  kandidat ADR-021). Kedua sisi dikunci uji paritas
  `tests/integration/relevance-and-attributes.test.ts`.
- `includeClosed: true` ikut menampilkan event `EXPIRED` di kedua implementasi.
- `deadline` — tenggat terdekat dulu; event tanpa tenggat ditaruh **terakhir**
  (bukan `NULL` pertama, supaya tidak "menyelinap" ke puncak).
- `newest` — `created_at DESC`.
- `promoted: true` — kegiatan dengan promosi AKTIF (`isPromoted()` =
  `events_listing.is_promoted`) dipindah ke puncak dalam urutan relatifnya,
  sisanya tetap urutan di atas. Skor tidak berubah. Hanya daftar umum
  `/events` yang memintanya; daftar yang menyatakan fakta (tenggat terdekat,
  hitungan, "sesuai minatmu") tidak.

Kedua implementasi (`MemoryEventRepository`, `SupabaseEventRepository`)
WAJIB menghasilkan urutan & filter yang setara secara semantik — kalau kamu
ubah logika filter/sort, ubah di kedua tempat dan jaga test tetap hijau.

### Field biaya, promosi, lencana, buku panduan (ADR-049)

| Field | Tipe | Arti |
|---|---|---|
| `EventSummary.isFree` | `boolean \| null` | `null` = belum diketahui (hasil scraping). UI tidak menampilkan lencana. |
| `EventSummary.priceAmount` | `number \| null` | Rupiah utuh; hanya bila `isFree === false`. `null` = nominal belum diumumkan. |
| `EventSummary.featuredUntil` | `string \| null` | Akhir promosi; `null` = tidak berpromosi. Aktif/tidak dihitung `isPromoted(event, now)`. |
| `EventSummary.verificationBadge` | `'OFFICIAL_GOV' \| 'CAMPUS_VERIFIED' \| 'COMMUNITY' \| null` | Diberikan moderator, bukan diklaim penyelenggara. |
| `EventDetail.guidebookUrl` | `string \| null` | https saja (CHECK di DB + `guidebookPreview()` saat render). |

`EventPresentationRepository` (admin saja, dipanggil SETELAH `checkAdminAccess()`):
`updateEventPresentation({ eventId, verificationBadge, featuredUntil })` — hanya
acara APPROVED (`event_unavailable`); `listFeaturedEvents(limit)`.

`NotificationDispatchRepository` (server saja, route ber-`CRON_SECRET`):
`claimDeadlineDispatches(limit)` → `DeadlineDispatch[]` (sewa 15 menit),
`acknowledgeDeadlineDispatches(ids)` → jumlah yang benar-benar ditandai.

### Formulir pendaftaran, pembayaran, galeri (ADR-056)

`RegistrationRepository` & `GalleryRepository` — pelaku `EventActor { id,
fullName, email, isAdmin }` dari `toEventActor(user)` (`src/lib/auth.ts`);
`isAdmin` hanya dipakai mode seed, produksi membaca `is_admin()` di database.

| Method | Siapa | Gagal |
|---|---|---|
| `getRegistrationForm(eventId)` | publik (acara tayang) | `null` bila belum ada; `activeCount` = pendaftar hidup |
| `saveRegistrationForm(actor, eventId, input)` | pengelola terverifikasi / admin | `not_event_manager`, `invalid_registration_form` (CHECK DB) |
| `registerForEvent(actor, eventId, answers)` | pengguna masuk; jawaban SUDAH lolos `readAnswers()` | `registration_closed` → `registration_exists` → `registration_full` → `registration_rate_limited` (urutan ini di kedua implementasi) |
| `getMyRegistration(userId, eventId)` / `listMyRegistrations(userId)` | pemilik | — |
| `getRegistration(actor, id)` | pemilik / pengelola / admin | `null` untuk selain itu (tidak membedakan "ada tapi bukan milikmu") |
| `listEventRegistrations(actor, eventId)` / `listRegistrationStats(actor, ids)` | pengelola / admin | `[]` untuk selain itu |
| `submitPaymentProof(actor, id, image)` | pemilik, status AWAITING_PAYMENT/PAYMENT_REVIEW | `registration_not_found`, `registration_invalid_transition` |
| `getPaymentProof(actor, id)` | pemilik / pengelola / admin | `null` |
| `reviewRegistration(actor, id, 'confirm'\|'reject_payment'\|'reject', note)` | pengelola / admin | `registration_not_found`, `review_note_required`, `registration_invalid_transition` |
| `cancelRegistration(actor, id)` | pemilik | `registration_not_found`, `registration_invalid_transition` |
| `listEventPhotos(eventId)` / `getEventPhotoFile(photoId)` | publik (acara tayang) | `[]` / `null` |
| `addEventPhotos(actor, eventId, images, caption)` / `deleteEventPhoto(actor, photoId)` | pengelola / admin | `not_event_manager`, `gallery_full` (30/acara), `photo_not_found` |

Transisi status (satu definisi: `registrationTransition()` di
`src/lib/registration-form.ts`, kembar SQL di migration `20261014100001`):

```
daftar ──(gratis)──────────────────────────────▶ CONFIRMED
      └─(berbayar)─▶ AWAITING_PAYMENT ─bukti─▶ PAYMENT_REVIEW ─confirm─▶ CONFIRMED
                          ▲   └──────confirm (tandai lunas)──────────────▲
                          └──reject_payment (catatan wajib)──┘
AWAITING_PAYMENT | PAYMENT_REVIEW | CONFIRMED ─reject (catatan)─▶ REJECTED (final)
                                              ─cancel (pemilik)─▶ CANCELLED (boleh daftar ulang)
```

Gambar unggahan selalu lewat `readImageUpload()` (`src/lib/image-file.ts`):
jenis dari byte (JPEG/PNG/WebP), ≤5 MB, 32 px..10.000 px, ≤40 MP, metadata
dibuang kecuali Orientation; JPEG dipotong di EOI gambar utama (bingkai
MPF/MPO & trailer ikut hilang).

`GET /events/<slug>/daftar` (ADR-032) mencatat `register_click`, lalu: formulir
StudentFo terbuka & tenggat belum lewat → 303 ke `/events/<slug>/formulir`;
selain itu → tautan resmi penyelenggara seperti sebelumnya.

### Pencocokan tim/partner (ADR-057)

`MatchmakingRepository` — tiga method; peringkat BUKAN tugas repository.

| Method | Siapa | Catatan |
|---|---|---|
| `getSeekerProfile(userId)` | pemilik | `null` = belum pernah membuat kartu |
| `saveSeekerProfile(actor, input)` | pemilik | `input` SUDAH lolos `parseSeekerForm()`; kartu terbuka wajib punya ≥1 keahlian dan (kota ATAU `remoteOk`) — dijaga juga CHECK database |
| `listSeekerCandidates(viewerId, limit)` | pengguna masuk | **Timbal-balik:** `[]` bila kartu pembaca sendiri tidak terbuka. Tanpa diri sendiri, tanpa pemblokir/diblokir, tanpa email. `limit` dijepit `1..400` (`clampCandidateWindow`, kembar `LEAST(GREATEST(COALESCE(p,200),1),400)`) |

Peringkat: `rankCandidates(viewer, candidates, { style, filters, limit })`
(`src/lib/matchmaking.ts`) — murni, deterministik (seri diurutkan `userId`),
dipakai halaman untuk kedua mode data. Bentuk keluaran `Match { score 0..100,
components[6], reasons[], chemistry, distanceKm }`; `distanceKm` dibulatkan
5 km dan `null` bila kota salah satu tak dikenal (`src/lib/geo.ts`).

Kontrak query `/teams/cocok` (`parseMatchQuery()` / `serializeMatchQuery()`;
nilai bawaan tidak ditulis sehingga satu kombinasi = satu URL; nilai asing
diabaikan, bukan galat):

| Param | Nilai | Bawaan |
|---|---|---|
| `cari` | `1` = putar pemindaian (hanya dari Simpan kartu dan "Cari ulang"; form saringan TIDAK membawanya) | — |
| `jarak` | `25` \| `100` \| `500` (km) | tanpa batas |
| `daring` | `0` = hanya yang bisa bertemu langsung | ikutkan yang daring |
| `keahlian` | slug `TEAM_SKILLS`, boleh berulang (salah satu cukup) | — |
| `portofolio` | `ada` \| `juara` | `semua` |
| `jenjang` | `sama` | — |
| `gaya` | `juara` \| `belajar` | `seimbang` |
| `tampil` | `6` \| `12` \| `18` \| `24` | `6` |

### `ReviewEventInput`

```ts
interface ReviewEventInput {
  eventId: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerId: string | null;
  reason?: string;
}
```

Dipanggil **hanya** dari `src/app/admin/actions.ts` setelah `checkAdminAccess()`
lolos.

### `ReviewSubmissionInput`

```ts
interface ReviewSubmissionInput {
  submissionId: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerId: string | null;
}
```

`APPROVED` di Supabase = RPC `approve_submission()` (satu transaksi: insert
`events` + tenggat utama + kategori + tandai kiriman). SQLSTATE dipetakan ke
kode: `23505` → `submission_duplicate`, `P0002` → `submission_not_found`,
`P0001` + `submission_rate_limited` (trigger migration 0009) → `submission_rate_limited` (HTTP 429),
kegagalan cast/CHECK → `invalid_submission`. Implementasi Supabase menulis `reviewed_by`, `reviewed_at`, dan
`rejection_reason` (di-null-kan kalau `decision !== 'REJECTED'`).

## 2. Server Actions

Semua Server Action di proyek ini mengikuti pola yang sama: menerima
`FormData`, mengembalikan `void`, dan melaporkan hasil lewat
`redirect()` berparameter. Konsekuensinya disengaja — seluruh alur tetap
berfungsi tanpa JavaScript. `redirect()` melempar secara internal, jadi ia
**selalu** dipanggil di luar `try/catch`.

### Aksi koneksi — `src/app/connections/actions.ts` (ADR-040)

| Aksi | Field form | Sukses (`?notice=`) | Gagal (`?error=`) |
|---|---|---|---|
| `requestConnectionAction` | `targetId`, `message?` (≤280), `returnTo` | `connection_requested`, atau `connection_matched` kalau target sudah lebih dulu mengajak | `connection_self`, `connection_exists`, `person_unavailable`, `connection_rate_limited`, `invalid_connection_message` |
| `respondConnectionAction` | `connectionId`, `decision` (`accept`\|`decline`), `returnTo` | `connection_accepted` / `connection_declined` | `connection_not_found`, `connection_forbidden` |
| `removeConnectionAction` | `connectionId`, `kind` (`cancel`\|`remove`), `returnTo` | `connection_cancelled` / `connection_removed` | `connection_not_found` |
| `updateNetworkProfileAction` | `discoverable` (checkbox), `headline?` (≤140), `returnTo` | `network_profile_saved` | `invalid_network_profile` |
| `blockPersonAction` (ADR-041) | `targetId`, `returnTo` | `person_blocked` (juga kalau sudah diblokir — idempoten) | `block_self`, `block_unavailable` |
| `unblockPersonAction` (ADR-041) | `targetId`, `returnTo` | `person_unblocked` | `block_not_found` |

Semua memanggil `requireUser()` sendiri; siapa yang boleh menjawab/memutus/
memblokir diperiksa di repository, RLS migration `20260927100001` &
`20260928100001` penjaga terakhirnya. `returnTo` lewat `safeNextPath()` dan
mempertahankan saringan `?q=`/`?minat=` serta `?tampil=` (jumlah halaman
koneksi yang dimuat, 1–10 × 50).

Mengajak orang yang memblokir pembaca (atau yang diblokir pembaca) gagal
dengan `person_unavailable` — kode yang SAMA dengan "profil disembunyikan",
supaya yang diblokir tidak bisa menyimpulkan bahwa ia diblokir.

`NetworkRepository.listConnections(userId, { limit, cursor, kind?, search? })` mengembalikan
`{ items, nextCursor }` (kursor keyset opak; rusak → `invalid_request`,
`limit` dipotong ke 500). `kind` = `accepted` | `incoming` | `outgoing`
(tanpa = semua, dipakai peta); `search` = potongan nama pihak lawan, WAJIB
lewat `normalizeConnectionSearch()` (repository Supabase menormalisasi ulang
sebelum `ilike`). Aturan saring yang sama (`matchesConnectionFilter`) dipakai
kedua repository — dikunci test paritas. Angka di halaman diambil dari
`countConnections()`, bukan dari panjang halaman (ADR-048).

### Aksi penyelenggara — `src/app/penyelenggara/actions.ts` (ADR-042)

| Aksi | Field form | Sukses (`?notice=`) | Gagal (`?error=`) |
|---|---|---|---|
| `applyOrganizerAction` | `orgName` (2–160), `website?` (https), `evidence` (20–1000), `returnTo` | `organizer_applied` | `invalid_organizer_application`, `organizer_revoked`, `organizer_rate_limited` |
| `claimEventAction` | `eventId`, `evidence` (20–1000), `returnTo` | `claim_submitted` | `invalid_claim`, `organizer_not_verified`, `claim_exists`, `claim_already_managed`, `event_unavailable`, `organizer_rate_limited` |
| `proposeRevisionAction` | `eventId`, `slug`, `registrationLink`, `deadlineDate?`, `description`, `location`, `isOnline`, `educationLevels[]`, `note?`, `returnTo` | `revision_submitted` | `not_event_manager`, `invalid_revision`, `revision_empty`, `revision_deadline`, `organizer_rate_limited` |

Selisih revisi dihitung terhadap data acara SAAT INI di server
(`buildRevisionChanges`), bukan nilai lama dari form.

### Aksi admin penyelenggara — `src/app/admin/actions.ts` (ADR-042)

| Aksi | Field form | Sukses | Gagal |
|---|---|---|---|
| `reviewOrganizerAction` | `userId`, `decision` (`VERIFIED`\|`REJECTED`\|`REVOKED`), `note` (wajib untuk tolak/cabut), `tab` | `organizer_reviewed` | `invalid_request`, `organizer_not_found`, `organizer_invalid_transition` |
| `reviewClaimAction` | `claimId`, `decision` (`APPROVED`\|`REJECTED`), `note`, `tab` | `claim_reviewed` | `invalid_request`, `claim_not_found`, `organizer_not_verified` |
| `reviewRevisionAction` | `revisionId`, `decision`, `note`, `tab` | `revision_reviewed` | `invalid_request`, `revision_not_found`, `revision_rejected_by_db` |

Ketiganya memanggil `checkAdminAccess()` sendiri lalu RPC service_role;
keputusan tercatat di `moderation_log` oleh trigger.

`restoreRejectedAction` (ADR-046): `subjectType` (`event`\|`submission`),
`subjectId` → `/admin/riwayat?notice=moderation_restored`; gagal
`moderation_not_rejected` (subjek tidak sedang REJECTED). Memanggil
`ModerationRepository.restoreRejected()`; REJECTED → PENDING, tercatat trigger.

### Aksi akun — `src/app/auth/actions.ts`

| Aksi | Field form | Sukses | Gagal |
|---|---|---|---|
| `signInAction` | `email`, `password`, `next` | redirect ke `next` | `/login?error=…&email=…` |
| `signUpAction` | `accountType`, `fullName`, `email`, `password`, `privacyConsent`, `next`, token Turnstile | `/verify-email?email=…&next=…` (atau langsung tujuan kalau konfirmasi email dimatikan; penyelenggara → `/penyelenggara`) | `/register?error=…&email=…&type=…` — jeda per alamat dari Supabase TIDAK dilaporkan |
| `signInWithGoogleAction` | `next` (+ `accountType`, `privacyConsent` dari form daftar) | redirect ke URL consent Google | `/login?error=…` atau `/register?error=consent_required…` |
| `resendConfirmationAction` | `email`, `next`, token Turnstile | `/verify-email?notice=confirmation_resent` (juga saat GoTrue menjeda alamat itu) | `/verify-email?error=rate_limited|captcha_failed` — `rate_limited` hanya dari batas yang tidak bergantung alamat |
| `signOutAction` | — | `/` | — |
| `requestPasswordResetAction` | `email`, token Turnstile | `/forgot-password?notice=reset_email_sent` (juga saat GoTrue menjeda alamat itu) | `rate_limited` (batas per IP kita / batas Supabase yang tidak bergantung alamat) & `captcha_failed` |
| `updatePasswordAction` | `password`, `confirmPassword` | `/profile?notice=password_updated` | `/reset-password?error=…` |
| `changePasswordAction` | `currentPassword`, `password`, `confirmPassword` | `/profile?notice=password_updated` | `/profile?error=…` |

Aturan yang mengikat seluruh tabel di atas:

- **`next` selalu lewat `safeNextPath()`** (§7 di bawah).
- **Kata sandi maksimal 72 byte UTF-8** (batas bcrypt; huruf beraksen/emoji
  dihitung lebih dari satu) — melebihi itu dilaporkan `password_too_long`.
- **Kegagalan dilaporkan sebagai KODE**, bukan teks — daftar tertutupnya di
  `src/lib/auth-messages.ts` (`AuthErrorCode`, `AuthNoticeCode`). Kode tak
  dikenal di URL tidak menampilkan apa pun.
- **Tidak ada jawaban yang membedakan email terdaftar dan tidak.** Termasuk
  di `signUpAction`, yang sengaja tidak bercabang meski Supabase menandai
  email duplikat lewat `identities: []`.
- **Setelah kata sandi berubah**, sesi di perangkat lain dicabut
  (`signOut({ scope: 'others' })`).
- **`changePasswordAction` memverifikasi kata sandi lama** dengan
  `signInWithPassword` sebelum mengganti.

### `updateProfileAction(formData)` — `src/app/profile/actions.ts`

Field: `fullName`, `educationLevel`, `major`, `interests` (checkbox berulang,
berisi slug kategori). Menulis lewat klien anon + RLS `users_update_own`,
bukan service_role. Sukses → `/profile?notice=profile_saved`.

### Kode umpan balik aksi — `src/lib/action-feedback.ts`

Semua aksi di luar alur akun melaporkan hasil sebagai `?error=<kode>` /
`?notice=<kode>` dari daftar tertutup (`ACTION_ERROR_CODES`,
`ACTION_NOTICE_CODES`), dirender oleh `<ActionFeedback>`. **Teks pesan tidak
pernah dioper lewat URL** (ADR-019). Repository melempar `actionError(kode)`
untuk penolakan yang memang untuk dibaca pengguna; `toActionErrorCode()`
mengubah error lain jadi `unknown` dan mencatat detailnya ke log server.
Query ditambahkan lewat `withQuery()`, yang aman untuk `returnTo` yang sudah
punya query string.

### Aksi tracker & saved events — `src/app/tracker/actions.ts`

| Aksi | Field form | Sukses | Gagal |
|---|---|---|---|
| `toggleSaveEventAction` | `eventId`, `returnTo` | redirect ke `returnTo` | belum login → `/login?next=…`; error repo → `returnTo?error=<kode>` |
| `updateTrackerStatusAction` | `eventId`, `status`, `notes?`, `returnTo` | redirect ke `returnTo` | status tak dikenal → `returnTo?error=invalid_request` |
| `removeTrackerAction` | `eventId`, `returnTo` | redirect ke `returnTo` | `returnTo?error=<kode>` |
| `updatePortfolioAction` (ADR-046) | `eventId`, `achievement?`, `achievementNote?` (≤120), `proofUrl?` (https, ≤500), `visible` (checkbox), `returnTo` | `returnTo?notice=portfolio_saved` | `invalid_portfolio`, `portfolio_not_eligible` (bukan APPLIED+ / bukan miliknya) |

Portofolio dibaca lewat `PortfolioRepository.getPublicProfile(viewerId, userId)`
→ `PublicProfile | null` (null = tidak ada ATAU tidak boleh dilihat; halaman
`/orang/[id]` menjawab 404 untuk keduanya). Riwayat penyelenggara:
`OrganizerRepository.listOrganizerHistory(userId)`.

Menyimpan event memanggil `addTrackerItemIfAbsent()`, bukan
`upsertTrackerItem('SAVED')` — menyimpan ulang tidak boleh memundurkan tahap
yang sudah maju. Otorisasi lewat `requireUser()` di dalam tiap aksi.

### Aksi notifikasi — `src/app/notifications/actions.ts`

| Aksi | Field form | Sukses | Gagal |
|---|---|---|---|
| `markNotificationReadAction` | `notificationId`, `returnTo` | redirect ke `returnTo` | redirect ke `/login?next=...` jika belum login |
| `markAllNotificationsReadAction` | `returnTo` | redirect ke `returnTo` | sama |

`returnTo` diisi tautan event notifikasi tersebut, sehingga satu klik =
menandai dibaca + membuka kegiatannya. Id milik orang lain yang ditebak
tidak mengubah apa pun dan **tidak** menghasilkan pesan berbeda — membedakan
"tidak ada" dari "bukan milikmu" adalah kebocoran informasi.

### Aksi tim lomba — `src/app/teams/actions.ts`

| Aksi | Field form | Sukses | Kode gagal |
|---|---|---|---|
| `createTeamAction` | `eventId`, `title`, `slotsNeeded`, `description?`, `returnTo` | redirect ke `/teams/<id>` | `invalid_team_form`, `event_unavailable` |
| `joinTeamAction` | `teamId`, `returnTo` | redirect ke `returnTo` | `team_full`, `team_not_found` |
| `leaveTeamAction` | `teamId`, `returnTo` | redirect ke `returnTo` | `leader_cannot_leave` |
| `removeTeamMemberAction` | `teamId`, `memberId`, `returnTo` | redirect ke `returnTo` | `team_forbidden`, `leader_cannot_be_removed` |
| `deleteTeamAction` | `teamId`, `returnTo` | redirect ke `/teams` | `team_forbidden` (ke `/teams?error=…`) |

Validasi form lewat `parseCreateTeamForm()` (`src/lib/team-schema.ts`), yang
batas-batasnya mencerminkan kolomnya di migration 0001 (`title` VARCHAR(255),
`slots_needed` CHECK 1..50).

### Aksi pencocokan tim — `src/app/teams/cocok/actions.ts` (ADR-057)

| Aksi | Field form | Sukses | Kode gagal |
|---|---|---|---|
| `saveSeekerAction` | `open`, `city?`, `skills[]`, `seeking[]`, `remoteOk`, `pitch?` | `/teams/cocok?notice=seeker_opened` (kartu BARU dibuka, dirayakan) atau `seeker_saved`; membawa `cari=1` bila terbuka | `invalid_seeker_profile` (+ `fields=` daftar kolom bermasalah) |
| `inviteMatchAction` | `targetId`, `message?`, `returnTo` | `notice=match_invited`, atau `connection_matched` bila pihak lain sudah mengajak lebih dulu | `invalid_request`, `invalid_connection_message`, kode Koneksi (`person_unavailable`, `connection_exists`, `connection_self`, `connection_rate_limited`) |

Keduanya memanggil `requireUser()` sendiri. `returnTo` hanya boleh kembali ke
`/teams/cocok` (dengan saringannya); selain itu dipaksa ke halaman itu. Ajakan
memakai jalur yang SAMA dengan Koneksi (`requestConnection`) — tidak ada tabel
ajakan kedua. Dengan JS, tombol/gestur "Ajak" HANYA membuka lembar tinjau;
form POST ke `inviteMatchAction` baru dikirim dari tombol "Kirim ajakan" di
sana (tanpa JS tombol di kartu langsung mengirim). "Lewati" sebuah kartu adalah
keadaan klien sementara (`sessionStorage` `sf-deck-skip:<viewerId>`, hanya id
kandidat, divalidasi saat dibaca), tak pernah dikirim ke server (ADR-058).

### Aksi kiriman komunitas — `src/app/submit/actions.ts`

| Aksi | Field form | Sukses | Gagal |
|---|---|---|---|
| `submitEventAction` | `email`, `title`, `organizer`, `eventType`, `registrationLink`, `sourceUrl?`, `deadlineDate` (`YYYY-MM-DD`), `educationLevels[]`, `categorySlugs[]?`, `location?`, `isOnline?`, `description?`, `costType` (`free`/`paid`/`unknown`), `priceAmount?`, `guidebookUrl?` (https), `organizerContact?`, `proofLink?`, `website` (honeypot) | `/submit?notice=submission_received` | `/submit?error=invalid_submission&fields=<nama field skema>`, atau `/submit?error=submission_rate_limited` (ADR-023) |

Boleh dipanggil tamu. Validasi: `parseSubmissionForm()`
(`src/lib/submission-schema.ts`) — tenggat tidak boleh lewat atau > 3 tahun
(aturan sama dengan pipeline), tautan wajib http/https. `fields` hanya berisi
nama field dari skema kita dan disaring daftar putih di halaman. Honeypot
terisi → dijawab seolah sukses, tidak disimpan. Teks bebas melewati
`stripMarkup()` (tag HTML, karakter kendali & pembalik arah U+202E dibuang)
SEBELUM batas panjang dicek — isinya juga mengalir ke `.ics` dan payload bot.
`organizerContact`/`proofLink` hanya untuk moderator: `approve_submission()`
tidak menyalinnya ke `events` (ADR-049).

### `updateEventPresentationAction` — `src/app/admin/actions.ts` (ADR-049)

Field: `eventId`, `verificationBadge` (kosong = cabut), `featuredUntil`
(`YYYY-MM-DD`, 23.59 WIB; kosong = hentikan; hari ini..+366 hari), `q`
(pencarian yang dibawa pulang — hanya sebagai NILAI parameter). Otorisasi
`checkAdminAccess()` di dalam aksi. Sukses → `/admin/promosi?notice=presentation_saved`;
gagal → `invalid_presentation` / `event_unavailable`. Mencabut tag `events`.

### `reviewSubmissionAction` — `src/app/admin/actions.ts`

Field: `submissionId`, `decision` (`APPROVED`/`REJECTED`). Otorisasi
`checkAdminAccess()` di dalam aksi. Sukses → `/admin?notice=submission_approved`
atau `submission_rejected`; gagal → `/admin?error=<kode>`
(`submission_duplicate`, `submission_not_found`, `invalid_submission`).

### `reviewEventAction(formData: FormData): Promise<void>`
`src/app/admin/actions.ts`. Endpoint HTTP tersembunyi di balik `<form action=...>`
— **memeriksa otorisasi di dalam dirinya sendiri** (`checkAdminAccess()`),
tidak mempercayai bahwa halaman pemanggil sudah menjaga akses.

Input form fields: `eventId` (string), `decision` (`'APPROVED'|'REJECTED'`),
`reason` (opsional, dipotong 500 karakter).

Tidak mengembalikan nilai — hasil dikomunikasikan lewat `redirect('/admin?status=...')`
dengan `status` ∈ `{ok, forbidden, invalid, failed}` (mapping pesan di
`STATUS_MESSAGE` pada `src/app/admin/page.tsx`). Alasan pola ini: form tetap
berfungsi tanpa JavaScript, dan `redirect()` harus dipanggil **di luar**
try/catch (ia melempar secara internal oleh Next.js).

Efek samping sukses: `revalidatePath('/admin')`, `revalidatePath('/events')`,
`revalidatePath('/')`.

## 2b. Route handler mesin & unduhan

### `GET /api/events/[slug]/calendar` (ADR-049/Modul 2)

Berkas `.ics` (RFC 5545) semua tenggat yang belum lewat, acara seharian per
tanggal WIB, pengingat 09.00 H-3 & H-1 untuk pendaftaran/pengumpulan.
`200 text/calendar; charset=utf-8` + `Content-Disposition: attachment`;
`404 { error, code: 'NOT_FOUND' }` bila kegiatan tidak ada/tidak tayang atau
belum punya jadwal. Publik, `Cache-Control: public, max-age=300`.

### `GET /api/health` (ADR-059)

Untuk monitor uptime & pemeriksaan kesiapan platform hosting. Publik, tanpa
autentikasi, `Cache-Control: no-store` (juga `HEAD`).

- `200 { "status": "ok", "dataMode": "supabase" | "seed" }` — aplikasi hidup
  dan `EventRepository.checkHealth()` berhasil.
- `503 { "status": "unavailable", "dataMode": … }` — database tidak
  terjangkau. Penyebabnya hanya di log server (`[health]`), tidak di respons.

`checkHealth()` sengaja tidak lewat Data Cache (uji mutasi di
`tests/integration/smoke.test.ts`). Monitor produksi sebaiknya menegaskan
`dataMode === "supabase"`: deploy yang kehilangan env Supabase dan menyala
dengan `ALLOW_DEMO_IN_PRODUCTION` tetap menjawab 200.

### `POST /api/cron/dispatch-deadline-notifications?limit=100` (ADR-051)

`Authorization: Bearer <CRON_SECRET>` (≥32 karakter; kosong = selalu 401).
Mengklaim ≤`limit` (1..500) pengingat `DEADLINE_H3`/`DEADLINE_H1` yang belum
terkirim, kegiatannya masih APPROVED & belum tutup. Respons:

```jsonc
{
  "claimedAt": "…", "leaseSeconds": 900,
  "ackUrl": "https://…/api/cron/dispatch-deadline-notifications/ack",
  "count": 1,
  "dispatches": [{
    "notificationId": "uuid", "type": "DEADLINE_H1",
    "message": "Terakhir — pendaftaran … ditutup besok.", "createdAt": "…",
    "recipient": { "userId": "uuid", "email": "…", "fullName": "…" },
    "event": { "id": "uuid", "slug": "…", "title": "…", "organizer": "…",
               "deadlineAt": "…", "daysLeft": 1, "url": "https://…/events/…" }
  }]
}
```

`GET` → `405` (`Allow: POST`): mengambil antrean MENGUBAH state.

### `POST /api/cron/dispatch-deadline-notifications/ack`

Body `{ "notificationIds": ["…"] }` (1..500). Respons `{ "acknowledged": n }`
— hanya baris yang sedang diklaim dan belum terkirim yang dihitung. Yang
tidak di-ack sebelum sewa habis akan diklaim ulang (at-least-once).

## 3. Kontrak error

`src/lib/errors.ts`. Bentuk yang **selalu** dikirim ke klien:

```ts
interface ApiErrorBody {
  error: string;   // pesan manusiawi, aman ditampilkan
  code: ErrorCode; // 'VALIDATION_FAILED' | 'NOT_FOUND' | 'UNAUTHORIZED' |
                   // 'FORBIDDEN' | 'RATE_LIMITED' | 'UPSTREAM_FAILURE' | 'INTERNAL'
}
```

- Lempar `AppError` (via helper `notFound()`, `validationFailed()`,
  `unauthorized()`, `forbidden()`, atau constructor langsung untuk kode lain)
  di manapun perlu menolak sebuah request dengan alasan spesifik.
- Tangkap di boundary terluar dengan `toApiError(error)` — error tak dikenal
  **selalu** dilaporkan sebagai `INTERNAL` generik ke klien; detail asli
  masuk `console.error('[unhandled]', error)`, tidak pernah ke response.
- Jangan biarkan pesan driver Postgres/Supabase mentah sampai ke UI —
  `SupabaseEventRepository` sudah membungkus tiap error jadi
  `AppError(ERROR_CODES.UPSTREAM_FAILURE, ...)` dengan pesan Indonesia yang
  generik.

## 4. Kontrak query string `/events`

`src/lib/search-params.ts`. URL adalah input dari pihak tidak dipercaya —
aturannya: **nilai tidak dikenal dibuang, tidak pernah error 500**.

| Param URL | Field | Aturan parsing |
|---|---|---|
| `q` | search | trim, rapikan spasi, potong 120 char |
| `type` (bisa berulang / CSV) | types | hanya nilai yang ada di `EVENT_TYPES`, dedup |
| `kategori` (bisa berulang / CSV) | categories | regex `^[a-z0-9-]{1,50}$`, maks 12 |
| `jenjang` (bisa berulang / CSV) | levels | hanya nilai yang ada di `EDUCATION_LEVELS` |
| `sort` | sort | fallback `'relevance'` kalau tidak dikenal |
| `tampilkan=semua` | includeClosed | boolean literal |
| `biaya=gratis\|berbayar` | cost | `free`/`paid`; nilai lain (termasuk `constructor`, `__proto__`) dibuang — `Object.hasOwn` |
| `page` | page | integer positif, fallback 1 |

`buildEventHref()` membangun URL kanonik balik dari `ParsedEventQuery` —
dipakai filter, pagination, dan `sitemap.ts`. `toggleFilterHref()` toggle
satu nilai dan reset `page` ke 1 (hasil berubah).

## 5. Sesi & otorisasi — `src/lib/auth.ts`

```ts
interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  educationLevel: EducationLevel | null;
  major: string | null;
  interests: readonly string[];
  providers: readonly string[];   // 'email', 'google', …
}

getSessionUser(): Promise<AuthUser | null>   // dibungkus React cache() — dedupe per request
isProfileComplete(user): boolean             // jenjang terisi DAN minimal satu minat
requireUser(returnTo): Promise<AuthUser>     // atau redirect ke loginHref(returnTo)
checkAdminAccess(): Promise<AdminGate>
```

`getSessionUser()` memakai `supabase.auth.getUser()` — **bukan**
`getSession()`. `getSession()` hanya membaca cookie kiriman klien dan
mempercayainya; untuk keputusan otorisasi hanya verifikasi ke server auth
yang boleh jadi dasar. Di `dataMode === 'seed'` ia mengembalikan `null`
tanpa menyentuh cookie sama sekali.

Kalau baris profil di tabel `users` absen (mis. trigger melewatinya karena
bentrok email), sesi tetap dianggap sah dan nama diambil dari metadata auth —
bukan melempar error dan mengunci orang dari akunnya sendiri.

```ts
type AdminGate =
  | { allowed: true; reason: 'demo' | 'admin'; userId: string | null }
  | { allowed: false; reason: 'unauthenticated' | 'not-admin' };
```

`reason: 'demo'` **hanya** saat `dataMode === 'seed'` (tidak ada backend
sungguhan untuk dirusak). Dengan Supabase terpasang, gerbangnya berlaku
penuh: sesi + `users.role === 'ADMIN'`. Lihat `DECISION.md` ADR-008.

## 6. Kontrak redirect — `src/lib/safe-redirect.ts`

```ts
safeNextPath(input: string | string[] | null | undefined, fallback = '/'): string
loginHref(next?: string | string[] | null): string
```

`?next=` datang dari URL, artinya dari pihak yang tidak dipercaya. Setiap
pemakaiannya — di halaman, Server Action, maupun route handler — **wajib**
melewati `safeNextPath()`. Yang ditolak dan dikembalikan ke `fallback`:
URL absolut, protocol-relative (`//host`), `/\host`, skema yang diselipkan
(`://`), karakter `\r`/`\n`/`\t` (response splitting), dan nilai di atas
512 karakter.

## 7. Rute callback — `GET /auth/callback`

Titik pendaratan OAuth Google, konfirmasi email, dan tautan setel ulang
kata sandi. Menerima dua format karena Supabase mengirim keduanya
tergantung template email project:

| Query | Aksi |
|---|---|
| `?code=…` | `exchangeCodeForSession(code)` — alur PKCE & OAuth |
| `?token_hash=…&type=…` | `verifyOtp({ type, token_hash })`; `type` divalidasi terhadap daftar tertutup |
| `?error=…` | pengguna membatalkan di layar consent → kembali ke `/login` tanpa pesan error |

Redirect tujuan dibangun dari `NEXT_PUBLIC_SITE_URL` + `next` yang sudah
lolos `safeNextPath()`, jadi basisnya tidak bisa ditimpa penyerang.

## 8. Kontrak pipeline Python (LLM → DB)

`pipeline/studentfo_pipeline/models.py`. Ini "API" antara keluaran Gemini
dan tabel `events`.

**Input yang diminta dari LLM** (`ExtractedEvent`, dipaksa lewat JSON schema
di `extractor.build_response_schema`): `title`, `organizer`, `description`,
`event_type` (enum), `registration_link` (URL), `education_levels` (enum[]),
`categories` (enum diambil live dari tabel `categories`), `location`,
`is_online`, `deadlines[]` (`label` enum, `deadline_at` ISO 8601, `is_primary`).

**Validasi yang dijalankan sebelum data boleh masuk `events`** (bukan
sekadar bentuk JSON — kewarasan isinya):
- Tepat satu `is_primary=true` di antara deadlines (kalau tidak ada,
  deadline paling awal otomatis dijadikan primary).
- Primary deadline tidak boleh sudah lewat.
- Primary deadline tidak boleh lebih dari 3 tahun ke depan (indikasi salah
  parsing tahun, mis. "2062" alih-alih "2026").
- Tanggal tanpa timezone diasumsikan WIB (`UTC+7`).

**Output ke Supabase** (`ValidatedEvent` via `publisher.publish()`): selalu
`status: 'PENDING'`. `dedup_hash` dihitung dengan
`compute_dedup_hash(title, organizer)` — implementasi Python ini **harus
identik** dengan `public.compute_dedup_hash()` SQL (lihat `SCHEMA.md`).
Duplikat (hash sudah ada di tabel, atau muncul dua kali dalam satu batch)
dilewati, dihitung terpisah dari kegagalan.

Satu event gagal ditulis (exception di tengah insert deadlines/categories)
**tidak menghentikan batch** — dicatat sebagai `failed`, baris event yang
mungkin sudah masuk tanpa deadline tetap tampil di antrean moderasi dan akan
ditolak manusia (bukan silent data corruption).
