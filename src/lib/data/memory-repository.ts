import { actionError } from '@/lib/action-feedback';
import { buildDeadlineWeek, daysUntil, getDeadlineState } from '@/lib/deadline';
import { buildDeadlineMessage, notificationTypeForDeadline } from '@/lib/notifications';
import { MemoryRateLimiter } from '@/lib/rate-limit';
import { isSubmissionRateLimited } from '@/lib/submission-schema';
import type {
  AppNotification,
  Category,
  DeadlineDay,
  EventDetail,
  EventQuery,
  EventStatus,
  EventSummary,
  ModerationLogEntry,
  Paginated,
  Submission,
  Team,
  TeamMember,
  TrackerItem,
  TrackerStatus,
} from '@/types/domain';
import { isPubliclyVisible, paginate, resolvePaging, sortSummaries } from './listing';
import type {
  CreateSubmissionInput,
  CalibrationData,
  CreateTeamRepositoryInput,
  RecommendationSignalInput,
  EventRepository,
  RepositoryStats,
  ReviewEventInput,
  ReviewSubmissionInput,
} from './repository';
import { SEED_CATEGORIES, SEED_EVENTS, SEED_TEAMS, type SeedEvent } from './seed-data';

const MS_PER_DAY = 86_400_000;

function isoOffsetDays(days: number, base: Date): string {
  return new Date(base.getTime() + days * MS_PER_DAY).toISOString();
}

/**
 * Tenggat contoh dipatok ke 23:59 WIB pada hari yang dituju, bukan ke jam
 * berjalan. Tenggat sungguhan hampir selalu berakhir di penghujung hari;
 * menampilkan "pukul 02.09 WIB" membuat data contoh terasa palsu dan
 * menyembunyikan kesalahan pembulatan hari kalau ada.
 */
function deadlineIso(days: number, base: Date): string {
  const target = new Date(base.getTime() + days * MS_PER_DAY);
  // 23:59 WIB (UTC+7) = 16:59 UTC pada hari kalender WIB yang sama.
  const wibDate = new Date(target.getTime() + 7 * 3_600_000);
  return new Date(
    Date.UTC(wibDate.getUTCFullYear(), wibDate.getUTCMonth(), wibDate.getUTCDate(), 16, 59, 0),
  ).toISOString();
}

/** Normalisasi untuk pencarian: buang diakritik & rapikan spasi. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Padanan kasar `public.slugify()` di SQL — cukup untuk data yang hidup selama proses. */
function slugify(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'event';
}

function buildDetail(seed: SeedEvent, base: Date): EventDetail {
  const deadlines = seed.deadlines.map((deadline, index) => ({
    id: `${seed.id}-d${index}`,
    label: deadline.label,
    deadlineAt: deadlineIso(deadline.inDays, base),
    isPrimary: deadline.isPrimary,
  }));
  const primary = deadlines.find((deadline) => deadline.isPrimary) ?? null;

  return {
    id: seed.id,
    slug: seed.slug,
    title: seed.title,
    organizer: seed.organizer,
    description: seed.description,
    eventType: seed.eventType,
    educationLevels: seed.educationLevels,
    categorySlugs: seed.categorySlugs,
    location: seed.location,
    isOnline: seed.isOnline,
    status: seed.status,
    savedCount: seed.savedCount,
    createdAt: isoOffsetDays(-seed.createdDaysAgo, base),
    primaryDeadlineAt: primary?.deadlineAt ?? null,
    primaryDeadlineLabel: primary?.label ?? null,
    registrationLink: `https://example.org/daftar/${seed.slug}`,
    sourceUrl: `https://example.org/sumber/${seed.slug}`,
    deadlines,
  };
}

/** Cocok kalau SEMUA kata kunci muncul di judul/penyelenggara/deskripsi. */
export function matchesSearch(event: EventDetail, search: string): boolean {
  const terms = normalize(search).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(`${event.title} ${event.organizer} ${event.description ?? ''}`);
  return terms.every((term) => haystack.includes(term));
}

function hasOverlap(a: readonly string[], b: readonly string[]): boolean {
  return a.some((value) => b.includes(value));
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = create();
    map.set(key, value);
  }
  return value;
}

interface TrackerEntry {
  id: string;
  status: TrackerStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TeamEntry {
  id: string;
  eventId: string;
  createdBy: string;
  title: string;
  description: string | null;
  slotsNeeded: number;
  createdAt: string;
  members: TeamMember[];
}

/**
 * Implementasi in-memory.
 *
 * Dipakai saat kredensial Supabase belum dipasang, dan sebagai baseline
 * pembanding saat menguji perilaku implementasi Supabase. Mutasi (approve/
 * reject) memang hanya bertahan selama proses hidup — itu disengaja, dan
 * dinyatakan terang-terangan di UI lewat penanda "Data contoh".
 */
export class MemoryEventRepository implements EventRepository {
  private readonly events: EventDetail[];
  private readonly savedEvents = new Map<string, Set<string>>();
  private readonly trackerEntries = new Map<string, Map<string, TrackerEntry>>();
  /** userId -> id notifikasi yang sudah ditandai dibaca. */
  private readonly readNotifications = new Map<string, Set<string>>();
  private readonly teams = new Map<string, TeamEntry>();
  private readonly submissions = new Map<string, Submission>();
  private readonly rateLimiter = new MemoryRateLimiter();
  private readonly moderationLog: ModerationLogEntry[] = [];
  /** submissionId → akun pengirim yang masuk (cermin ugc_submissions.submitted_by). */
  private readonly submissionOwners = new Map<string, string>();
  /** Notifikasi tersimpan (bukan turunan tenggat): kabar kiriman komunitas. */
  private readonly storedNotifications = new Map<string, AppNotification[]>();
  /** Hanya untuk paritas & uji; kalibrasi membaca data produksi, bukan data demo. */
  readonly recommendationSignals: (RecommendationSignalInput & { createdAt: string })[] = [];

  constructor(base: Date = new Date()) {
    this.events = SEED_EVENTS.map((seed) => buildDetail(seed, base));
    this.seedTeams(base);
  }

  /** UUID, bukan penghitung: skema form (mis. `createTeamSchema`) memvalidasi id sebagai UUID, sama seperti produksi. */
  private nextId(): string {
    return crypto.randomUUID();
  }

  private seedTeams(base: Date): void {
    const openEvents = this.events.filter((event) => event.status === 'APPROVED');
    SEED_TEAMS.forEach((sample, index) => {
      const event = openEvents[index];
      if (!event) return;

      const id = this.nextId();
      const createdAt = isoOffsetDays(-sample.createdDaysAgo, base);
      this.teams.set(id, {
        id,
        eventId: event.id,
        createdBy: sample.leader.userId,
        title: sample.title,
        description: sample.description,
        slotsNeeded: sample.slotsNeeded,
        createdAt,
        members: [
          { ...sample.leader, role: 'leader', joinedAt: createdAt },
          ...sample.members.map((member) => ({ ...member, role: 'member' as const, joinedAt: createdAt })),
        ],
      });
    });
  }

  private findEvent(eventId: string): EventDetail | undefined {
    return this.events.find((event) => event.id === eventId);
  }

  private updateEvent(eventId: string, patch: (event: EventDetail) => EventDetail): void {
    const index = this.events.findIndex((event) => event.id === eventId);
    const current = this.events[index];
    if (current) this.events[index] = patch(current);
  }

  private publicEvents(includeClosed: boolean, now: Date): EventDetail[] {
    return this.events.filter((event) => {
      if (!isPubliclyVisible(event)) return false;
      if (includeClosed) return true;
      return event.status === 'APPROVED' && getDeadlineState(event.primaryDeadlineAt, now).urgency !== 'closed';
    });
  }

  async listEvents(query: EventQuery): Promise<Paginated<EventSummary>> {
    const now = new Date();
    let results = this.publicEvents(query.includeClosed ?? false, now);

    const search = query.search?.trim();
    if (search) results = results.filter((event) => matchesSearch(event, search));

    const { types, categories, levels, locations, mode } = query;
    if (types?.length) results = results.filter((event) => types.includes(event.eventType));
    if (categories?.length) results = results.filter((event) => hasOverlap(categories, event.categorySlugs));
    if (levels?.length) results = results.filter((event) => hasOverlap(levels, event.educationLevels));
    // Cocok persis, sama seperti `.in('location', …)` di SupabaseEventRepository.
    if (locations?.length) results = results.filter((event) => event.location !== null && locations.includes(event.location));
    if (mode) results = results.filter((event) => event.isOnline === (mode === 'online'));

    return paginate(sortSummaries(results, query.sort ?? 'relevance', now, query.profile), resolvePaging(query));
  }

  async getEventBySlug(slug: string): Promise<EventDetail | null> {
    const event = this.events.find((candidate) => candidate.slug === slug);
    // Entri PENDING/REJECTED tidak boleh bocor lewat tebakan slug.
    return event && isPubliclyVisible(event) ? event : null;
  }

  async listClosingSoon(limit: number): Promise<readonly EventSummary[]> {
    const now = new Date();
    return this.publicEvents(false, now)
      .filter((event) => {
        const state = getDeadlineState(event.primaryDeadlineAt, now);
        return state.daysLeft !== null && state.daysLeft <= 30;
      })
      .sort(
        (a, b) =>
          new Date(a.primaryDeadlineAt ?? 0).getTime() - new Date(b.primaryDeadlineAt ?? 0).getTime(),
      )
      .slice(0, limit);
  }

  async listCategories(): Promise<readonly Category[]> {
    return SEED_CATEGORIES.map((category) => ({ ...category }));
  }

  async getStats(): Promise<RepositoryStats> {
    const now = new Date();
    const active = this.publicEvents(false, now);
    const closingThisWeek = active.filter((event) => {
      const days = getDeadlineState(event.primaryDeadlineAt, now).daysLeft;
      return days !== null && days >= 0 && days <= 7;
    }).length;
    const addedThisWeek = active.filter(
      (event) => now.getTime() - new Date(event.createdAt).getTime() <= 7 * MS_PER_DAY,
    ).length;

    return {
      totalActive: active.length,
      closingThisWeek,
      addedThisWeek,
      organizerCount: new Set(active.map((event) => event.organizer)).size,
    };
  }

  async getDeadlineWeek(): Promise<readonly DeadlineDay[]> {
    const deadlines = this.events
      .filter((event) => event.status === 'APPROVED' && event.primaryDeadlineAt)
      .map((event) => event.primaryDeadlineAt as string);
    return buildDeadlineWeek(deadlines, new Date());
  }

  async listByStatus(status: EventStatus, limit: number): Promise<readonly EventDetail[]> {
    return this.events.filter((event) => event.status === status).slice(0, limit);
  }

  async reviewEvent({ eventId, decision, reviewerId, reviewerName, reason }: ReviewEventInput): Promise<void> {
    const event = this.findEvent(eventId);
    if (!event || event.status === decision) return;
    this.updateEvent(eventId, (current) => ({ ...current, status: decision }));
    this.logModeration({
      subjectType: 'event',
      subjectId: eventId,
      title: event.title,
      fromStatus: event.status,
      toStatus: decision,
      actor: { reviewerId, reviewerName },
      reason: decision === 'REJECTED' ? (reason ?? null) : null,
    });
  }

  /** Cermin trigger `log_moderation_change()` (migration 20260926130001). */
  private logModeration(entry: {
    subjectType: ModerationLogEntry['subjectType'];
    subjectId: string;
    title: string;
    fromStatus: EventStatus | null;
    toStatus: EventStatus;
    actor: { reviewerId: string | null; reviewerName?: string | undefined };
    reason: string | null;
  }): void {
    this.moderationLog.push({
      id: String(this.moderationLog.length + 1),
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      title: entry.title,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      actorId: entry.actor.reviewerId,
      actorName: entry.actor.reviewerId ? (entry.actor.reviewerName ?? null) : null,
      reason: entry.reason,
      createdAt: new Date().toISOString(),
    });
  }

  async listModerationLog(limit: number): Promise<readonly ModerationLogEntry[]> {
    return [...this.moderationLog].reverse().slice(0, limit);
  }

  // ------------------------------------------------------------------
  // Kiriman komunitas (Phase 3)
  // ------------------------------------------------------------------

  async createSubmission({ submittedByEmail, submittedBy, payload }: CreateSubmissionInput): Promise<void> {
    if (isSubmissionRateLimited([...this.submissions.values()], submittedByEmail)) {
      throw actionError('submission_rate_limited');
    }
    const id = this.nextId();
    if (submittedBy) this.submissionOwners.set(id, submittedBy);
    this.submissions.set(id, {
      id,
      submittedByEmail,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      payload,
    });
  }

  async listSubmissions(status: EventStatus, limit: number): Promise<readonly Submission[]> {
    return [...this.submissions.values()]
      .filter((submission) => submission.status === status)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, limit);
  }

  async reviewSubmission({ submissionId, decision, reviewerId, reviewerName }: ReviewSubmissionInput): Promise<void> {
    const submission = this.submissions.get(submissionId);
    if (!submission || submission.status !== 'PENDING') throw actionError('submission_not_found');

    if (decision === 'APPROVED') {
      const { payload } = submission;
      if (!payload) throw actionError('invalid_submission');

      // Cermin `events.dedup_hash` UNIQUE: judul + penyelenggara ternormalisasi.
      const key = normalize(`${payload.title}|${payload.organizer}`);
      if (this.events.some((event) => normalize(`${event.title}|${event.organizer}`) === key)) {
        throw actionError('submission_duplicate');
      }

      const id = this.nextId();
      const baseSlug = slugify(payload.title);
      let slug = baseSlug;
      for (let n = 1; this.events.some((event) => event.slug === slug); n += 1) {
        slug = `${baseSlug}-${n}`;
      }

      this.events.push({
        id,
        slug,
        title: payload.title,
        organizer: payload.organizer,
        description: payload.description,
        eventType: payload.eventType,
        educationLevels: payload.educationLevels,
        categorySlugs: payload.categorySlugs,
        location: payload.location,
        isOnline: payload.isOnline,
        status: 'APPROVED',
        savedCount: 0,
        createdAt: new Date().toISOString(),
        primaryDeadlineAt: payload.deadlineAt,
        primaryDeadlineLabel: 'registration',
        registrationLink: payload.registrationLink,
        sourceUrl: payload.sourceUrl ?? payload.registrationLink,
        deadlines: [
          { id: `${id}-d0`, label: 'registration', deadlineAt: payload.deadlineAt, isPrimary: true },
        ],
      });
      this.logModeration({
        subjectType: 'event',
        subjectId: id,
        title: payload.title,
        fromStatus: null,
        toStatus: 'APPROVED',
        actor: { reviewerId, reviewerName },
        reason: null,
      });
    }

    this.submissions.set(submissionId, { ...submission, status: decision });
    this.notifySubmitter(submissionId, submission.payload?.title ?? 'kegiatan', decision);
    this.logModeration({
      subjectType: 'submission',
      subjectId: submissionId,
      title: submission.payload?.title ?? '(tanpa judul)',
      fromStatus: 'PENDING',
      toStatus: decision,
      actor: { reviewerId, reviewerName },
      reason: null,
    });
  }

  // ------------------------------------------------------------------
  // Saved events
  // ------------------------------------------------------------------

  async isEventSaved(userId: string, eventId: string): Promise<boolean> {
    return this.savedEvents.get(userId)?.has(eventId) ?? false;
  }

  async listSavedEventIds(userId: string): Promise<readonly string[]> {
    return [...(this.savedEvents.get(userId) ?? [])];
  }

  /** Cermin WITH CHECK policy saved_events_own / tracker_own (migration 0008). */
  private requireVisibleEvent(eventId: string): void {
    const event = this.findEvent(eventId);
    if (!event || !isPubliclyVisible(event)) throw actionError('event_unavailable');
  }

  async saveEvent(userId: string, eventId: string): Promise<void> {
    this.requireVisibleEvent(eventId);
    const saved = getOrCreate(this.savedEvents, userId, () => new Set<string>());
    if (saved.has(eventId)) return;
    saved.add(eventId);
    this.updateEvent(eventId, (event) => ({ ...event, savedCount: event.savedCount + 1 }));
  }

  async unsaveEvent(userId: string, eventId: string): Promise<void> {
    const saved = this.savedEvents.get(userId);
    if (!saved?.delete(eventId)) return;
    this.updateEvent(eventId, (event) => ({ ...event, savedCount: Math.max(event.savedCount - 1, 0) }));
  }

  async listSavedEvents(userId: string): Promise<readonly EventSummary[]> {
    const savedIds = this.savedEvents.get(userId);
    if (!savedIds?.size) return [];
    return this.events.filter((event) => savedIds.has(event.id) && isPubliclyVisible(event));
  }

  // ------------------------------------------------------------------
  // Application tracker
  // ------------------------------------------------------------------

  async listTrackerItems(userId: string): Promise<readonly TrackerItem[]> {
    const entries = this.trackerEntries.get(userId);
    if (!entries) return [];

    const items: TrackerItem[] = [];
    for (const [eventId, entry] of entries) {
      const event = this.findEvent(eventId);
      if (event) items.push({ ...entry, eventId, event });
    }
    return items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async upsertTrackerItem(
    userId: string,
    eventId: string,
    status: TrackerStatus,
    notes?: string | null,
  ): Promise<void> {
    this.requireVisibleEvent(eventId);
    const entries = getOrCreate(this.trackerEntries, userId, () => new Map<string, TrackerEntry>());
    const now = new Date().toISOString();
    const existing = entries.get(eventId);

    entries.set(
      eventId,
      existing
        ? { ...existing, status, notes: notes !== undefined ? notes : existing.notes, updatedAt: now }
        : { id: `tracker-${userId}-${eventId}`, status, notes: notes ?? null, createdAt: now, updatedAt: now },
    );
  }

  async addTrackerItemIfAbsent(userId: string, eventId: string): Promise<void> {
    if (this.trackerEntries.get(userId)?.has(eventId)) return;
    await this.upsertTrackerItem(userId, eventId, 'SAVED');
  }

  async removeTrackerItem(userId: string, eventId: string): Promise<void> {
    this.trackerEntries.get(userId)?.delete(eventId);
  }

  // ------------------------------------------------------------------
  // Notifikasi
  // ------------------------------------------------------------------

  /**
   * Notifikasi di mode seed DITURUNKAN, bukan disimpan.
   *
   * Di produksi baris notifikasi dibuat oleh fungsi Postgres terjadwal.
   * Menyalin mekanisme itu ke sini berarti menjalankan penjadwal di dalam
   * proses Next.js — sumber kebocoran timer dan perilaku yang berbeda antar
   * worker. Jadi implementasi ini menghitung ulang "event apa yang hari ini
   * jatuh di H-3 atau H-1" setiap kali daftarnya dibaca. Hasilnya identik
   * dari sisi pengguna, dan tidak ada state yang perlu dibersihkan.
   *
   * Yang tetap disimpan hanyalah status "sudah dibaca" — itu keputusan
   * pengguna, bukan data turunan.
   */
  /** Cermin trigger notify_submission_decision() (migration 20260926160001). */
  private notifySubmitter(submissionId: string, title: string, decision: 'APPROVED' | 'REJECTED'): void {
    const owner = this.submissionOwners.get(submissionId);
    if (!owner) return;
    const event = decision === 'APPROVED' ? this.events.find((candidate) => candidate.title === title) : undefined;
    getOrCreate(this.storedNotifications, owner, () => []).push({
      id: `notif-submission-${submissionId}`,
      type: decision === 'APPROVED' ? 'SUBMISSION_APPROVED' : 'SUBMISSION_REJECTED',
      message:
        decision === 'APPROVED'
          ? `Kirimanmu "${title}" sudah dicek dan kini tayang. Terima kasih!`
          : `Kirimanmu "${title}" belum bisa ditayangkan setelah dicek moderator. Pastikan tautan resmi & tenggatnya benar, lalu kirim ulang.`,
      isRead: false,
      sentAt: new Date().toISOString(),
      event: event ? { id: event.id, slug: event.slug, title: event.title } : null,
    });
  }

  private deriveNotifications(userId: string, now: Date): AppNotification[] {
    const readSet = this.readNotifications.get(userId);
    const stored = (this.storedNotifications.get(userId) ?? []).map((notification) => ({
      ...notification,
      isRead: readSet?.has(notification.id) ?? false,
    }));

    const sources = new Set<string>(this.savedEvents.get(userId) ?? []);
    for (const eventId of this.trackerEntries.get(userId)?.keys() ?? []) {
      sources.add(eventId);
    }
    if (sources.size === 0) return stored;

    const notifications: AppNotification[] = [...stored];

    for (const eventId of sources) {
      const event = this.findEvent(eventId);
      if (!event || event.status !== 'APPROVED') continue;

      const type = notificationTypeForDeadline(event.primaryDeadlineAt, now);
      const daysLeft = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
      if (!type || daysLeft === null) continue;

      // Id deterministik: menandai "sudah dibaca" harus tetap menempel
      // walau daftarnya dihitung ulang di request berikutnya.
      const id = `notif-${userId}-${eventId}-${type}`;
      notifications.push({
        id,
        type,
        message: buildDeadlineMessage(event.title, daysLeft),
        isRead: readSet?.has(id) ?? false,
        sentAt: event.primaryDeadlineAt ?? event.createdAt,
        event: { id: event.id, slug: event.slug, title: event.title },
      });
    }

    return notifications.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  }

  async listNotifications(userId: string, limit: number): Promise<readonly AppNotification[]> {
    return this.deriveNotifications(userId, new Date()).slice(0, Math.max(limit, 0));
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    return this.deriveNotifications(userId, new Date()).filter((n) => !n.isRead).length;
  }

  async markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
    getOrCreate(this.readNotifications, userId, () => new Set<string>()).add(notificationId);
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    const read = getOrCreate(this.readNotifications, userId, () => new Set<string>());
    for (const notification of this.deriveNotifications(userId, new Date())) read.add(notification.id);
  }

  // ------------------------------------------------------------------
  // Tim lomba (Phase 3)
  //
  // Otorisasi diperiksa di sini, bukan dianggap sudah beres di Server
  // Action. Di produksi RLS yang menegakkan aturan yang sama; kalau mode
  // seed lebih longgar, perbedaan perilakunya baru muncul setelah deploy.
  // ------------------------------------------------------------------

  private toTeam(entry: TeamEntry): Team {
    const event = this.findEvent(entry.eventId);
    return {
      id: entry.id,
      eventId: entry.eventId,
      createdBy: entry.createdBy,
      title: entry.title,
      description: entry.description,
      slotsNeeded: entry.slotsNeeded,
      createdAt: entry.createdAt,
      event: event && isPubliclyVisible(event) ? event : null,
      memberCount: entry.members.length,
      members: [...entry.members].sort(
        (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
      ),
    };
  }

  private requireLeader(actorId: string, teamId: string): TeamEntry {
    const entry = this.teams.get(teamId);
    if (!entry) throw actionError('team_not_found');
    if (entry.createdBy !== actorId) throw actionError('team_forbidden');
    return entry;
  }

  async listTeams(eventId?: string): Promise<readonly Team[]> {
    return [...this.teams.values()]
      .filter((entry) => !eventId || entry.eventId === eventId)
      .map((entry) => this.toTeam(entry))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getTeamById(teamId: string): Promise<Team | null> {
    const entry = this.teams.get(teamId);
    return entry ? this.toTeam(entry) : null;
  }

  async createTeam(input: CreateTeamRepositoryInput): Promise<string> {
    const event = this.findEvent(input.eventId);
    // Tim untuk event yang tidak tayang tidak boleh dibuat: kalau boleh,
    // halaman /teams jadi jalan memutar untuk mengintip antrean moderasi.
    if (!event || event.status !== 'APPROVED') throw actionError('event_unavailable');

    const id = this.nextId();
    const now = new Date().toISOString();
    this.teams.set(id, {
      id,
      eventId: input.eventId,
      createdBy: input.createdBy,
      title: input.title,
      description: input.description,
      slotsNeeded: input.slotsNeeded,
      createdAt: now,
      // Pembuat langsung jadi anggota dengan peran ketua. Tim tanpa satu pun
      // anggota akan tampil sebagai "0 dari N" dan terbaca seperti tim mati.
      members: [{ userId: input.createdBy, fullName: input.createdByName, role: 'leader', joinedAt: now }],
    });
    return id;
  }

  async joinTeam(actorId: string, actorName: string, teamId: string): Promise<void> {
    const entry = this.teams.get(teamId);
    if (!entry) throw actionError('team_not_found');
    if (entry.members.some((member) => member.userId === actorId)) return;
    if (entry.members.length >= entry.slotsNeeded) throw actionError('team_full');

    entry.members.push({ userId: actorId, fullName: actorName, role: 'member', joinedAt: new Date().toISOString() });
  }

  async leaveTeam(actorId: string, teamId: string): Promise<void> {
    const entry = this.teams.get(teamId);
    if (!entry) return;
    // Ketua tidak boleh keluar dari timnya sendiri: yang tersisa adalah tim
    // tanpa siapa pun yang berhak mengelolanya. Jalur yang benar adalah
    // membubarkan tim.
    if (entry.createdBy === actorId) throw actionError('leader_cannot_leave');
    entry.members = entry.members.filter((member) => member.userId !== actorId);
  }

  async removeTeamMember(actorId: string, teamId: string, memberId: string): Promise<void> {
    const entry = this.requireLeader(actorId, teamId);
    if (memberId === entry.createdBy) throw actionError('leader_cannot_be_removed');
    entry.members = entry.members.filter((member) => member.userId !== memberId);
  }

  async deleteTeam(actorId: string, teamId: string): Promise<void> {
    this.requireLeader(actorId, teamId);
    this.teams.delete(teamId);
  }

  async consumeRateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
    return this.rateLimiter.consume(bucket, limit, windowSeconds);
  }

  async recordRecommendationSignal(input: RecommendationSignalInput): Promise<void> {
    this.recommendationSignals.push({ ...input, createdAt: new Date().toISOString() });
  }

  async listCalibrationData(since: Date): Promise<CalibrationData> {
    return {
      signals: this.recommendationSignals
        .filter((signal) => new Date(signal.createdAt) >= since)
        .map(({ eventId, createdAt, interests, educationLevel }) => ({ eventId, createdAt, interests, educationLevel })),
      events: this.events.filter(isPubliclyVisible),
    };
  }
}
