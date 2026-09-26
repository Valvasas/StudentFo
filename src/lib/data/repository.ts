import type {
  AppNotification,
  Category,
  DeadlineDay,
  EducationLevel,
  EventDetail,
  EventQuery,
  EventStatus,
  EventSummary,
  ModerationLogEntry,
  Paginated,
  Submission,
  SubmissionPayload,
  Team,
  TrackerItem,
  TrackerStatus,
} from '@/types/domain';
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
    NotificationRepository,
    TeamRepository,
    RateLimitRepository,
    RecommendationSignalRepository {}

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
