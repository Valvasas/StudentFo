import type {
  AppNotification,
  Category,
  EventDetail,
  EventQuery,
  EventStatus,
  EventSummary,
  Paginated,
  Team,
  TrackerItem,
  TrackerStatus,
} from '@/types/domain';

/**
 * Kontrak akses data. Seluruh UI berbicara HANYA lewat antarmuka ini —
 * tidak ada satu pun komponen yang mengimpor supabase-js secara langsung.
 *
 * Keuntungan konkretnya, bukan kemurnian arsitektur:
 *  - Aplikasi jalan penuh tanpa kredensial apa pun (implementasi seed).
 *  - Mengganti Postgres FTS ke Meilisearch (§2) = tulis satu implementasi
 *    baru, nol perubahan di komponen.
 *  - Logika query bisa diuji tanpa menyalakan database.
 */
export interface EventRepository {
  listEvents(query: EventQuery): Promise<Paginated<EventSummary>>;
  getEventBySlug(slug: string): Promise<EventDetail | null>;
  /** Kartu "Sorotan Minggu Ini": tenggat terdekat yang masih terbuka. */
  listClosingSoon(limit: number): Promise<readonly EventSummary[]>;
  listCategories(): Promise<readonly Category[]>;
  getStats(): Promise<RepositoryStats>;

  /** Antrean moderasi (§7 langkah 7). Hanya dipanggil dari rute admin. */
  listByStatus(status: EventStatus, limit: number): Promise<readonly EventSummary[]>;
  reviewEvent(input: ReviewEventInput): Promise<void>;

  /** Saved events — simpan/batal simpan kegiatan per pengguna (Phase 2) */
  isEventSaved(userId: string, eventId: string): Promise<boolean>;
  listSavedEventIds(userId: string): Promise<readonly string[]>;
  saveEvent(userId: string, eventId: string): Promise<void>;
  unsaveEvent(userId: string, eventId: string): Promise<void>;
  listSavedEvents(userId: string): Promise<readonly EventSummary[]>;

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

  /** Application tracker — lacak tahapan lamaran (Phase 2) */
  listTrackerItems(userId: string): Promise<readonly TrackerItem[]>;
  upsertTrackerItem(
    userId: string,
    eventId: string,
    status: TrackerStatus,
    notes?: string | null,
  ): Promise<void>;
  removeTrackerItem(userId: string, eventId: string): Promise<void>;
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
  readonly reason?: string;
}

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
