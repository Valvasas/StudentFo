import { actionError } from '@/lib/action-feedback';
import {
  BLOCK_LIST_LIMIT,
  clampConnectionLimit,
  compareConnections,
  CONNECTION_RATE_LIMIT,
  connectionCursorOf,
  decodeConnectionCursor,
  encodeConnectionCursor,
  matchesConnectionFilter,
  matchesPeopleSearch,
  rankSuggestions,
  type ConnectionPageRequest,
  type NetworkProfileInput,
  type NetworkViewer,
} from '@/lib/network';
import { buildDeadlineWeek, daysUntil, getDeadlineState, jakartaDateKey } from '@/lib/deadline';
import { ORGANIZER_RATE_LIMITS, type OrganizerApplicationInput } from '@/lib/organizer';
import { ANALYTICS_MIN_GROUP, kAnonymize } from '@/lib/organizer-analytics';
import { buildDeadlineMessage, notificationTypeForDeadline } from '@/lib/notifications';
import { isPortfolioStatus, isPubliclyListed, toPortfolioEntry, type PortfolioInput } from '@/lib/portfolio';
import { MemoryRateLimiter } from '@/lib/rate-limit';
import { isSubmissionRateLimited } from '@/lib/submission-schema';
import type {
  AppNotification,
  BlockedPerson,
  Category,
  Connection,
  ConnectionCounts,
  ConnectionPage,
  ConnectionStatus,
  DeadlineDay,
  DeadlineDispatch,
  EventAnalytics,
  EventClaim,
  EventDetail,
  EventQuery,
  EventRevision,
  EventRevisionChanges,
  EventStatus,
  EventSummary,
  ManagedEvent,
  ManagerSource,
  ModerationLogEntry,
  ModerationStatus,
  OrganizerHistoryEntry,
  OrganizerProfile,
  OrganizerStatus,
  TrustRequestStatus,
  NetworkEventRef,
  NetworkPerson,
  NetworkProfile,
  Paginated,
  PeopleSuggestion,
  PortfolioEntry,
  PortfolioFields,
  ProfileRelation,
  PublicProfile,
  Submission,
  Team,
  TeamLink,
  TeamMember,
  TrackerItem,
  TrackerStatus,
} from '@/types/domain';
import { isPubliclyVisible, matchesCost, paginate, resolvePaging, sortSummaries } from './listing';
import type { EventPresentationInput } from '@/lib/event-presentation';
import { DISPATCH_LEASE_SECONDS, DISPATCH_MAX_BATCH } from './repository';
import type {
  CreateSubmissionInput,
  CalibrationData,
  CreateTeamRepositoryInput,
  RecommendationSignalInput,
  EventRepository,
  OrganizerActor,
  PeopleFilter,
  RepositoryStats,
  ReviewEventInput,
  ReviewSubmissionInput,
  RestoreRejectedInput,
  ReviewTrustInput,
} from './repository';
import {
  DEMO_STARTER_NETWORK,
  DEMO_STARTER_PORTFOLIO,
  SEED_CATEGORIES,
  SEED_EVENTS,
  SEED_PEOPLE,
  SEED_PORTFOLIO,
  type SeedPortfolioEntry,
  SEED_PERSON_CONNECTIONS,
  SEED_TEAMS,
  type SeedEvent,
} from './seed-data';

const MS_PER_DAY = 86_400_000;

/** Batas identitas demo yang menerima data awal per siklus data demo (lihat `admitDemoSeed`). */
export const DEMO_SEEDED_USER_LIMIT = 2_000;

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
    isFree: seed.isFree ?? null,
    priceAmount: seed.isFree === false ? (seed.priceAmount ?? null) : null,
    featuredUntil: seed.featuredForDays !== undefined ? isoOffsetDays(seed.featuredForDays, base) : null,
    verificationBadge: seed.verificationBadge ?? null,
    guidebookUrl: seed.guidebookUrl ?? null,
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

interface TrackerEntry extends PortfolioFields {
  id: string;
  status: TrackerStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_PORTFOLIO: PortfolioFields = { achievement: null, achievementNote: null, proofUrl: null, portfolioVisible: null };

interface NetworkMember {
  person: NetworkPerson;
  discoverable: boolean;
  updatedAt: string;
}

interface ConnectionEntry {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: ConnectionStatus;
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
}

interface ManagerEntry {
  source: ManagerSource;
  since: string;
}

interface ClaimEntry {
  id: string;
  eventId: string;
  userId: string;
  evidence: string;
  status: TrustRequestStatus;
  reviewNote: string | null;
  createdAt: string;
}

interface RevisionEntry {
  id: string;
  eventId: string;
  proposedBy: string;
  changes: EventRevisionChanges;
  note: string | null;
  status: TrustRequestStatus;
  reviewNote: string | null;
  createdAt: string;
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
  /** Cermin `users` + `network_profiles`: orang contoh dan pengguna demo yang pernah bertindak. */
  private readonly people = new Map<string, NetworkMember>();
  private readonly connections = new Map<string, ConnectionEntry>();
  /** Cermin `connection_blocks`: pemblokir → (yang diblokir → waktu blokir). */
  private readonly blocks = new Map<string, Map<string, string>>();
  /** Cermin `organizer_profiles` (ADR-042). */
  private readonly organizers = new Map<string, OrganizerProfile>();
  /** Cermin `event_managers`: acara → (pengguna → sumber hak). */
  private readonly eventManagers = new Map<string, Map<string, ManagerEntry>>();
  private readonly claims = new Map<string, ClaimEntry>();
  private readonly revisions = new Map<string, RevisionEntry>();
  /** Cermin `event_daily_stats`: `${eventId}|${YYYY-MM-DD WIB}`. */
  private readonly dailyStats = new Map<string, { views: number; visitors: number }>();
  /** Cermin `event_view_dedup`. */
  private readonly viewDedup = new Set<string>();
  /**
   * Sinyal fiktif persona demo penyelenggara — terpisah dari
   * `recommendationSignals` supaya halaman kalibrasi admin tidak tercemar.
   */
  private readonly demoAnalyticsSignals: (RecommendationSignalInput & { createdAt: string })[] = [];
  /** Cermin `notifications.dispatch_claimed_at` (ms) & `dispatched_at` (ADR-051). */
  private readonly dispatchClaims = new Map<string, number>();
  private readonly dispatched = new Set<string>();
  /** Hanya untuk paritas & uji; kalibrasi membaca data produksi, bukan data demo. */
  readonly recommendationSignals: (RecommendationSignalInput & { createdAt: string })[] = [];
  /** Identitas demo yang sudah menerima data awal (jaringan/portofolio/penyelenggara). */
  private readonly demoSeededUsers = new Set<string>();
  private readonly demoSeedLimit: number;

  constructor(base: Date = new Date(), { demoSeedLimit = DEMO_SEEDED_USER_LIMIT }: { demoSeedLimit?: number } = {}) {
    this.demoSeedLimit = demoSeedLimit;
    this.events = SEED_EVENTS.map((seed) => buildDetail(seed, base));
    this.seedTeams(base);
    this.seedPeople(base);
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

  private seedPeople(base: Date): void {
    for (const { discoverable, ...person } of SEED_PEOPLE) {
      this.people.set(person.userId, { person, discoverable, updatedAt: base.toISOString() });
    }
    for (const { userId, ...entry } of SEED_PORTFOLIO) this.seedPortfolioEntry(userId, entry, base);
    SEED_PERSON_CONNECTIONS.forEach(([requesterId, addresseeId], index) => {
      const at = isoOffsetDays(-(index + 3), base);
      const id = this.nextId();
      this.connections.set(id, { id, requesterId, addresseeId, status: 'ACCEPTED', message: null, createdAt: at, respondedAt: at });
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

    const { types, categories, levels, locations, mode, cost } = query;
    if (types?.length) results = results.filter((event) => types.includes(event.eventType));
    if (categories?.length) results = results.filter((event) => hasOverlap(categories, event.categorySlugs));
    if (levels?.length) results = results.filter((event) => hasOverlap(levels, event.educationLevels));
    // Cocok persis, sama seperti `.in('location', …)` di SupabaseEventRepository.
    if (locations?.length) results = results.filter((event) => event.location !== null && locations.includes(event.location));
    if (mode) results = results.filter((event) => event.isOnline === (mode === 'online'));
    if (cost) results = results.filter((event) => matchesCost(event, cost));

    return paginate(
      sortSummaries(results, query.sort ?? 'relevance', now, query.profile, query.promoted ?? false),
      resolvePaging(query),
    );
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

  // ------------------------------------------------------------------
  // Lencana & promosi (ADR-049)
  // ------------------------------------------------------------------

  async updateEventPresentation({ eventId, verificationBadge, featuredUntil }: EventPresentationInput): Promise<void> {
    const event = this.findEvent(eventId);
    // Cermin `.eq('status', 'APPROVED')` di SupabaseEventRepository.
    if (!event || event.status !== 'APPROVED') throw actionError('event_unavailable');
    this.updateEvent(eventId, (current) => ({ ...current, verificationBadge, featuredUntil }));
  }

  async listFeaturedEvents(limit: number): Promise<readonly EventSummary[]> {
    return this.events
      .filter((event) => event.featuredUntil !== null && isPubliclyVisible(event))
      .sort((a, b) => new Date(b.featuredUntil ?? 0).getTime() - new Date(a.featuredUntil ?? 0).getTime())
      .slice(0, Math.max(limit, 0));
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
    fromStatus: ModerationStatus | null;
    toStatus: ModerationStatus;
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

  async restoreRejected({ subjectType, subjectId, reviewerId, reviewerName }: RestoreRejectedInput): Promise<void> {
    const actor = { reviewerId, reviewerName };
    if (subjectType === 'event') {
      const event = this.findEvent(subjectId);
      if (event?.status !== 'REJECTED') throw actionError('moderation_not_rejected');
      this.updateEvent(subjectId, (current) => ({ ...current, status: 'PENDING' }));
      this.logModeration({ subjectType, subjectId, title: event.title, fromStatus: 'REJECTED', toStatus: 'PENDING', actor, reason: null });
      return;
    }
    const submission = this.submissions.get(subjectId);
    if (submission?.status !== 'REJECTED') throw actionError('moderation_not_rejected');
    this.submissions.set(subjectId, { ...submission, status: 'PENDING' });
    this.logModeration({
      subjectType,
      subjectId,
      title: submission.payload?.title ?? '(kiriman tanpa judul)',
      fromStatus: 'REJECTED',
      toStatus: 'PENDING',
      actor,
      reason: null,
    });
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
      submittedBy,
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

  async listMySubmissions(userId: string, limit: number): Promise<readonly Submission[]> {
    return [...this.submissions.values()]
      .filter((submission) => submission.submittedBy === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
        // Cermin approve_submission() (20261003100001): biaya & panduan ikut,
        // kontak/bukti (bahan moderator) tidak.
        isFree: payload.isFree,
        priceAmount: payload.isFree === false ? payload.priceAmount : null,
        guidebookUrl: payload.guidebookUrl,
        featuredUntil: null,
        verificationBadge: null,
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
      // Cermin approve_submission() (migration 20260928110001): kiriman
      // penyelenggara TERVERIFIKASI → acara masuk dasbornya.
      const owner = this.submissionOwners.get(submissionId);
      if (owner && this.isVerifiedOrganizer(owner)) {
        getOrCreate(this.eventManagers, id, () => new Map()).set(owner, { source: 'SUBMISSION', since: new Date().toISOString() });
      }
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
        : { id: `tracker-${userId}-${eventId}`, status, notes: notes ?? null, createdAt: now, updatedAt: now, ...EMPTY_PORTFOLIO },
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
  // Portofolio & profil publik (ADR-046)
  // ------------------------------------------------------------------

  async updatePortfolioEntry(userId: string, eventId: string, input: PortfolioInput): Promise<void> {
    const entry = this.trackerEntries.get(userId)?.get(eventId);
    if (!entry || !isPortfolioStatus(entry.status)) throw actionError('portfolio_not_eligible');
    // Cermin WITH CHECK tracker_own: acara harus tayang atau sudah selesai.
    const event = this.findEvent(eventId);
    if (!event || (event.status !== 'APPROVED' && event.status !== 'EXPIRED')) throw actionError('event_unavailable');
    this.trackerEntries.get(userId)?.set(eventId, {
      ...entry,
      achievement: input.achievement,
      achievementNote: input.achievementNote,
      proofUrl: input.proofUrl,
      portfolioVisible: input.visible,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Cermin `can_view_profile()` (migration 20260929100001). */
  private canViewProfile(viewerId: string, userId: string): boolean {
    if (viewerId === userId) return true;
    if (this.isBlocked(viewerId, userId)) return false;
    return Boolean(this.people.get(userId)?.discoverable || this.findPair(viewerId, userId));
  }

  async getPublicProfile(viewerId: string, userId: string): Promise<PublicProfile | null> {
    const member = this.people.get(userId);
    if (!member || !this.canViewProfile(viewerId, userId)) return null;

    const pair = this.findPair(viewerId, userId);
    const relation: ProfileRelation =
      viewerId === userId ? 'self' : !pair ? null : pair.status === 'ACCEPTED' ? 'connected' : pair.requesterId === userId ? 'incoming' : 'outgoing';

    const portfolio: PortfolioEntry[] = [];
    for (const [eventId, entry] of this.trackerEntries.get(userId) ?? []) {
      const event = this.findEvent(eventId);
      if (!event || (event.status !== 'APPROVED' && event.status !== 'EXPIRED')) continue;
      if (!isPubliclyListed({ ...entry, event })) continue;
      portfolio.push(toPortfolioEntry({ ...entry, eventId, event }));
    }
    portfolio.sort((a, b) => (b.deadlineAt ?? '').localeCompare(a.deadlineAt ?? ''));
    return { person: member.person, relation, portfolio: portfolio.slice(0, 100) };
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

  // ------------------------------------------------------------------
  // Dispatch ke kanal luar (ADR-051) — cermin claim/ack_notification_dispatch()
  // ------------------------------------------------------------------

  async claimDeadlineDispatches(limit: number): Promise<readonly DeadlineDispatch[]> {
    const now = new Date();
    const leaseCutoff = now.getTime() - DISPATCH_LEASE_SECONDS * 1000;
    const userIds = new Set<string>([...this.savedEvents.keys(), ...this.trackerEntries.keys()]);
    const due: (DeadlineDispatch & { readonly sortKey: string })[] = [];

    for (const userId of userIds) {
      for (const notification of this.deriveNotifications(userId, now)) {
        if (notification.type !== 'DEADLINE_H3' && notification.type !== 'DEADLINE_H1') continue;
        if (this.dispatched.has(notification.id)) continue;
        const claimedAt = this.dispatchClaims.get(notification.id);
        if (claimedAt !== undefined && claimedAt >= leaseCutoff) continue;
        const event = notification.event ? this.findEvent(notification.event.id) : undefined;
        // Pengingat basi tidak dikirim — sama dengan `d.deadline_at >= NOW()` di SQL.
        if (!event?.primaryDeadlineAt || new Date(event.primaryDeadlineAt).getTime() < now.getTime()) continue;
        due.push({
          sortKey: `${notification.sentAt}|${notification.id}`,
          notificationId: notification.id,
          type: notification.type,
          message: notification.message,
          createdAt: notification.sentAt,
          recipient: { userId, email: null, fullName: this.people.get(userId)?.person.fullName ?? null },
          event: {
            id: event.id,
            slug: event.slug,
            title: event.title,
            organizer: event.organizer,
            deadlineAt: event.primaryDeadlineAt,
            daysLeft: daysUntil(event.primaryDeadlineAt, now) ?? 0,
          },
        });
      }
    }

    const batch = due
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(0, Math.min(Math.max(Math.trunc(limit), 1), DISPATCH_MAX_BATCH));
    for (const item of batch) this.dispatchClaims.set(item.notificationId, now.getTime());
    return batch.map(({ sortKey: _sortKey, ...item }) => item);
  }

  async acknowledgeDeadlineDispatches(notificationIds: readonly string[]): Promise<number> {
    let acked = 0;
    for (const id of new Set(notificationIds)) {
      if (!this.dispatchClaims.has(id) || this.dispatched.has(id)) continue;
      this.dispatched.add(id);
      acked += 1;
    }
    return acked;
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

  // ------------------------------------------------------------------
  // Koneksi (ADR-040)
  //
  // Aturan di sini mencerminkan RLS + trigger migration 20260927100001:
  // target harus bisa ditemukan, satu baris per pasangan, hanya yang diajak
  // boleh menjawab, kedua pihak boleh memutus, batas 30 ajakan/24 jam.
  // ------------------------------------------------------------------

  /** Catat profil pelaku: mode seed tidak punya tabel `users` untuk dibaca pihak lain. */
  private rememberActor(actor: NetworkViewer): NetworkMember {
    const existing = this.people.get(actor.id);
    const member: NetworkMember = {
      person: {
        userId: actor.id,
        fullName: actor.fullName,
        headline: existing?.person.headline ?? null,
        educationLevel: actor.educationLevel,
        major: actor.major,
        interests: [...actor.interests],
      },
      discoverable: existing?.discoverable ?? false,
      updatedAt: existing?.updatedAt ?? new Date().toISOString(),
    };
    this.people.set(actor.id, member);
    return member;
  }

  private findPair(a: string, b: string): ConnectionEntry | undefined {
    for (const entry of this.connections.values()) {
      if ((entry.requesterId === a && entry.addresseeId === b) || (entry.requesterId === b && entry.addresseeId === a)) {
        return entry;
      }
    }
    return undefined;
  }

  /** Dua arah, sama dengan `is_blocked()` di migration 20260928100001. */
  private isBlocked(a: string, b: string): boolean {
    return Boolean(this.blocks.get(a)?.has(b) || this.blocks.get(b)?.has(a));
  }

  private notify(userId: string, notification: Omit<AppNotification, 'isRead' | 'sentAt' | 'event'>): void {
    getOrCreate(this.storedNotifications, userId, () => []).push({
      ...notification,
      isRead: false,
      sentAt: new Date().toISOString(),
      event: null,
    });
  }

  private acceptedPeers(userId: string): Set<string> {
    const peers = new Set<string>();
    for (const entry of this.connections.values()) {
      if (entry.status !== 'ACCEPTED') continue;
      if (entry.requesterId === userId) peers.add(entry.addresseeId);
      else if (entry.addresseeId === userId) peers.add(entry.requesterId);
    }
    return peers;
  }

  private teamEventsOf(userId: string): NetworkEventRef[] {
    const refs = new Map<string, NetworkEventRef>();
    for (const team of this.teams.values()) {
      if (!team.members.some((member) => member.userId === userId)) continue;
      const event = this.findEvent(team.eventId);
      if (event && isPubliclyVisible(event)) {
        refs.set(event.id, { id: event.id, slug: event.slug, title: event.title, eventType: event.eventType });
      }
    }
    return [...refs.values()];
  }

  private seedPortfolioEntry(userId: string, entry: Omit<SeedPortfolioEntry, 'userId'>, now: Date): void {
    const event = this.events.find((candidate) => candidate.slug === entry.eventSlug);
    if (!event) return;
    const at = event.primaryDeadlineAt ?? now.toISOString();
    getOrCreate(this.trackerEntries, userId, () => new Map<string, TrackerEntry>()).set(event.id, {
      id: `tracker-${userId}-${event.id}`,
      status: entry.status,
      notes: null,
      createdAt: at,
      updatedAt: at,
      achievement: entry.achievement,
      achievementNote: entry.achievementNote ?? null,
      proofUrl: entry.proofUrl ?? null,
      portfolioVisible: entry.portfolioVisible ?? null,
    });
  }

  /**
   * Satu kali masuk demo = satu POST yang menulis puluhan baris (koneksi,
   * notifikasi, portofolio, hak kelola acara) ke memori proses bersama. Tanpa
   * batas, skrip yang mengulang masuk demo menghabiskan memori server pratinjau
   * jauh sebelum reset 6 jam (`DEMO_DATA_TTL_MS`). Batasnya per identitas, bukan
   * per IP: di belakang `next start` semua penguji lokal berbagi satu IP.
   * Identitas yang sudah pernah diisi tetap boleh diisi ulang (masuk ulang).
   */
  private admitDemoSeed(userId: string): boolean {
    if (this.demoSeededUsers.has(userId)) return true;
    if (this.demoSeededUsers.size >= this.demoSeedLimit) return false;
    this.demoSeededUsers.add(userId);
    return true;
  }

  /** Riwayat awal persona demo "Mahasiswa" (ADR-046). Hanya mode seed. */
  seedDemoPortfolio(userId: string, now: Date = new Date()): void {
    if (!this.admitDemoSeed(userId)) return;
    for (const entry of DEMO_STARTER_PORTFOLIO) this.seedPortfolioEntry(userId, entry, now);
  }

  /** Jaringan awal persona demo "Mahasiswa". Hanya mode seed — tidak ada padanannya di produksi. */
  seedDemoNetwork(userId: string, now: Date = new Date()): void {
    if (!this.admitDemoSeed(userId)) return;
    const stamp = (daysAgo: number) => isoOffsetDays(-daysAgo, now);
    DEMO_STARTER_NETWORK.accepted.forEach((peerId, index) => {
      const id = this.nextId();
      this.connections.set(id, { id, requesterId: peerId, addresseeId: userId, status: 'ACCEPTED', message: null, createdAt: stamp(index + 8), respondedAt: stamp(index + 6) });
    });
    DEMO_STARTER_NETWORK.incoming.forEach(({ userId: peerId, message }, index) => {
      const id = this.nextId();
      this.connections.set(id, { id, requesterId: peerId, addresseeId: userId, status: 'PENDING', message, createdAt: stamp(index), respondedAt: null });
      const name = this.people.get(peerId)?.person.fullName ?? 'Seseorang';
      this.notify(userId, { id: `notif-connection-${id}`, type: 'CONNECTION_REQUEST', message: `${name} ingin terhubung denganmu.` });
    });
    DEMO_STARTER_NETWORK.outgoing.forEach((peerId, index) => {
      const id = this.nextId();
      this.connections.set(id, { id, requesterId: userId, addresseeId: peerId, status: 'PENDING', message: null, createdAt: stamp(index + 1), respondedAt: null });
    });
  }

  async getNetworkProfile(userId: string): Promise<NetworkProfile> {
    const member = this.people.get(userId);
    return { discoverable: member?.discoverable ?? false, headline: member?.person.headline ?? null };
  }

  async updateNetworkProfile(actor: NetworkViewer, input: NetworkProfileInput): Promise<void> {
    const member = this.rememberActor(actor);
    this.people.set(actor.id, {
      person: { ...member.person, headline: input.headline },
      discoverable: input.discoverable,
      updatedAt: new Date().toISOString(),
    });
  }

  async listConnections(userId: string, page: ConnectionPageRequest): Promise<ConnectionPage> {
    const limit = clampConnectionLimit(page.limit);
    const after = page.cursor === null ? null : decodeConnectionCursor(page.cursor);
    if (page.cursor !== null && !after) throw actionError('invalid_request');

    const result: Connection[] = [];
    for (const entry of this.connections.values()) {
      const outgoing = entry.requesterId === userId;
      if (!outgoing && entry.addresseeId !== userId) continue;
      const peer = this.people.get(outgoing ? entry.addresseeId : entry.requesterId);
      if (!peer) continue;
      result.push({
        id: entry.id,
        person: peer.person,
        status: entry.status,
        direction: outgoing ? 'outgoing' : 'incoming',
        message: entry.message,
        createdAt: entry.createdAt,
        respondedAt: entry.respondedAt,
      });
    }
    const rest = result
      .filter((connection) => matchesConnectionFilter(connection, page))
      .sort(compareConnections)
      .filter((connection) => !after || compareConnections(connection, after) > 0);
    const items = rest.slice(0, limit);
    const last = items.at(-1);
    return { items, nextCursor: rest.length > limit && last ? encodeConnectionCursor(connectionCursorOf(last)) : null };
  }

  async countConnections(userId: string): Promise<ConnectionCounts> {
    const counts = { accepted: 0, incoming: 0, outgoing: 0 };
    for (const entry of this.connections.values()) {
      if (entry.requesterId !== userId && entry.addresseeId !== userId) continue;
      if (entry.status === 'ACCEPTED') counts.accepted += 1;
      else if (entry.addresseeId === userId) counts.incoming += 1;
      else counts.outgoing += 1;
    }
    return counts;
  }

  async suggestPeople(viewer: NetworkViewer, filter: PeopleFilter): Promise<readonly PeopleSuggestion[]> {
    const related = new Set<string>([viewer.id]);
    for (const entry of this.connections.values()) {
      if (entry.requesterId === viewer.id) related.add(entry.addresseeId);
      if (entry.addresseeId === viewer.id) related.add(entry.requesterId);
    }
    const viewerPeers = this.acceptedPeers(viewer.id);
    const viewerEventIds = new Set(filter.viewerEvents.map((event) => event.id));

    const candidates = [...this.people.values()]
      .filter((member) => member.discoverable && !related.has(member.person.userId) && !this.isBlocked(viewer.id, member.person.userId))
      .filter((member) => !filter.interest || member.person.interests.includes(filter.interest))
      .filter((member) => matchesPeopleSearch(member.person, filter.search))
      .map((member) => {
        const peers = this.acceptedPeers(member.person.userId);
        return {
          person: member.person,
          mutualCount: [...peers].filter((peer) => viewerPeers.has(peer)).length,
          sharedEvents: this.teamEventsOf(member.person.userId).filter((event) => viewerEventIds.has(event.id)),
        };
      });
    return rankSuggestions(viewer, candidates, filter.limit);
  }

  async requestConnection(actor: NetworkViewer, targetId: string, message: string | null): Promise<'requested' | 'accepted'> {
    if (actor.id === targetId) throw actionError('connection_self');
    // Kode yang sama dengan "tersembunyi": yang diblokir tidak boleh bisa
    // menyimpulkan bahwa ia diblokir dari pesan galat.
    if (this.isBlocked(actor.id, targetId)) throw actionError('person_unavailable');
    const actorMember = this.rememberActor(actor);

    const existing = this.findPair(actor.id, targetId);
    if (existing) {
      if (existing.status === 'PENDING' && existing.addresseeId === actor.id) {
        await this.respondToConnection(actor.id, existing.id, 'accept');
        return 'accepted';
      }
      throw actionError('connection_exists');
    }
    const target = this.people.get(targetId);
    if (!target?.discoverable) throw actionError('person_unavailable');
    if (!this.rateLimiter.consume(`connection:${actor.id}`, CONNECTION_RATE_LIMIT.perDay, 86_400)) {
      throw actionError('connection_rate_limited');
    }

    const id = this.nextId();
    this.connections.set(id, { id, requesterId: actor.id, addresseeId: targetId, status: 'PENDING', message, createdAt: new Date().toISOString(), respondedAt: null });
    this.notify(targetId, { id: `notif-connection-${id}`, type: 'CONNECTION_REQUEST', message: `${actorMember.person.fullName} ingin terhubung denganmu.` });
    return 'requested';
  }

  async respondToConnection(actorId: string, connectionId: string, decision: 'accept' | 'decline'): Promise<void> {
    const entry = this.connections.get(connectionId);
    if (!entry || (entry.requesterId !== actorId && entry.addresseeId !== actorId)) throw actionError('connection_not_found');
    if (entry.addresseeId !== actorId) throw actionError('connection_forbidden');
    if (entry.status !== 'PENDING') return;

    if (decision === 'decline') {
      this.connections.delete(connectionId);
      return;
    }
    entry.status = 'ACCEPTED';
    entry.respondedAt = new Date().toISOString();
    const name = this.people.get(actorId)?.person.fullName ?? 'Seseorang';
    this.notify(entry.requesterId, { id: `notif-connection-accepted-${entry.id}`, type: 'CONNECTION_ACCEPTED', message: `${name} menerima ajakan koneksimu.` });
  }

  async removeConnection(actorId: string, connectionId: string): Promise<void> {
    const entry = this.connections.get(connectionId);
    if (!entry || (entry.requesterId !== actorId && entry.addresseeId !== actorId)) throw actionError('connection_not_found');
    this.connections.delete(connectionId);
  }

  async blockPerson(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) throw actionError('block_self');
    const mine = getOrCreate(this.blocks, actorId, () => new Map<string, string>());
    if (mine.has(targetId)) return;
    const pair = this.findPair(actorId, targetId);
    if (!pair && !this.people.get(targetId)?.discoverable) throw actionError('block_unavailable');

    mine.set(targetId, new Date().toISOString());
    if (pair) this.connections.delete(pair.id);
  }

  async unblockPerson(actorId: string, targetId: string): Promise<void> {
    if (!this.blocks.get(actorId)?.delete(targetId)) throw actionError('block_not_found');
  }

  async listBlockedPeople(userId: string): Promise<readonly BlockedPerson[]> {
    return [...(this.blocks.get(userId) ?? new Map<string, string>())]
      .map(([blockedId, blockedAt]) => ({ userId: blockedId, fullName: this.people.get(blockedId)?.person.fullName ?? 'Pengguna', blockedAt }))
      .sort((a, b) => b.blockedAt.localeCompare(a.blockedAt) || a.userId.localeCompare(b.userId))
      .slice(0, BLOCK_LIST_LIMIT);
  }

  async listTeamLinks(userIds: readonly string[], limit: number): Promise<readonly TeamLink[]> {
    const wanted = new Set(userIds);
    const links: TeamLink[] = [];
    for (const team of this.teams.values()) {
      const event = this.findEvent(team.eventId);
      if (!event || !isPubliclyVisible(event)) continue;
      for (const member of team.members) {
        if (!wanted.has(member.userId)) continue;
        links.push({ userId: member.userId, teamId: team.id, event: { id: event.id, slug: event.slug, title: event.title, eventType: event.eventType } });
      }
    }
    return links.slice(0, limit);
  }

  // ------------------------------------------------------------------
  // Penyelenggara & analitik (ADR-042/043)
  //
  // Cermin migration 20260928110001 & 20260928120001: status hanya dari
  // admin, ganti identitas = verifikasi ulang, REVOKED tidak bisa mengajukan
  // ulang, hak kelola berlaku hanya selama VERIFIED, perubahan acara lewat
  // antrean, setiap keputusan masuk log.
  // ------------------------------------------------------------------

  private isVerifiedOrganizer(userId: string): boolean {
    return this.organizers.get(userId)?.status === 'VERIFIED';
  }

  /** Cermin `manages_event()`: mengelola DAN masih terverifikasi. */
  private managesEvent(userId: string, eventId: string): boolean {
    return this.isVerifiedOrganizer(userId) && Boolean(this.eventManagers.get(eventId)?.has(userId));
  }

  private eventRefOf(eventId: string): Pick<EventSummary, 'id' | 'slug' | 'title' | 'organizer'> {
    const event = this.findEvent(eventId);
    return event
      ? { id: event.id, slug: event.slug, title: event.title, organizer: event.organizer }
      : { id: eventId, slug: '', title: '(acara dihapus)', organizer: '' };
  }

  private toClaim(entry: ClaimEntry): EventClaim {
    return {
      id: entry.id,
      event: this.eventRefOf(entry.eventId),
      userId: entry.userId,
      orgName: this.organizers.get(entry.userId)?.orgName ?? null,
      evidence: entry.evidence,
      status: entry.status,
      reviewNote: entry.reviewNote,
      createdAt: entry.createdAt,
    };
  }

  private toRevision(entry: RevisionEntry): EventRevision {
    return {
      id: entry.id,
      event: this.eventRefOf(entry.eventId),
      proposedBy: entry.proposedBy,
      orgName: this.organizers.get(entry.proposedBy)?.orgName ?? null,
      changes: entry.changes,
      note: entry.note,
      status: entry.status,
      reviewNote: entry.reviewNote,
      createdAt: entry.createdAt,
    };
  }

  async getOrganizerProfile(userId: string): Promise<OrganizerProfile | null> {
    return this.organizers.get(userId) ?? null;
  }

  async applyAsOrganizer(actor: OrganizerActor, input: OrganizerApplicationInput): Promise<void> {
    const existing = this.organizers.get(actor.id);
    if (existing?.status === 'REVOKED') throw actionError('organizer_revoked');
    const unchanged =
      existing && existing.orgName === input.orgName && existing.website === input.website && existing.evidence === input.evidence;
    if (unchanged) return;
    if (!this.rateLimiter.consume(`organizer:${actor.id}`, ORGANIZER_RATE_LIMITS.profileWritesPerDay, 86_400)) {
      throw actionError('organizer_rate_limited');
    }

    this.organizers.set(actor.id, {
      userId: actor.id,
      orgName: input.orgName,
      website: input.website,
      evidence: input.evidence,
      status: 'PENDING',
      reviewNote: null,
      reviewedAt: null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      applicant: { fullName: actor.fullName, email: actor.email },
    });
    if (existing && existing.status !== 'PENDING') {
      this.logModeration({
        subjectType: 'organizer',
        subjectId: actor.id,
        title: input.orgName,
        fromStatus: existing.status,
        toStatus: 'PENDING',
        actor: { reviewerId: null },
        reason: existing.status === 'VERIFIED' ? 'Data lembaga diubah pemiliknya — perlu verifikasi ulang' : null,
      });
    }
  }

  async listManagedEvents(userId: string): Promise<readonly ManagedEvent[]> {
    if (!this.isVerifiedOrganizer(userId)) return [];
    const managed: ManagedEvent[] = [];
    for (const [eventId, managers] of this.eventManagers) {
      const entry = managers.get(userId);
      const event = this.findEvent(eventId);
      if (entry && event) managed.push({ event, source: entry.source, since: entry.since });
    }
    return managed.sort((a, b) => b.since.localeCompare(a.since));
  }

  /** Cermin `organizer_event_history()`: kelolaan, sudah tutup, angka seumur acara. */
  async listOrganizerHistory(userId: string, now: Date = new Date()): Promise<readonly OrganizerHistoryEntry[]> {
    if (!this.isVerifiedOrganizer(userId)) return [];
    const history: OrganizerHistoryEntry[] = [];
    for (const [eventId, managers] of this.eventManagers) {
      const event = this.findEvent(eventId);
      if (!managers.has(userId) || !event) continue;
      const closed =
        event.status === 'EXPIRED' ||
        (event.status === 'APPROVED' && event.primaryDeadlineAt !== null && new Date(event.primaryDeadlineAt) < now);
      if (!closed) continue;

      let views = 0;
      let visitors = 0;
      for (const [key, stats] of this.dailyStats) {
        if (!key.startsWith(`${eventId}|`)) continue;
        views += stats.views;
        visitors += stats.visitors;
      }
      const signals = [...this.recommendationSignals, ...this.demoAnalyticsSignals].filter((signal) => signal.eventId === eventId);
      let applied = 0;
      for (const entries of this.trackerEntries.values()) {
        const status = entries.get(eventId)?.status;
        if (status && isPortfolioStatus(status)) applied += 1;
      }
      history.push({
        eventId,
        slug: event.slug,
        title: event.title,
        eventType: event.eventType,
        status: event.status,
        closedAt: event.primaryDeadlineAt,
        views,
        visitors,
        saves: [...this.savedEvents.values()].filter((saved) => saved.has(eventId)).length + signals.filter((signal) => signal.kind === 'save').length,
        clicks: signals.filter((signal) => signal.kind === 'register_click').length,
        applied,
      });
    }
    return history.sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')).slice(0, 50);
  }

  async claimEvent(actorId: string, eventId: string, evidence: string): Promise<void> {
    if (!this.isVerifiedOrganizer(actorId)) throw actionError('organizer_not_verified');
    const event = this.findEvent(eventId);
    if (!event || !isPubliclyVisible(event)) throw actionError('event_unavailable');
    if (this.eventManagers.get(eventId)?.has(actorId)) throw actionError('claim_already_managed');
    const pending = [...this.claims.values()].some(
      (claim) => claim.eventId === eventId && claim.userId === actorId && claim.status === 'PENDING',
    );
    if (pending) throw actionError('claim_exists');
    if (!this.rateLimiter.consume(`event-claim:${actorId}`, ORGANIZER_RATE_LIMITS.claimsPerDay, 86_400)) {
      throw actionError('organizer_rate_limited');
    }
    const id = this.nextId();
    this.claims.set(id, { id, eventId, userId: actorId, evidence, status: 'PENDING', reviewNote: null, createdAt: new Date().toISOString() });
  }

  async listMyClaims(userId: string): Promise<readonly EventClaim[]> {
    return [...this.claims.values()]
      .filter((claim) => claim.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((claim) => this.toClaim(claim));
  }

  async proposeEventRevision(actorId: string, eventId: string, changes: EventRevisionChanges, note: string | null): Promise<void> {
    if (!this.managesEvent(actorId, eventId)) throw actionError('not_event_manager');
    if (!this.rateLimiter.consume(`event-revision:${actorId}`, ORGANIZER_RATE_LIMITS.revisionsPerDay, 86_400)) {
      throw actionError('organizer_rate_limited');
    }
    const id = this.nextId();
    this.revisions.set(id, { id, eventId, proposedBy: actorId, changes, note, status: 'PENDING', reviewNote: null, createdAt: new Date().toISOString() });
  }

  async listEventRevisions(actorId: string, eventId: string): Promise<readonly EventRevision[]> {
    return [...this.revisions.values()]
      .filter((revision) => revision.eventId === eventId && revision.proposedBy === actorId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((revision) => this.toRevision(revision));
  }

  async getEventAnalytics(actorId: string, eventId: string, days: number): Promise<EventAnalytics> {
    if (!this.managesEvent(actorId, eventId)) throw actionError('not_event_manager');
    const event = this.findEvent(eventId);
    if (!event) throw actionError('not_event_manager');

    const span = Math.min(Math.max(Math.trunc(days) || 30, 7), 90);
    const now = Date.now();
    const dayKeys = Array.from({ length: span }, (_, index) => jakartaDateKey(new Date(now - (span - 1 - index) * MS_PER_DAY)));
    const signals = [...this.recommendationSignals, ...this.demoAnalyticsSignals].filter((signal) => signal.eventId === eventId);
    const signalsOn = (kind: RecommendationSignalInput['kind'], key: string) =>
      signals.filter((signal) => signal.kind === kind && jakartaDateKey(new Date(signal.createdAt)) === key).length;

    const series = dayKeys.map((key) => {
      const stats = this.dailyStats.get(`${eventId}|${key}`);
      return { day: key, views: stats?.views ?? 0, visitors: stats?.visitors ?? 0, saves: signalsOn('save', key), clicks: signalsOn('register_click', key) };
    });

    let views = 0;
    let visitors = 0;
    for (const [key, stats] of this.dailyStats) {
      if (!key.startsWith(`${eventId}|`)) continue;
      views += stats.views;
      visitors += stats.visitors;
    }
    let applied = 0;
    for (const entries of this.trackerEntries.values()) {
      const status = entries.get(eventId)?.status;
      if (status === 'APPLIED' || status === 'INTERVIEW' || status === 'ACCEPTED') applied += 1;
    }

    // Mode seed tidak punya tabel users: audiens dari salinan profil di sinyal
    // simpan (produksi: profil penyimpan saat ini). Ambang k-anonimitas sama.
    const savers = signals.filter((signal) => signal.kind === 'save');
    const levelCounts = new Map<string, number>();
    const interestCounts = new Map<string, number>();
    for (const signal of savers) {
      if (signal.educationLevel) levelCounts.set(signal.educationLevel, (levelCounts.get(signal.educationLevel) ?? 0) + 1);
      for (const interest of signal.interests) interestCounts.set(interest, (interestCounts.get(interest) ?? 0) + 1);
    }
    const levels = kAnonymize(levelCounts);
    const interests = kAnonymize(interestCounts, 8);

    const peerTotals: number[] = [];
    for (const other of this.events) {
      if (other.id === eventId || other.eventType !== event.eventType) continue;
      let total = 0;
      let seen = false;
      for (const key of dayKeys) {
        const stats = this.dailyStats.get(`${other.id}|${key}`);
        if (stats) {
          total += stats.views;
          seen = true;
        }
      }
      if (seen) peerTotals.push(total);
    }
    peerTotals.sort((a, b) => a - b);
    const mid = Math.floor(peerTotals.length / 2);
    const medianViews =
      peerTotals.length === 0 ? 0 : peerTotals.length % 2 ? peerTotals[mid]! : (peerTotals[mid - 1]! + peerTotals[mid]!) / 2;

    return {
      days: span,
      series,
      totals: {
        views,
        visitors,
        saves: [...this.savedEvents.values()].filter((saved) => saved.has(eventId)).length +
          this.demoAnalyticsSignals.filter((signal) => signal.eventId === eventId && signal.kind === 'save').length,
        clicks: signals.filter((signal) => signal.kind === 'register_click').length,
        applied,
      },
      audience: { minGroup: ANALYTICS_MIN_GROUP, levels: levels.buckets, interests: interests.buckets, hidden: levels.hidden },
      benchmark: { medianViews, peers: peerTotals.length },
    };
  }

  async recordEventView(eventId: string, visitorHash: string): Promise<void> {
    const event = this.findEvent(eventId);
    if (!event || !isPubliclyVisible(event)) return;
    const day = jakartaDateKey(new Date());
    const dedupKey = `${eventId}|${day}|${visitorHash}`;
    const isNew = !this.viewDedup.has(dedupKey);
    if (isNew) this.viewDedup.add(dedupKey);
    const stats = getOrCreate(this.dailyStats, `${eventId}|${day}`, () => ({ views: 0, visitors: 0 }));
    stats.views += 1;
    if (isNew) stats.visitors += 1;
  }

  async listVerifiedOrganizers(eventIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const result = new Map<string, string>();
    for (const eventId of eventIds) {
      const event = this.findEvent(eventId);
      if (!event || !isPubliclyVisible(event)) continue;
      for (const userId of this.eventManagers.get(eventId)?.keys() ?? []) {
        const profile = this.organizers.get(userId);
        if (profile?.status === 'VERIFIED') {
          result.set(eventId, profile.orgName);
          break;
        }
      }
    }
    return result;
  }

  async listOrganizerApplications(status: OrganizerStatus, limit: number): Promise<readonly OrganizerProfile[]> {
    return [...this.organizers.values()]
      .filter((profile) => profile.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }

  async reviewOrganizer({
    userId,
    decision,
    reviewerId,
    reviewerName,
    note,
  }: ReviewTrustInput<'VERIFIED' | 'REJECTED' | 'REVOKED'> & { userId: string }): Promise<void> {
    const profile = this.organizers.get(userId);
    if (!profile) throw actionError('organizer_not_found');
    const allowed =
      (profile.status === 'PENDING' && (decision === 'VERIFIED' || decision === 'REJECTED')) ||
      (profile.status === 'VERIFIED' && decision === 'REVOKED');
    if (!allowed) throw actionError('organizer_invalid_transition');

    const reviewNote = note?.trim().slice(0, 500) || null;
    this.organizers.set(userId, { ...profile, status: decision, reviewNote, reviewedAt: new Date().toISOString() });
    this.notify(userId, {
      id: `notif-organizer-${userId}-${this.moderationLog.length}`,
      type: `ORGANIZER_${decision}`,
      message:
        decision === 'VERIFIED'
          ? `${profile.orgName} kini terverifikasi sebagai penyelenggara. Kiriman & klaim acaramu mendapat lencana terverifikasi.`
          : decision === 'REJECTED'
            ? 'Pengajuan penyelenggara belum bisa diverifikasi. Lengkapi bukti peranmu, lalu ajukan ulang.'
            : 'Status penyelenggara terverifikasi akunmu dicabut. Hubungi moderator bila ini keliru.',
    });
    this.logModeration({
      subjectType: 'organizer',
      subjectId: userId,
      title: profile.orgName,
      fromStatus: profile.status,
      toStatus: decision,
      actor: { reviewerId, reviewerName },
      reason: reviewNote,
    });
  }

  async listClaims(status: TrustRequestStatus, limit: number): Promise<readonly EventClaim[]> {
    return [...this.claims.values()]
      .filter((claim) => claim.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map((claim) => this.toClaim(claim));
  }

  async reviewClaim({
    claimId,
    decision,
    reviewerId,
    reviewerName,
    note,
  }: ReviewTrustInput<'APPROVED' | 'REJECTED'> & { claimId: string }): Promise<void> {
    const claim = this.claims.get(claimId);
    if (!claim || claim.status !== 'PENDING') throw actionError('claim_not_found');
    if (decision === 'APPROVED' && !this.isVerifiedOrganizer(claim.userId)) throw actionError('organizer_not_verified');

    const reviewNote = note?.trim().slice(0, 500) || null;
    this.claims.set(claimId, { ...claim, status: decision, reviewNote });
    if (decision === 'APPROVED') {
      const managers = getOrCreate(this.eventManagers, claim.eventId, () => new Map());
      if (!managers.has(claim.userId)) managers.set(claim.userId, { source: 'CLAIM', since: new Date().toISOString() });
    }
    const title = this.eventRefOf(claim.eventId).title;
    this.notify(claim.userId, {
      id: `notif-claim-${claimId}`,
      type: `CLAIM_${decision}`,
      message:
        decision === 'APPROVED'
          ? `Klaim "${title}" disetujui. Acara ini kini muncul di dasbor penyelenggaramu.`
          : `Klaim "${title}" belum bisa disetujui moderator.`,
    });
    this.logModeration({
      subjectType: 'claim',
      subjectId: claimId,
      title: `Klaim: ${title}`,
      fromStatus: 'PENDING',
      toStatus: decision,
      actor: { reviewerId, reviewerName },
      reason: reviewNote,
    });
  }

  async listRevisions(status: TrustRequestStatus, limit: number): Promise<readonly EventRevision[]> {
    return [...this.revisions.values()]
      .filter((revision) => revision.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map((revision) => this.toRevision(revision));
  }

  async reviewRevision({
    revisionId,
    decision,
    reviewerId,
    reviewerName,
    note,
  }: ReviewTrustInput<'APPROVED' | 'REJECTED'> & { revisionId: string }): Promise<void> {
    const revision = this.revisions.get(revisionId);
    if (!revision || revision.status !== 'PENDING') throw actionError('revision_not_found');

    if (decision === 'APPROVED') {
      const { changes } = revision;
      // Validasi ulang seperti review_event_revision(): baris antrean bisa
      // berasal dari klien mana pun yang memegang sesi pengelola.
      const linkOk = changes.registrationLink === undefined || /^https:\/\/\S+$/i.test(changes.registrationLink);
      const deadlineOk = changes.deadlineAt === undefined || new Date(changes.deadlineAt).getTime() > Date.now();
      if (!this.managesEvent(revision.proposedBy, revision.eventId) || !linkOk || !deadlineOk) {
        throw actionError('revision_rejected_by_db');
      }
      const before = this.findEvent(revision.eventId);
      const reopen = Boolean(changes.deadlineAt && before?.status === 'EXPIRED');
      this.updateEvent(revision.eventId, (event) => ({
        ...event,
        ...('description' in changes ? { description: changes.description ?? null } : {}),
        ...(changes.registrationLink !== undefined ? { registrationLink: changes.registrationLink } : {}),
        ...('location' in changes ? { location: changes.location ?? null } : {}),
        ...(changes.isOnline !== undefined ? { isOnline: changes.isOnline } : {}),
        ...(changes.educationLevels !== undefined ? { educationLevels: [...changes.educationLevels] } : {}),
        ...(changes.deadlineAt !== undefined
          ? {
              primaryDeadlineAt: changes.deadlineAt,
              deadlines: event.deadlines.map((deadline) => (deadline.isPrimary ? { ...deadline, deadlineAt: changes.deadlineAt! } : deadline)),
            }
          : {}),
        ...(reopen ? { status: 'APPROVED' as const } : {}),
      }));
      if (reopen && before) {
        this.logModeration({
          subjectType: 'event',
          subjectId: before.id,
          title: before.title,
          fromStatus: 'EXPIRED',
          toStatus: 'APPROVED',
          actor: { reviewerId, reviewerName },
          reason: null,
        });
      }
    }

    const reviewNote = note?.trim().slice(0, 500) || null;
    this.revisions.set(revisionId, { ...revision, status: decision, reviewNote });
    const title = this.eventRefOf(revision.eventId).title;
    this.notify(revision.proposedBy, {
      id: `notif-revision-${revisionId}`,
      type: `REVISION_${decision}`,
      message:
        decision === 'APPROVED'
          ? `Perubahan untuk "${title}" sudah diterapkan.`
          : `Perubahan untuk "${title}" belum bisa diterapkan moderator.`,
    });
    this.logModeration({
      subjectType: 'revision',
      subjectId: revisionId,
      title: `Perubahan: ${title}`,
      fromStatus: 'PENDING',
      toStatus: decision,
      actor: { reviewerId, reviewerName },
      reason: reviewNote,
    });
  }

  async listOrganizerStatuses(
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, Pick<OrganizerProfile, 'orgName' | 'status'>>> {
    const result = new Map<string, Pick<OrganizerProfile, 'orgName' | 'status'>>();
    for (const userId of userIds) {
      const profile = this.organizers.get(userId);
      if (profile) result.set(userId, { orgName: profile.orgName, status: profile.status });
    }
    return result;
  }

  /**
   * Persona demo "Penyelenggara": terverifikasi, mengelola tiga acara contoh,
   * dengan riwayat 90 hari yang DETERMINISTIK (angka sama setiap reset) supaya
   * dasbor bisa dinilai. Hanya mode seed — tidak ada padanannya di produksi.
   */
  seedDemoOrganizer(user: { id: string; fullName: string; email: string }, now: Date = new Date()): void {
    if (!this.admitDemoSeed(user.id)) return;
    const since = new Date(now.getTime() - 60 * MS_PER_DAY).toISOString();
    this.organizers.set(user.id, {
      userId: user.id,
      orgName: 'Himpunan Mahasiswa Informatika (contoh)',
      website: 'https://example.org/himpunan',
      evidence: 'Akun demo — lembaga fiktif untuk mencoba dasbor penyelenggara.',
      status: 'VERIFIED',
      reviewNote: null,
      reviewedAt: since,
      createdAt: since,
      applicant: { fullName: user.fullName, email: user.email },
    });

    // Tiga acara yang masih buka + satu yang sudah selesai (bahan "Riwayat acara").
    const managed = [
      ...this.events.filter((event) => event.status === 'APPROVED').slice(0, 3),
      ...this.events.filter((event) => event.status === 'EXPIRED').slice(0, 1),
    ];
    let seed = 42;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const levels = ['D4_S1', 'D4_S1', 'D4_S1', 'D3', 'SMA_SMK', 'S2'] as const;
    const interestPool = ['teknologi', 'desain', 'bisnis', 'sains'];

    // Setiap masuk demo memanggil ini lagi; tanpa dibuang dulu, angka simpan &
    // klik berlipat tiap login sementara pengunjung (Map) tetap — rasio kacau.
    const managedIds = new Set(managed.map((event) => event.id));
    const kept = this.demoAnalyticsSignals.filter((signal) => !managedIds.has(signal.eventId));
    this.demoAnalyticsSignals.splice(0, this.demoAnalyticsSignals.length, ...kept);

    managed.forEach((event, eventIndex) => {
      getOrCreate(this.eventManagers, event.id, () => new Map()).set(user.id, {
        source: eventIndex === 0 ? 'SUBMISSION' : 'CLAIM',
        since,
      });
      const scale = [1, 0.55, 0.3][eventIndex] ?? 0.3;
      for (let back = 89; back >= 0; back -= 1) {
        const date = new Date(now.getTime() - back * MS_PER_DAY);
        // Kurva wajar: naik mendekati tenggat, sedikit lebih ramai di hari kerja.
        const ramp = 1 + (89 - back) / 45;
        const weekday = [0.7, 1.1, 1.15, 1.1, 1.05, 0.95, 0.75][date.getUTCDay()] ?? 1;
        const visitorsToday = Math.round((18 + random() * 22) * ramp * weekday * scale);
        const key = `${event.id}|${jakartaDateKey(date)}`;
        this.dailyStats.set(key, { views: Math.round(visitorsToday * (1.25 + random() * 0.35)), visitors: visitorsToday });

        const saves = Math.round(visitorsToday * (0.07 + random() * 0.05));
        const clicks = Math.round(visitorsToday * (0.03 + random() * 0.03));
        for (let s = 0; s < saves + clicks; s += 1) {
          this.demoAnalyticsSignals.push({
            eventId: event.id,
            kind: s < saves ? 'save' : 'register_click',
            userId: null,
            interests: interestPool.filter(() => random() < 0.45),
            educationLevel: levels[Math.floor(random() * levels.length)] ?? 'D4_S1',
            createdAt: date.toISOString(),
          });
        }
      }
    });

    // Pembanding "acara sejenis": acara lain berjenis sama punya riwayat juga.
    for (const other of this.events.filter((event) => event.status === 'APPROVED' && !managed.includes(event)).slice(0, 12)) {
      for (let back = 89; back >= 0; back -= 1) {
        const date = new Date(now.getTime() - back * MS_PER_DAY);
        const key = `${other.id}|${jakartaDateKey(date)}`;
        if (this.dailyStats.has(key)) continue;
        const visitorsToday = Math.round(8 + random() * 20);
        this.dailyStats.set(key, { views: Math.round(visitorsToday * 1.3), visitors: visitorsToday });
      }
    }
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
