import type {
  AdminUserSummary,
  AnswerValue,
  AppNotification,
  ContentReport,
  CronJobHealth,
  EventQuestion,
  ReportReason,
  ReportStatus,
  ReportSubject,
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
  EventPhoto,
  EventQuery,
  EventRegistration,
  EventRevision,
  EventRevisionChanges,
  EventStatus,
  EventSummary,
  LobbySummary,
  LobbyView,
  ManagedEvent,
  OutboundSurveyConfig,
  ProfileIdentity,
  ProfileMedia,
  OwnProfileMedia,
  BannerPreset,
  PublicProfileDetails,
  StudyPlaceInput,
  StudyProfile,
  OutboundSurveyRecord,
  ModerationLogEntry,
  NotificationPreferences,
  NotificationPreferencesInput,
  OrganizerProfile,
  OrganizerStatus,
  TrustRequestStatus,
  NetworkEventRef,
  NetworkProfile,
  OrganizerHistoryEntry,
  Paginated,
  PeopleSuggestion,
  PublicProfile,
  RegistrationForm,
  RegistrationStats,
  StoredFile,
  Submission,
  SubmissionPayload,
  Team,
  TeamLink,
  TrackerItem,
  TrackerStatus,
  TeamCandidate,
  TeamSeekerInput,
  TeamSeekerProfile,
} from '@/types/domain';
import type { ConnectionPageRequest, NetworkProfileInput, NetworkViewer } from '@/lib/network';
import type { OrganizerApplicationInput } from '@/lib/organizer';
import type { PortfolioInput } from '@/lib/portfolio';
import type { EventPresentationInput } from '@/lib/event-presentation';
import type { CalibrationEvent, CalibrationSignal } from '@/lib/recommendation-calibration';
import type { UploadedImage } from '@/lib/image-file';
import type { RegistrationFormInput, ReviewDecision } from '@/lib/registration-form';
import type { AchievementFacts } from '@/lib/achievements';
import type { LobbyMemberInput } from '@/lib/lobby';
import type { OutboundConfigInput, OutboundSurveyAnswers } from '@/lib/outbound-survey';
import type { ProfileIdentityInput } from '@/lib/profile-identity';
import type { ProfileMediaKind } from '@/lib/profile-media';

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
    RateLimitRepository,
    RecommendationSignalRepository,
    EventPresentationRepository,
    NotificationDispatchRepository,
    RegistrationRepository,
    GalleryRepository,
    MatchmakingRepository,
    TrustSafetyRepository,
    OperationsRepository,
    EmailReminderRepository,
    EventQuestionRepository,
    OutboundSurveyRepository,
    StudyProfileRepository,
    LobbyRepository,
    BadgeRepository,
    ProfileMediaRepository {}

/**
 * Foto profil & banner kartu profil (ADR-083). Siapa yang melihat = aturan
 * detail profil (`public_profile_details`): pemilik, pembaca yang boleh
 * membuka profilnya, atau sesama lobi tanpa blokir. Menulis hanya untuk akun
 * sendiri (`userId` dari sesi server), kecuali pencabutan oleh moderator.
 */
export interface ProfileMediaRepository {
  /** Milik sendiri; kolom belum ada (urutan deploy) → `available: false`. */
  getOwnProfileMedia(userId: string): Promise<OwnProfileMedia>;
  /** Maks. 100 orang. Tidak ada di peta = tidak boleh dilihat ATAU belum memasang apa pun. */
  listProfileMedia(viewerId: string, userIds: readonly string[]): Promise<ReadonlyMap<string, ProfileMedia>>;
  /**
   * Pasang/ganti foto atau banner unggahan. Gambar SUDAH diperiksa pemanggil
   * (`readImageUpload` + `exceedsProfileLimit`). Berkas lama dihapus.
   * `profile_media_rate_limited`, `profile_media_unavailable`.
   */
  setProfileImage(userId: string, kind: ProfileMediaKind, image: UploadedImage): Promise<void>;
  removeProfileImage(userId: string, kind: ProfileMediaKind): Promise<void>;
  /** `null` = kembali ke sampul bawaan. Tidak menyentuh banner unggahan. */
  setBannerPreset(userId: string, preset: BannerPreset | null): Promise<void>;
  /**
   * Berkas untuk `/media/profil/[id]`; null = tidak ada, tamu, atau tidak
   * boleh dilihat (404 yang sama). Admin boleh membuka berkas siapa pun
   * (moderasi). `viewer` hanya dipakai mode seed (tanpa RLS); produksi
   * memutuskan dari sesi di cookie lewat `profile_media_file()`.
   */
  getProfileMediaFile(viewer: ProfileMediaViewer | null, fileId: string): Promise<StoredFile | null>;
  /** Admin setelah `checkAdminAccess()`: cabut foto & banner unggahan (bukan preset); tercatat di riwayat. `profile_media_empty`. */
  clearProfileMediaAsAdmin(input: ClearProfileMediaInput): Promise<void>;
}

export interface ProfileMediaViewer {
  readonly id: string;
  readonly isAdmin: boolean;
}

export interface ClearProfileMediaInput {
  readonly userId: string;
  readonly actorId: string;
  readonly reason: string;
  /** Hanya mode seed (log moderasi). */
  readonly actorName?: string;
}

/**
 * Lencana di profil publik & lobi (ADR-072). Lencana tetap DIHITUNG
 * `evaluateBadges` di aplikasi; repository hanya menyerahkan fakta milik
 * orang yang MEMILIH menampilkannya dan yang boleh dilihat pembaca.
 */
export interface BadgeRepository {
  /** `adjustable: false` = kolom belum ada (migration 20261108100004 belum diterapkan): saklar terkunci, lencana privat. */
  getBadgeVisibility(userId: string): Promise<{ readonly show: boolean; readonly adjustable: boolean }>;
  setBadgeVisibility(userId: string, show: boolean): Promise<void>;
  /** Maks. 100 orang. Tidak ada di peta = lencananya tidak tampil untuk pembaca ini. Pemilik selalu melihat miliknya. */
  listPublicBadgeFacts(viewerId: string, userIds: readonly string[]): Promise<ReadonlyMap<string, AchievementFacts>>;
}

/** Tempat studi, domisili & bidang spesifik (ADR-075/076). */
export interface StudyProfileRepository {
  getStudyProfile(userId: string): Promise<StudyProfile>;
  /** Kolom belum ada = `actionError('study_profile_unavailable')`. Nilai sudah divalidasi pemanggil. */
  saveStudyPlace(userId: string, input: StudyPlaceInput): Promise<void>;
  /** Kolom belum ada = tidak menyimpan dan mengembalikan false — kategori minat tetap tersimpan. */
  saveStudyFields(userId: string, fields: readonly string[]): Promise<boolean>;
  /** Maks. 100 orang. Tidak ada di peta = pembaca tidak boleh melihatnya (aturan `public_profile_details`). */
  listPublicProfileDetails(viewerId: string, userIds: readonly string[]): Promise<ReadonlyMap<string, PublicProfileDetails>>;
  /** Username, bio, keterlihatan (ADR-077); kolom belum ada → `available: false`. */
  getProfileIdentity(userId: string): Promise<ProfileIdentity>;
  /** `username_taken` (unik), `invalid_profile_identity` (CHECK), `profile_identity_unavailable` (kolom belum ada). */
  saveProfileIdentity(userId: string, input: ProfileIdentityInput): Promise<void>;
  /** /u/[username] → id, HANYA bila pembaca boleh melihat profilnya; selain itu null (404 yang sama). */
  resolveUsername(viewerId: string, username: string): Promise<string | null>;
}

/** Pendataan kinerja sebelum keluar ke tautan pendaftaran (ADR-070/073). Tanpa identitas pengisi. */
export interface OutboundSurveyInput extends OutboundSurveyAnswers {
  readonly eventId: string;
  readonly signedIn: boolean;
  readonly skipped: boolean;
}

/** Batas baca dasbor kinerja — cukup untuk 90 hari di skala sekarang; di atasnya butuh agregat SQL. */
export const OUTBOUND_READ_LIMIT = 5000;

export interface OutboundSurveyRepository {
  /** Pertanyaan yang berlaku. Tabel belum ada (urutan deploy) = `DEFAULT_OUTBOUND_CONFIG`. */
  getOutboundSurveyConfig(): Promise<OutboundSurveyConfig>;
  /** Admin saja (diperiksa pemanggil). Tabel belum ada = `actionError('outbound_unavailable')`. */
  saveOutboundSurveyConfig(input: OutboundConfigInput, actorId: string): Promise<void>;
  /**
   * Hanya server, setelah saringan bot & batas laju. Pemanggil MENELAN galat:
   * pencatatan tidak boleh menahan orang di jalan menuju pendaftaran.
   */
  recordOutboundSurvey(input: OutboundSurveyInput): Promise<void>;
  /** Admin: kunjungan sejak `since`, terbaru dulu, berbatas. Tabel belum ada (urutan deploy) = []. */
  listOutboundSurveys(since: Date): Promise<readonly OutboundSurveyRecord[]>;
}

/**
 * Lobi lomba (ADR-071). Kelayakan = `lib/lobby.ts` di kedua implementasi,
 * dicerminkan `can_use_lobby()`/`lobby_is_open()` di SQL. Anggota lain hanya
 * terbaca oleh sesama anggota; blokir menyembunyikan dua arah.
 */
export interface LobbyRepository {
  /** Lomba yang lobinya bisa dimasuki pengguna + keanggotaannya + jumlah anggota (tanpa nama). */
  listMyLobbies(userId: string): Promise<readonly LobbySummary[]>;
  /** null = tidak berhak (belum mendaftar, bukan lomba, tidak tayang). */
  getLobby(viewer: NetworkViewer, eventId: string): Promise<LobbyView | null>;
  /** Bergabung atau memperbarui kartu lobi. Belum mendaftar → `lobby_forbidden`; ditutup → `lobby_closed`. */
  joinLobby(actor: NetworkViewer, eventId: string, input: LobbyMemberInput): Promise<void>;
  leaveLobby(actorId: string, eventId: string): Promise<void>;
  /**
   * Ajak koneksi (diterima) ikut lomba ini. 'invited' = ajakan baru (notifikasi
   * dikirim, satu per orang per lomba); 'already' = sudah pernah diajak pembaca.
   */
  inviteToLobby(actor: NetworkViewer, eventId: string, inviteeId: string): Promise<'invited' | 'already'>;
}

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
  /**
   * Untuk `/api/health`: melempar bila penyimpanan data tidak terjangkau.
   * Sengaja tidak lewat Data Cache — ping yang dijawab dari cache tetap
   * "sehat" selama 5 menit setelah database mati.
   */
  checkHealth(): Promise<void>;
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

/**
 * Keamanan & kepercayaan (ADR-061): laporan konten, penangguhan, hapus akun.
 * `reportContent` dipanggil pengguna yang masuk; sisanya hanya dari rute admin
 * SETELAH `checkAdminAccess()` — kecuali `deleteAccount` untuk akun sendiri
 * (`actorId === userId`).
 */
export interface TrustSafetyRepository {
  /** Satu laporan TERBUKA per (pelapor, subjek): mengulang tidak menambah baris. */
  reportContent(reporterId: string, input: ReportContentInput): Promise<void>;
  listOpenReports(limit: number): Promise<readonly ContentReport[]>;
  countOpenReports(): Promise<number>;
  resolveReport(input: ResolveReportInput): Promise<void>;
  /** Cari nama/email, atau id persis. Kosong = pengguna terbaru. */
  searchUsers(query: string, limit: number): Promise<readonly AdminUserSummary[]>;
  /** Admin & diri sendiri dilindungi (`user_protected`); menangguhkan wajib beralasan. */
  setUserSuspension(input: UserSuspensionInput): Promise<void>;
  /**
   * Hapus akun beserta datanya. Berkas Storage (bukti bayar) dihapus DULU;
   * gagal menghapus berkas = akun tidak dihapus, supaya tidak ada berkas yatim
   * yang tak bisa dilacak lagi pemiliknya.
   */
  deleteAccount(input: DeleteAccountInput): Promise<void>;
}

export interface ReportContentInput {
  readonly subjectType: ReportSubject;
  readonly subjectId: string;
  readonly reason: ReportReason;
  readonly details: string | null;
}

export interface ResolveReportInput {
  readonly reportId: string;
  readonly actorId: string;
  readonly outcome: Extract<ReportStatus, 'RESOLVED' | 'DISMISSED'>;
  readonly note: string | null;
  /** Hanya mode seed (log moderasi). */
  readonly actorName?: string;
}

export interface UserSuspensionInput {
  readonly userId: string;
  readonly actorId: string;
  readonly suspend: boolean;
  readonly reason: string | null;
  readonly actorName?: string;
}

export interface DeleteAccountInput {
  readonly userId: string;
  /** Sama dengan `userId` = hapus mandiri (tidak dicatat sebagai tindakan moderasi). */
  readonly actorId: string;
  readonly reason: string | null;
  readonly actorName?: string;
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
  /**
   * Saklar pengingat tenggat (ADR-067). Mematikannya menghentikan pengingat
   * BARU (fungsi terjadwal melewati akun ini); yang sudah ada di lonceng tetap.
   * Mode memory menurunkan pengingat saat dibaca, jadi di sana pengingat yang
   * belum dibaca ikut hilang — perbedaan yang diterima untuk data contoh.
   */
  getNotificationPreferences(userId: string): Promise<NotificationPreferences>;
  updateNotificationPreferences(userId: string, preferences: NotificationPreferencesInput): Promise<void>;
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

/**
 * Pencocokan tim/partner (ADR-057). Repository hanya menyediakan DATA —
 * peringkatnya dihitung `rankCandidates()` di `lib/matchmaking.ts`, satu
 * fungsi untuk kedua implementasi, atas jendela kandidat terbatas.
 */
export interface MatchmakingRepository {
  /** Kartu pemain milik sendiri; null = belum pernah dibuat. */
  getSeekerProfile(userId: string): Promise<TeamSeekerProfile | null>;
  /** Simpan (buat atau ganti) kartu pemain milik pelaku. Input SUDAH divalidasi `parseSeekerForm()`. */
  saveSeekerProfile(actor: NetworkViewer, input: TeamSeekerInput): Promise<void>;
  /**
   * Kandidat dengan kartu terbuka, tanpa diri sendiri dan tanpa pemblokir/
   * diblokir. TIMBAL-BALIK: kosong bila kartu pembaca sendiri tidak terbuka.
   * `limit` dipotong ke `MATCH_CANDIDATE_WINDOW.max`.
   */
  listSeekerCandidates(viewerId: string, limit: number): Promise<readonly TeamCandidate[]>;
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
 * Pelaku untuk formulir, pendaftaran, pembayaran, dan galeri (ADR-056).
 * `isAdmin` hanya dipakai mode seed — produksi membaca `is_admin()` dari
 * database dan tidak mempercayai nilai dari aplikasi.
 */
export interface EventActor {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly isAdmin: boolean;
}

/**
 * Formulir pendaftaran internal + pembayaran (ADR-056).
 *
 * Hak dicek DI DALAM implementasi (di produksi oleh RLS + RPC): penyusun
 * formulir, pembaca pendaftar, dan pemeriksa bukti bayar = pengelola
 * terverifikasi acara itu atau admin; pendaftaran hanya terbaca pemiliknya.
 * Pendaftaran orang lain yang tidak boleh dilihat = `null` /
 * `registration_not_found`, tidak pernah "dilarang" — tidak membocorkan id.
 */
export interface RegistrationRepository {
  /** Formulir acara (tayang) — null bila penyelenggara belum membuatnya. */
  getRegistrationForm(eventId: string): Promise<RegistrationForm | null>;
  saveRegistrationForm(actor: EventActor, eventId: string, input: RegistrationFormInput): Promise<void>;
  /** Jawaban SUDAH divalidasi `readAnswers()` terhadap formulir terkini. */
  registerForEvent(actor: EventActor, eventId: string, answers: Readonly<Record<string, AnswerValue>>): Promise<EventRegistration>;
  /** Pendaftaran hidup (bukan dibatalkan) milik pengguna di acara itu. */
  getMyRegistration(userId: string, eventId: string): Promise<EventRegistration | null>;
  listMyRegistrations(userId: string): Promise<readonly EventRegistration[]>;
  getRegistration(actor: EventActor, registrationId: string): Promise<EventRegistration | null>;
  listEventRegistrations(actor: EventActor, eventId: string): Promise<readonly EventRegistration[]>;
  /** Ringkasan per acara kelolaan (dasbor) — acara yang tidak dikelola dilewati. */
  listRegistrationStats(actor: EventActor, eventIds: readonly string[]): Promise<readonly RegistrationStats[]>;
  submitPaymentProof(actor: EventActor, registrationId: string, image: UploadedImage): Promise<void>;
  /** Bukti bayar untuk pemilik, pengelola acara, atau admin; selain itu null. */
  getPaymentProof(actor: EventActor, registrationId: string): Promise<StoredFile | null>;
  reviewRegistration(actor: EventActor, registrationId: string, decision: ReviewDecision, note: string | null): Promise<void>;
  cancelRegistration(actor: EventActor, registrationId: string): Promise<void>;
}

/** Galeri foto acara (ADR-056). Baca publik untuk acara tayang; tulis = pengelola/admin. */
export interface GalleryRepository {
  /** Poster lebih dulu (ADR-079), lalu terbaru. */
  listEventPhotos(eventId: string): Promise<readonly EventPhoto[]>;
  /**
   * Mengembalikan jumlah yang tersimpan; melebihi batas → `gallery_full`.
   * `asPoster` = foto PERTAMA unggahan ini langsung jadi poster (mengganti poster lama).
   */
  addEventPhotos(
    actor: EventActor,
    eventId: string,
    images: readonly UploadedImage[],
    caption: string | null,
    options?: { readonly asPoster?: boolean },
  ): Promise<number>;
  deleteEventPhoto(actor: EventActor, photoId: string): Promise<void>;
  /** Tandai/lepas poster (ADR-079) — maks. satu per acara; foto asing/tanpa hak → `photo_not_found`. */
  setEventPoster(actor: EventActor, photoId: string, isPoster: boolean): Promise<void>;
  /** Video YouTube/Vimeo kanonis (`normalizeVideoUrl`), `null` = lepas. Tanpa hak → `not_event_manager`. */
  setEventVideo(actor: EventActor, eventId: string, videoUrl: string | null): Promise<void>;
  /** Berkas untuk rute publik `/media/foto/[id]` — hanya foto acara yang tayang. */
  getEventPhotoFile(photoId: string): Promise<StoredFile | null>;
}

/** Batas galeri per acara & per unggahan — cermin trigger `enforce_event_photo_insert`. */
export const GALLERY_LIMITS = { perEvent: 30, perUpload: 6, captionMax: 140 } as const;

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

/** Konteks pertanyaan untuk /laporkan & antrean laporan. */
export interface EventQuestionContext {
  readonly id: string;
  readonly excerpt: string;
  readonly eventSlug: string;
  readonly eventTitle: string;
}

/**
 * Tanya-jawab publik per kegiatan (ADR-062 #7). Hak dicek di dalam
 * implementasi (produksi: RPC DEFINER) — menjawab = pengelola terverifikasi
 * acara itu atau admin (aal2); menghapus = penanya sendiri.
 */
export interface EventQuestionRepository {
  listEventQuestions(eventId: string, viewerId: string | null, limit: number): Promise<readonly EventQuestion[]>;
  askEventQuestion(actor: { readonly id: string; readonly fullName: string }, eventId: string, body: string): Promise<void>;
  answerEventQuestion(actor: EventActor, questionId: string, answer: string): Promise<void>;
  deleteEventQuestion(userId: string, questionId: string): Promise<void>;
  /** Admin (service_role) setelah `checkAdminAccess()`; tercatat di riwayat moderasi. */
  hideEventQuestion(input: { readonly questionId: string; readonly actorId: string; readonly actorName?: string; readonly reason: string | null }): Promise<void>;
  /** Pertanyaan yang masih tampil beserta kegiatannya; null = tidak ada/tersembunyi. */
  getEventQuestionContext(questionId: string): Promise<EventQuestionContext | null>;
  /** Ekspor data akun (UU PDP Pasal 7): semua pertanyaan milik sendiri, termasuk yang disembunyikan. */
  listMyEventQuestions(userId: string): Promise<readonly MyEventQuestion[]>;
}

export interface MyEventQuestion {
  readonly eventTitle: string;
  readonly eventSlug: string;
  readonly body: string;
  readonly createdAt: string;
  readonly answer: string | null;
  readonly hidden: boolean;
}

/**
 * Persetujuan pengingat tenggat lewat email (ADR-062 #6). Antrean dispatch di
 * atas hanya membagikan pengingat milik yang menyetujui.
 */
export interface EmailReminderRepository {
  /** Waktu persetujuan (ISO) atau null — dibaca dengan sesi pemilik. */
  getDeadlineEmailOptIn(userId: string): Promise<string | null>;
  /** Pemilik yang masuk menyalakan/mematikan untuk dirinya; mengembalikan waktu persetujuan. */
  setDeadlineEmailReminders(userId: string, enabled: boolean): Promise<string | null>;
  /** Dari tautan bertanda tangan di email, tanpa sesi (service_role). Idempoten. */
  stopDeadlineEmailsByLink(userId: string): Promise<void>;
}

/** Sewa klaim dispatch — cermin default `p_lease_seconds` di migration 20261003100003. */
export const DISPATCH_LEASE_SECONDS = 900;
/** Batas satu klaim — cermin `LEAST(..., 500)` di SQL. */
export const DISPATCH_MAX_BATCH = 500;

/** Kesehatan operasional untuk admin (ADR-062). */
export interface OperationsRepository {
  /** null = tidak ada pg_cron di balik implementasi ini (mode seed, Postgres polos). */
  cronJobHealth(): Promise<readonly CronJobHealth[] | null>;
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
  /** Hanya untuk REJECTED: alasan yang dikirim ke pengirim (≤500). */
  readonly reason?: string;
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
