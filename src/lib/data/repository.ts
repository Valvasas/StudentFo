import type {
  AppNotification,
  BlockedPerson,
  Category,
  ConnectionCounts,
  ConnectionPage,
  DeadlineDay,
  DeadlineDispatch,
  EducationLevel,
  EventAnalytics,
  EventClaim,
  EventDetail,
  EventQuery,
  EventRevision,
  EventRevisionChanges,
  EventStatus,
  EventSummary,
  ManagedEvent,
  ModerationLogEntry,
  OrganizerProfile,
  OrganizerStatus,
  TrustRequestStatus,
  NetworkEventRef,
  NetworkProfile,
  OrganizerHistoryEntry,
  Paginated,
  PeopleSuggestion,
  PublicProfile,
  Registration,
  RegistrationForm,
  RegistrationFormStatus,
  RegistrationSeats,
  RegistrationStats,
  Submission,
  SubmissionPayload,
  Team,
  TeamLink,
  TrackerItem,
  TrackerStatus,
} from '@/types/domain';
import type { ConnectionPageRequest, NetworkProfileInput, NetworkViewer } from '@/lib/network';
import type { OrganizerApplicationInput } from '@/lib/organizer';
import type { PortfolioInput } from '@/lib/portfolio';
import type { RegistrationDecision, RegistrationFormInput, RegistrationSubmission } from '@/lib/registration';
import type { EventPresentationInput } from '@/lib/event-presentation';
import type { CalibrationEvent, CalibrationSignal } from '@/lib/recommendation-calibration';

/**
 * Kontrak akses data. Seluruh UI berbicara HANYA lewat antarmuka ini —
 * tidak ada satu pun komponen yang mengimpor supabase-js secara langsung.
 *
 * Keuntungan konkretnya, bukan kemurnian arsitektur:
 *  - Aplikasi jalan penuh tanpa kredensial apa pun (implementasi seed).
 *  - Mengganti Postgres FTS ke Meilisearch (§2) = tulis satu implementasi
 *    baru, nol perubahan di komponen.
 *  - Logika query bisa diuji tanpa menyalakan database.
 *
 * Dipecah per domain supaya kode baru bisa bergantung hanya pada bagian
 * yang dipakainya (mis. `SubmissionRepository` untuk alur /submit). Kedua
 * implementasi tetap satu kelas yang memenuhi `EventRepository` penuh —
 * pemecahan ini tidak mengubah perilaku apa pun.
 */
export interface EventRepository
  extends EventCatalogRepository,
    ModerationRepository,
    SubmissionRepository,
    SavedEventRepository,
    TrackerRepository,
    PortfolioRepository,
    NotificationRepository,
    TeamRepository,
    NetworkRepository,
    OrganizerRepository,
    RegistrationRepository,
    RateLimitRepository,
    RecommendationSignalRepository,
    EventPresentationRepository,
    NotificationDispatchRepository {}

/** Katalog publik: listing, detail, statistik beranda. */
export interface EventCatalogRepository {
  listEvents(query: EventQuery): Promise<Paginated<EventSummary>>;
  getEventBySlug(slug: string): Promise<EventDetail | null>;
  /** Kartu "Sorotan Minggu Ini": tenggat terdekat yang masih terbuka. */
  listClosingSoon(limit: number): Promise<readonly EventSummary[]>;
  listCategories(): Promise<readonly Category[]>;
  getStats(): Promise<RepositoryStats>;
  /** Pita "Minggu ini": 7 hari kalender WIB mulai hari ini, jumlah tenggat event tayang per hari. */
  getDeadlineWeek(): Promise<readonly DeadlineDay[]>;
}

/** Moderasi event hasil scraping + riwayat keputusan. Hanya rute admin. */
export interface ModerationRepository {
  /**
   * Antrean moderasi (§7 langkah 7). Hanya dipanggil dari rute admin.
   * Bentuk DETAIL, bukan ringkasan: moderator harus bisa mencocokkan hasil
   * ekstraksi dengan `sourceUrl` dan `registrationLink` aslinya.
   */
  listByStatus(status: EventStatus, limit: number): Promise<readonly EventDetail[]>;
  reviewEvent(input: ReviewEventInput): Promise<void>;

  /**
   * Riwayat keputusan moderasi, terbaru di atas. Di produksi diisi TRIGGER
   * (bukan oleh method review di atas), jadi perubahan dari jalur mana pun —
   * job expiry, SQL editor — ikut tercatat. Hanya untuk rute admin.
   */
  listModerationLog(limit: number): Promise<readonly ModerationLogEntry[]>;

  /**
   * Jalan balik keputusan "Tolak": kegiatan/kiriman kembali PENDING di
   * antrean. Perubahan status tercatat di log seperti keputusan lain.
   * Bukan REJECTED lagi → `moderation_not_rejected`.
   */
  restoreRejected(input: RestoreRejectedInput): Promise<void>;
}

export interface RestoreRejectedInput {
  readonly subjectType: 'event' | 'submission';
  readonly subjectId: string;
  readonly reviewerId: string | null;
  /** Hanya dipakai mode seed (log moderasi); produksi membaca nama dari `users`. */
  readonly reviewerName?: string;
}

/**
 * Portofolio & profil publik (ADR-046). Portofolio = baris tracker APPLIED+;
 * method di sini hanya mengisi hasil/visibilitasnya dan membacanya untuk
 * orang lain dengan aturan kelihatan yang sama dengan jaringan.
 */
export interface PortfolioRepository {
  /** Hasil, catatan, bukti, visibilitas. Hanya entri sendiri berstatus APPLIED+ (`portfolio_not_eligible`). */
  updatePortfolioEntry(userId: string, eventId: string, input: PortfolioInput): Promise<void>;
  /**
   * Profil + portofolio publik yang boleh dilihat pembaca: bisa ditemukan
   * ATAU punya koneksi/ajakan dengannya, dan tidak saling memblokir.
   * `null` = tidak boleh dilihat ATAU tidak ada — sengaja tidak dibedakan.
   */
  getPublicProfile(viewerId: string, userId: string): Promise<PublicProfile | null>;
}

/** Kiriman komunitas (/submit) dan peninjauannya. */
export interface SubmissionRepository {
  /**
   * Kiriman komunitas (Phase 3). `createSubmission` boleh dipanggil tamu —
   * RLS `ugc_public_insert` memang mengizinkannya. Dua method lainnya hanya
   * dipanggil dari rute admin SETELAH `checkAdminAccess()` lolos.
   */
  createSubmission(input: CreateSubmissionInput): Promise<void>;
  listSubmissions(status: EventStatus, limit: number): Promise<readonly Submission[]>;
  /**
   * Kiriman milik satu akun, terbaru dulu — supaya pengirim tahu nasib
   * kirimannya tanpa menunggu notifikasi. `userId` WAJIB dari sesi server
   * (`getSessionUser`), tidak pernah dari input form/URL.
   */
  listMySubmissions(userId: string, limit: number): Promise<readonly Submission[]>;
  /** Setujui = salin ke `events` berstatus APPROVED (atomik); tolak = tandai REJECTED. */
  reviewSubmission(input: ReviewSubmissionInput): Promise<void>;
}

/** Simpanan per pengguna. */
export interface SavedEventRepository {
  /** Saved events — simpan/batal simpan kegiatan per pengguna (Phase 2) */
  isEventSaved(userId: string, eventId: string): Promise<boolean>;
  listSavedEventIds(userId: string): Promise<readonly string[]>;
  saveEvent(userId: string, eventId: string): Promise<void>;
  unsaveEvent(userId: string, eventId: string): Promise<void>;
  listSavedEvents(userId: string): Promise<readonly EventSummary[]>;
}

/** Papan tracker lamaran per pengguna. */
export interface TrackerRepository {
  /** Application tracker — lacak tahapan lamaran (Phase 2) */
  listTrackerItems(userId: string): Promise<readonly TrackerItem[]>;
  upsertTrackerItem(
    userId: string,
    eventId: string,
    status: TrackerStatus,
    notes?: string | null,
  ): Promise<void>;
  /**
   * Masukkan event ke tracker berstatus SAVED HANYA kalau belum dilacak.
   * Dipakai tombol "Simpan": memakai `upsertTrackerItem` di sana menimpa
   * tahapan yang sudah maju (mis. WAWANCARA) kembali ke SAVED setiap kali
   * pengguna menyimpan ulang kegiatan yang sama.
   */
  addTrackerItemIfAbsent(userId: string, eventId: string): Promise<void>;
  removeTrackerItem(userId: string, eventId: string): Promise<void>;
}

/** Lonceng notifikasi per pengguna. */
export interface NotificationRepository {
  /**
   * Notifikasi tenggat & sistem (Phase 2).
   *
   * Produksi notifikasi tenggat BUKAN tanggung jawab antarmuka ini — di
   * Supabase ia dikerjakan fungsi Postgres terjadwal, di implementasi
   * memory ia diturunkan dari event yang disimpan/dilacak. Yang dijanjikan
   * kontrak ini hanya: membaca, menghitung yang belum dibaca, menandai
   * sudah dibaca.
   */
  listNotifications(userId: string, limit: number): Promise<readonly AppNotification[]>;
  countUnreadNotifications(userId: string): Promise<number>;
  markNotificationAsRead(userId: string, notificationId: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
}

/** Tim lomba. */
export interface TeamRepository {
  /**
   * Tim lomba (Phase 3).
   *
   * `actorId` diteruskan eksplisit ke setiap operasi tulis dan diperiksa DI
   * DALAM implementasi, bukan diasumsikan sudah dicek oleh pemanggil. Di
   * Supabase, RLS adalah penjaga terakhirnya; di implementasi memory tidak
   * ada RLS sama sekali, jadi tanpa pemeriksaan di sini mode seed akan
   * mengizinkan hal yang produksi tolak — dan bug itu baru ketahuan saat
   * deploy.
   */
  listTeams(eventId?: string): Promise<readonly Team[]>;
  getTeamById(teamId: string): Promise<Team | null>;
  createTeam(input: CreateTeamRepositoryInput): Promise<string>;
  joinTeam(actorId: string, actorName: string, teamId: string): Promise<void>;
  leaveTeam(actorId: string, teamId: string): Promise<void>;
  /** Hanya ketua tim yang boleh mengeluarkan anggota. */
  removeTeamMember(actorId: string, teamId: string, memberId: string): Promise<void>;
  /** Hanya ketua tim yang boleh membubarkan timnya. */
  deleteTeam(actorId: string, teamId: string): Promise<void>;
}

/**
 * Koneksi antar pengguna (ADR-040).
 *
 * Seperti `TeamRepository`, pelaku (`actor`/`actorId`) diteruskan eksplisit
 * dan otorisasinya diperiksa DI DALAM implementasi. `NetworkViewer` dibawa
 * utuh (bukan hanya id) karena mode seed tidak punya tabel `users`: nama dan
 * profil pelaku harus dicatat saat ia bertindak supaya pihak lain bisa
 * melihatnya. Implementasi Supabase membaca profil dari database dan
 * mengabaikan salinan ini.
 */
export interface NetworkRepository {
  getNetworkProfile(userId: string): Promise<NetworkProfile>;
  updateNetworkProfile(actor: NetworkViewer, input: NetworkProfileInput): Promise<void>;
  /**
   * Koneksi pembaca (diterima, masuk, terkirim) per halaman, urut
   * `compareConnections()`: ajakan menunggu dulu, lalu terbaru. `limit`
   * dipotong ke `CONNECTION_PAGE.maxLimit`; kursor tidak valid → `invalid_request`.
   */
  listConnections(userId: string, page: ConnectionPageRequest): Promise<ConnectionPage>;
  /** Jumlah per kelompok — angka di halaman tidak boleh bergantung pada halaman yang sedang dimuat. */
  countConnections(userId: string): Promise<ConnectionCounts>;
  /**
   * Orang yang BISA ditemukan (opt-in), belum punya hubungan apa pun dengan
   * pembaca, dan tidak memblokir/diblokir pembaca — sudah diperingkat
   * `rankSuggestions()`.
   */
  suggestPeople(viewer: NetworkViewer, filter: PeopleFilter): Promise<readonly PeopleSuggestion[]>;
  /**
   * Kirim ajakan. Kalau target ternyata sudah lebih dulu mengajak pembaca,
   * ajakan itu yang diterima (`'accepted'`) — dua orang yang sama-sama mau
   * terhubung tidak perlu saling menunggu.
   */
  requestConnection(actor: NetworkViewer, targetId: string, message: string | null): Promise<'requested' | 'accepted'>;
  /** Hanya pihak yang diajak. Menolak = menghapus ajakan. */
  respondToConnection(actorId: string, connectionId: string, decision: 'accept' | 'decline'): Promise<void>;
  /** Membatalkan ajakan terkirim atau memutus koneksi — kedua pihak boleh. */
  removeConnection(actorId: string, connectionId: string): Promise<void>;
  /**
   * Blokir (ADR-041): menghapus koneksi/ajakan di antara keduanya, dan sejak
   * itu tidak ada pihak yang bisa mengajak atau menemukan yang lain. Yang
   * diblokir tidak diberi tahu. Target harus pernah terlihat oleh pelaku
   * (bisa ditemukan, atau punya koneksi/ajakan dengannya). Idempoten.
   */
  blockPerson(actorId: string, targetId: string): Promise<void>;
  unblockPerson(actorId: string, targetId: string): Promise<void>;
  /** Orang yang diblokir pembaca, terbaru dulu (maks. `BLOCK_LIST_LIMIT`). */
  listBlockedPeople(userId: string): Promise<readonly BlockedPerson[]>;
  /** Keanggotaan tim orang-orang ini (maks. `limit` baris) — simpul "kegiatan" di peta. */
  listTeamLinks(userIds: readonly string[], limit: number): Promise<readonly TeamLink[]>;
}

export interface PeopleFilter {
  readonly search: string;
  /** Slug kategori; null = semua. */
  readonly interest: string | null;
  readonly limit: number;
  /** Kegiatan yang disimpan/dilacak pembaca — sumber alasan "ikut tim di …". */
  readonly viewerEvents: readonly NetworkEventRef[];
}

/**
 * Penyelenggara terverifikasi, klaim, permintaan perubahan, analitik
 * (ADR-042/043).
 *
 * Kepercayaan di atas kecepatan: status penyelenggara, hak kelola, dan
 * setiap perubahan acara hanya lahir dari keputusan ADMIN (method `review*`,
 * dipanggil Server Action SETELAH `checkAdminAccess()`). Hak kelola berlaku
 * hanya selama status VERIFIED — implementasi memeriksanya di setiap
 * operasi, tidak mengandalkan pemanggil.
 */
export interface OrganizerRepository {
  getOrganizerProfile(userId: string): Promise<OrganizerProfile | null>;
  /** Ajukan / perbarui. Mengubah data setelah terverifikasi = kembali ke antrean. REVOKED ditolak. */
  applyAsOrganizer(actor: OrganizerActor, input: OrganizerApplicationInput): Promise<void>;
  /** Acara yang dikelola — kosong bila tidak (lagi) terverifikasi. */
  listManagedEvents(userId: string): Promise<readonly ManagedEvent[]>;
  claimEvent(actorId: string, eventId: string, evidence: string): Promise<void>;
  listMyClaims(userId: string): Promise<readonly EventClaim[]>;
  proposeEventRevision(actorId: string, eventId: string, changes: EventRevisionChanges, note: string | null): Promise<void>;
  listEventRevisions(actorId: string, eventId: string): Promise<readonly EventRevision[]>;
  /** Hanya pengelola terverifikasi acara itu (atau admin) — selain itu `analytics_forbidden`. */
  getEventAnalytics(actorId: string, eventId: string, days: number): Promise<EventAnalytics>;
  /** Server saja, setelah filter bot & batas laju. `visitorHash` = HMAC harian (64 hex). */
  recordEventView(eventId: string, visitorHash: string): Promise<void>;
  /** Acara kelolaan yang sudah tutup + angka seumur acara — kosong bila tidak (lagi) terverifikasi. */
  listOrganizerHistory(userId: string): Promise<readonly OrganizerHistoryEntry[]>;
  /** Lencana publik "dikelola penyelenggara terverifikasi". */
  listVerifiedOrganizers(eventIds: readonly string[]): Promise<ReadonlyMap<string, string>>;

  // Antrean & keputusan admin
  listOrganizerApplications(status: OrganizerStatus, limit: number): Promise<readonly OrganizerProfile[]>;
  reviewOrganizer(input: ReviewTrustInput<'VERIFIED' | 'REJECTED' | 'REVOKED'> & { userId: string }): Promise<void>;
  listClaims(status: TrustRequestStatus, limit: number): Promise<readonly EventClaim[]>;
  reviewClaim(input: ReviewTrustInput<'APPROVED' | 'REJECTED'> & { claimId: string }): Promise<void>;
  listRevisions(status: TrustRequestStatus, limit: number): Promise<readonly EventRevision[]>;
  reviewRevision(input: ReviewTrustInput<'APPROVED' | 'REJECTED'> & { revisionId: string }): Promise<void>;
  /** Status penyelenggara para pengirim — lencana "terverifikasi" di antrean kiriman. */
  listOrganizerStatuses(userIds: readonly string[]): Promise<ReadonlyMap<string, Pick<OrganizerProfile, 'orgName' | 'status'>>>;
}

/**
 * Pendaftaran langsung di StudentFo (ADR-055). Penyelenggara terverifikasi
 * yang mengelola acara (`manages_event`) membuka formulir; peserta mendaftar
 * di dalam aplikasi. Kuota, daftar tunggu FIFO, dan transisi status
 * mengikuti `lib/registration.ts` — di Supabase ditegakkan ulang oleh RPC
 * yang mengunci baris formulir, jadi dua pendaftar terakhir tidak pernah
 * sama-sama mendapat kursi terakhir.
 */
export interface RegistrationRepository {
  /** Formulir yang boleh dilihat publik (OPEN/CLOSED). DRAFT = `null`. */
  getRegistrationForm(eventId: string): Promise<RegistrationForm | null>;
  /** Hitungan kursi tanpa data orang — boleh dibaca siapa pun. */
  getRegistrationSeats(eventId: string): Promise<RegistrationSeats>;
  /** Dari daftar id, acara yang formulirnya sedang OPEN (lencana "Daftar di StudentFo"). */
  listOpenRegistrationEventIds(eventIds: readonly string[]): Promise<ReadonlySet<string>>;
  getMyRegistration(userId: string, eventId: string): Promise<Registration | null>;
  submitRegistration(actor: RegistrationActor, eventId: string, input: RegistrationSubmission): Promise<Registration>;
  cancelRegistration(userId: string, eventId: string): Promise<void>;

  // Studio penyelenggara — setiap metode memeriksa hak kelola sendiri.
  getManagedRegistrationForm(actorId: string, eventId: string): Promise<RegistrationForm | null>;
  saveRegistrationForm(actorId: string, eventId: string, input: RegistrationFormInput): Promise<void>;
  setRegistrationFormStatus(actorId: string, eventId: string, status: Exclude<RegistrationFormStatus, 'DRAFT'>): Promise<void>;
  /** Terbaru dulu, maksimal `REGISTRATION_LIMITS.listMax`. */
  listRegistrations(actorId: string, eventId: string): Promise<readonly Registration[]>;
  decideRegistration(actorId: string, registrationId: string, decision: RegistrationDecision, note: string | null): Promise<void>;
  getRegistrationStats(actorId: string, eventId: string, days: number): Promise<RegistrationStats>;
  /** Ringkasan per acara kelolaan untuk kartu studio. Acara tanpa formulir tidak ada di peta. */
  listRegistrationSummaries(actorId: string, eventIds: readonly string[]): Promise<ReadonlyMap<string, RegistrationSummary>>;
}

export interface RegistrationSummary {
  readonly status: RegistrationFormStatus;
  readonly seats: RegistrationSeats;
  readonly pending: number;
}

/** Nama & email disalin ke pendaftaran saat mendaftar — yang dilihat penyelenggara adalah yang dikirim. */
export interface RegistrationActor {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
}

/** Mode seed tidak punya tabel `users`; nama pelaku dicatat saat ia bertindak (pola NetworkViewer). */
export interface OrganizerActor {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
}

export interface ReviewTrustInput<D extends string> {
  readonly decision: D;
  readonly reviewerId: string | null;
  /** Hanya dipakai mode seed (log moderasi); produksi membaca nama dari `users`. */
  readonly reviewerName?: string;
  readonly note: string | null;
}

/**
 * Lencana otoritas penyelenggara & promosi berbayar untuk acara tayang
 * (ADR-049). Admin saja: method tulis dipanggil Server Action SETELAH
 * `checkAdminAccess()`, dan implementasi tidak memeriksa peran lagi (sama
 * dengan `reviewEvent`). Perubahan ini TIDAK tercatat di `moderation_log`
 * (trigger hanya mencatat perubahan status) — lihat TASKS.md.
 */
export interface EventPresentationRepository {
  /** Hanya acara APPROVED — selain itu `event_unavailable`. */
  updateEventPresentation(input: EventPresentationInput): Promise<void>;
  /** Acara yang dijadwalkan promosi (aktif maupun sudah lewat), akhir promosi terbaru dulu. */
  listFeaturedEvents(limit: number): Promise<readonly EventSummary[]>;
}

/**
 * Antrean pengingat tenggat ke kanal luar (bot WhatsApp/Telegram, email) —
 * ADR-051. Semantik at-least-once: `claim` menyewakan baris selama
 * `DISPATCH_LEASE_SECONDS`; yang tidak di-`acknowledge` sebelum sewa habis
 * dibagikan lagi. Hanya untuk route cron ber-`CRON_SECRET`, tidak pernah UI.
 */
export interface NotificationDispatchRepository {
  claimDeadlineDispatches(limit: number): Promise<readonly DeadlineDispatch[]>;
  /** Mengembalikan jumlah yang benar-benar ditandai terkirim (id asing/belum diklaim diabaikan). */
  acknowledgeDeadlineDispatches(notificationIds: readonly string[]): Promise<number>;
}

/** Sewa klaim dispatch — cermin default `p_lease_seconds` di migration 20261003100003. */
export const DISPATCH_LEASE_SECONDS = 900;
/** Batas satu klaim — cermin `LEAST(..., 500)` di SQL. */
export const DISPATCH_MAX_BATCH = 500;

/** Penghitung pembatas laju (ADR-028). */
export interface RateLimitRepository {
  /**
   * Catat satu percobaan di ember pembatas laju. `true` = diizinkan.
   * `bucket` sudah di-HMAC oleh pemanggil (`rateLimitBucket()`), jadi
   * implementasi tidak pernah melihat IP atau email mentah.
   */
  consumeRateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>;
}

/** Sinyal & data kalibrasi rekomendasi (ADR-032). */
export interface RecommendationSignalRepository {
  /**
   * Catat sinyal niat untuk kalibrasi bobot rekomendasi (ADR-032). Hanya
   * dipanggil server; profil disalin saat itu karena profil bisa berubah.
   */
  recordRecommendationSignal(input: RecommendationSignalInput): Promise<void>;
  /** Bahan `calibrate()`: sinyal sejak `since` + semua event yang pernah tayang. Admin saja. */
  listCalibrationData(since: Date): Promise<CalibrationData>;
}


export interface CalibrationData {
  readonly signals: readonly CalibrationSignal[];
  readonly events: readonly CalibrationEvent[];
}

export interface RecommendationSignalInput {
  readonly eventId: string;
  readonly kind: 'save' | 'register_click';
  readonly userId: string | null;
  readonly interests: readonly string[];
  readonly educationLevel: EducationLevel | null;
}

export interface CreateSubmissionInput {
  readonly submittedByEmail: string;
  /** Akun yang sedang masuk saat mengirim (dikabari saat ditinjau); null = tamu. */
  readonly submittedBy: string | null;
  readonly payload: SubmissionPayload;
}

export interface ReviewSubmissionInput {
  readonly submissionId: string;
  readonly decision: Extract<EventStatus, 'APPROVED' | 'REJECTED'>;
  readonly reviewerId: string | null;
  /** Hanya dipakai mode seed (log moderasi); produksi membaca nama dari `users`. */
  readonly reviewerName?: string;
}

export interface RepositoryStats {
  readonly totalActive: number;
  readonly closingThisWeek: number;
  readonly addedThisWeek: number;
  readonly organizerCount: number;
}

export interface CreateTeamRepositoryInput {
  readonly eventId: string;
  readonly title: string;
  readonly description: string | null;
  readonly slotsNeeded: number;
  readonly createdBy: string;
  /** Nama pembuat, dipakai untuk menampilkan daftar anggota di mode seed. */
  readonly createdByName: string;
}

export interface ReviewEventInput {
  readonly eventId: string;
  readonly decision: Extract<EventStatus, 'APPROVED' | 'REJECTED'>;
  readonly reviewerId: string | null;
  /** Hanya dipakai mode seed (log moderasi); produksi membaca nama dari `users`. */
  readonly reviewerName?: string;
  readonly reason?: string;
}

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
