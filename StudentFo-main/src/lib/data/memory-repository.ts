import { getDeadlineState } from '@/lib/deadline';
import { forbidden, notFound, validationFailed } from '@/lib/errors';
import { buildDeadlineMessage, notificationTypeForDeadline } from '@/lib/notifications';
import { rankEvents } from '@/lib/recommendation';
import type {
  AppNotification,
  Category,
  EventDetail,
  EventQuery,
  EventStatus,
  EventSummary,
  Paginated,
  Team,
  TeamMember,
  TrackerItem,
  TrackerStatus,
  UserProfile,
} from '@/types/domain';
import {
  type CreateTeamRepositoryInput,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type EventRepository,
  type RepositoryStats,
  type ReviewEventInput,
} from './repository';
import { SEED_CATEGORIES, SEED_EVENTS, type SeedEvent } from './seed-data';

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
  private readonly trackerEntries = new Map<
    string,
    Map<
      string,
      {
        id: string;
        status: TrackerStatus;
        notes: string | null;
        createdAt: string;
        updatedAt: string;
      }
    >
  >();
  /** userId -> id notifikasi yang sudah ditandai dibaca. */
  private readonly readNotifications = new Map<string, Set<string>>();
  private readonly teams = new Map<
    string,
    {
      id: string;
      eventId: string;
      createdBy: string;
      title: string;
      description: string | null;
      slotsNeeded: number;
      createdAt: string;
      members: TeamMember[];
    }
  >();
  private teamCounter = 0;

  constructor(base: Date = new Date()) {
    this.events = SEED_EVENTS.map((seed) => buildDetail(seed, base));
    this.seedTeams(base);
  }

  /**
   * Dua tim contoh supaya /teams tidak tampil kosong di mode seed.
   *
   * Halaman daftar yang selalu kosong tidak bisa dipakai menilai apa pun —
   * tata letak kartunya, perilaku "tim penuh", maupun tombol gabung. Sama
   * seperti mutasi moderasi, tim contoh ini hanya hidup selama proses
   * berjalan dan tidak pernah menyentuh database.
   */
  private seedTeams(base: Date): void {
    const openEvents = this.events.filter((event) => event.status === 'APPROVED');
    const samples = [
      {
        title: 'Cari 2 anggota untuk tim hackathon',
        description:
          'Sudah ada 1 backend dan 1 desainer. Butuh satu orang frontend dan satu lagi yang kuat di analisis data. Rencana kerja: daring, dua kali seminggu.',
        slotsNeeded: 4,
        leader: { userId: 'seed-user-1', fullName: 'Rani Prameswari' },
        members: [{ userId: 'seed-user-2', fullName: 'Dimas Arya' }],
      },
      {
        title: 'Tim karya tulis ilmiah — tema energi terbarukan',
        description:
          'Fokus ke potensi mikrohidro di Jawa Barat. Mencari rekan yang terbiasa menulis akademik dan satu orang untuk olah data lapangan.',
        slotsNeeded: 3,
        leader: { userId: 'seed-user-3', fullName: 'Bagas Nugroho' },
        members: [],
      },
    ];

    samples.forEach((sample, index) => {
      const event = openEvents[index];
      if (!event) return;

      this.teamCounter += 1;
      const id = `team-${this.teamCounter}`;
      const createdAt = isoOffsetDays(-(index + 2), base);

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
          ...sample.members.map((member) => ({
            ...member,
            role: 'member' as const,
            joinedAt: createdAt,
          })),
        ],
      });
    });
  }

  private publicEvents(includeClosed: boolean, now: Date): EventDetail[] {
    return this.events.filter((event) => {
      if (event.status !== 'APPROVED' && event.status !== 'EXPIRED') return false;
      if (includeClosed) return true;
      return getDeadlineState(event.primaryDeadlineAt, now).urgency !== 'closed';
    });
  }

  async listEvents(query: EventQuery): Promise<Paginated<EventSummary>> {
    const now = new Date();
    const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = Math.max(query.page ?? 1, 1);

    let results = this.publicEvents(query.includeClosed ?? false, now);

    if (query.search?.trim()) {
      const search = query.search;
      results = results.filter((event) => matchesSearch(event, search));
    }
    if (query.types?.length) {
      results = results.filter((event) => query.types!.includes(event.eventType));
    }
    if (query.categories?.length) {
      results = results.filter((event) => hasOverlap(query.categories!, event.categorySlugs));
    }
    if (query.levels?.length) {
      results = results.filter((event) => hasOverlap(query.levels!, event.educationLevels));
    }

    const sorted = sortSummaries(results, query.sort ?? 'relevance', now, query.profile);
    const total = sorted.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return {
      items: sorted.slice(start, start + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  async getEventBySlug(slug: string): Promise<EventDetail | null> {
    const event = this.events.find((candidate) => candidate.slug === slug);
    if (!event) return null;
    // Entri PENDING/REJECTED tidak boleh bocor lewat tebakan slug.
    if (event.status !== 'APPROVED' && event.status !== 'EXPIRED') return null;
    return event;
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

  async listByStatus(status: EventStatus, limit: number): Promise<readonly EventSummary[]> {
    return this.events.filter((event) => event.status === status).slice(0, limit);
  }

  async reviewEvent({ eventId, decision }: ReviewEventInput): Promise<void> {
    const index = this.events.findIndex((event) => event.id === eventId);
    if (index === -1) return;
    const current = this.events[index];
    if (!current) return;
    this.events[index] = { ...current, status: decision };
  }

  async isEventSaved(userId: string, eventId: string): Promise<boolean> {
    return this.savedEvents.get(userId)?.has(eventId) ?? false;
  }

  async listSavedEventIds(userId: string): Promise<readonly string[]> {
    const set = this.savedEvents.get(userId);
    return set ? Array.from(set) : [];
  }

  async saveEvent(userId: string, eventId: string): Promise<void> {
    let set = this.savedEvents.get(userId);
    if (!set) {
      set = new Set<string>();
      this.savedEvents.set(userId, set);
    }
    if (!set.has(eventId)) {
      set.add(eventId);
      const eventIndex = this.events.findIndex((e) => e.id === eventId);
      if (eventIndex !== -1) {
        const ev = this.events[eventIndex];
        if (ev) {
          this.events[eventIndex] = { ...ev, savedCount: ev.savedCount + 1 };
        }
      }
    }
  }

  async unsaveEvent(userId: string, eventId: string): Promise<void> {
    const set = this.savedEvents.get(userId);
    if (set && set.has(eventId)) {
      set.delete(eventId);
      const eventIndex = this.events.findIndex((e) => e.id === eventId);
      if (eventIndex !== -1) {
        const ev = this.events[eventIndex];
        if (ev && ev.savedCount > 0) {
          this.events[eventIndex] = { ...ev, savedCount: ev.savedCount - 1 };
        }
      }
    }
  }

  async listSavedEvents(userId: string): Promise<readonly EventSummary[]> {
    const savedIds = new Set(this.savedEvents.get(userId) ?? []);
    if (savedIds.size === 0) return [];
    return this.events.filter(
      (e) => savedIds.has(e.id) && (e.status === 'APPROVED' || e.status === 'EXPIRED'),
    );
  }

  async listTrackerItems(userId: string): Promise<readonly TrackerItem[]> {
    const userMap = this.trackerEntries.get(userId);
    if (!userMap) return [];
    const items: TrackerItem[] = [];
    for (const [eventId, entry] of userMap.entries()) {
      const event = this.events.find((e) => e.id === eventId);
      if (event) {
        items.push({
          id: entry.id,
          eventId,
          status: entry.status,
          notes: entry.notes,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          event,
        });
      }
    }
    return items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async upsertTrackerItem(
    userId: string,
    eventId: string,
    status: TrackerStatus,
    notes?: string | null,
  ): Promise<void> {
    let userMap = this.trackerEntries.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.trackerEntries.set(userId, userMap);
    }
    const now = new Date().toISOString();
    const existing = userMap.get(eventId);
    if (existing) {
      userMap.set(eventId, {
        ...existing,
        status,
        notes: notes !== undefined ? notes : existing.notes,
        updatedAt: now,
      });
    } else {
      userMap.set(eventId, {
        id: `tracker-${userId}-${eventId}`,
        status,
        notes: notes ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async removeTrackerItem(userId: string, eventId: string): Promise<void> {
    const userMap = this.trackerEntries.get(userId);
    if (userMap) {
      userMap.delete(eventId);
    }
  }

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
  private deriveNotifications(userId: string, now: Date): AppNotification[] {
    const sources = new Set<string>(this.savedEvents.get(userId) ?? []);
    for (const eventId of this.trackerEntries.get(userId)?.keys() ?? []) {
      sources.add(eventId);
    }
    if (sources.size === 0) return [];

    const readSet = this.readNotifications.get(userId);
    const notifications: AppNotification[] = [];

    for (const eventId of sources) {
      const event = this.events.find((candidate) => candidate.id === eventId);
      if (!event || event.status !== 'APPROVED') continue;

      const type = notificationTypeForDeadline(event.primaryDeadlineAt, now);
      if (!type) continue;

      // Id deterministik: menandai "sudah dibaca" harus tetap menempel
      // walau daftarnya dihitung ulang di request berikutnya.
      const id = `notif-${userId}-${eventId}-${type}`;
      notifications.push({
        id,
        type,
        message: buildDeadlineMessage(event.title, type),
        isRead: readSet?.has(id) ?? false,
        sentAt: event.primaryDeadlineAt ?? event.createdAt,
        event: { id: event.id, slug: event.slug, title: event.title },
      });
    }

    return notifications.sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );
  }

  async listNotifications(userId: string, limit: number): Promise<readonly AppNotification[]> {
    return this.deriveNotifications(userId, new Date()).slice(0, Math.max(limit, 0));
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    return this.deriveNotifications(userId, new Date()).filter((n) => !n.isRead).length;
  }

  async markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
    let set = this.readNotifications.get(userId);
    if (!set) {
      set = new Set<string>();
      this.readNotifications.set(userId, set);
    }
    set.add(notificationId);
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    const all = this.deriveNotifications(userId, new Date());
    let set = this.readNotifications.get(userId);
    if (!set) {
      set = new Set<string>();
      this.readNotifications.set(userId, set);
    }
    for (const notification of all) set.add(notification.id);
  }

  // ------------------------------------------------------------------
  // Tim lomba (Phase 3)
  //
  // Otorisasi diperiksa di sini, bukan dianggap sudah beres di Server
  // Action. Di produksi RLS yang menegakkan aturan yang sama; kalau mode
  // seed lebih longgar, perbedaan perilakunya baru muncul setelah deploy.
  // ------------------------------------------------------------------

  private toTeam(entry: NonNullable<ReturnType<typeof this.teams.get>>): Team {
    const event = this.events.find((candidate) => candidate.id === entry.eventId) ?? null;
    return {
      id: entry.id,
      eventId: entry.eventId,
      createdBy: entry.createdBy,
      title: entry.title,
      description: entry.description,
      slotsNeeded: entry.slotsNeeded,
      createdAt: entry.createdAt,
      event: event && (event.status === 'APPROVED' || event.status === 'EXPIRED') ? event : null,
      members: [...entry.members].sort(
        (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
      ),
    };
  }

  private requireLeader(actorId: string, teamId: string) {
    const entry = this.teams.get(teamId);
    if (!entry) throw notFound('Tim yang kamu cari tidak ditemukan.');
    if (entry.createdBy !== actorId) {
      throw forbidden('Hanya ketua tim yang bisa melakukan ini.');
    }
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
    const event = this.events.find((candidate) => candidate.id === input.eventId);
    // Tim untuk event yang tidak tayang tidak boleh dibuat: kalau boleh,
    // halaman /teams jadi jalan memutar untuk mengintip antrean moderasi.
    if (!event || event.status !== 'APPROVED') {
      throw validationFailed('Kegiatan yang dipilih tidak tersedia.');
    }

    this.teamCounter += 1;
    const id = `team-${this.teamCounter}`;
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
      members: [
        { userId: input.createdBy, fullName: input.createdByName, role: 'leader', joinedAt: now },
      ],
    });

    return id;
  }

  async joinTeam(actorId: string, actorName: string, teamId: string): Promise<void> {
    const entry = this.teams.get(teamId);
    if (!entry) throw notFound('Tim yang kamu cari tidak ditemukan.');

    if (entry.members.some((member) => member.userId === actorId)) return;
    if (entry.members.length >= entry.slotsNeeded) {
      throw validationFailed('Tim ini sudah penuh.');
    }

    entry.members.push({
      userId: actorId,
      fullName: actorName,
      role: 'member',
      joinedAt: new Date().toISOString(),
    });
  }

  async leaveTeam(actorId: string, teamId: string): Promise<void> {
    const entry = this.teams.get(teamId);
    if (!entry) return;

    // Ketua tidak boleh keluar dari timnya sendiri: yang tersisa adalah tim
    // tanpa siapa pun yang berhak mengelolanya. Jalur yang benar adalah
    // membubarkan tim.
    if (entry.createdBy === actorId) {
      throw validationFailed('Ketua tidak bisa keluar. Bubarkan tim kalau sudah tidak dipakai.');
    }

    entry.members = entry.members.filter((member) => member.userId !== actorId);
  }

  async removeTeamMember(actorId: string, teamId: string, memberId: string): Promise<void> {
    const entry = this.requireLeader(actorId, teamId);
    if (memberId === entry.createdBy) {
      throw validationFailed('Ketua tidak bisa dikeluarkan dari timnya sendiri.');
    }
    entry.members = entry.members.filter((member) => member.userId !== memberId);
  }

  async deleteTeam(actorId: string, teamId: string): Promise<void> {
    this.requireLeader(actorId, teamId);
    this.teams.delete(teamId);
  }
}

/**
 * Pengurutan bersama untuk semua implementasi repository.
 *  - relevance : skor §6 (personalized kalau profil ada, cold-start kalau null)
 *  - deadline  : tenggat terdekat dulu; yang tanpa tenggat ditaruh terakhir
 *                supaya tidak "menyelinap" ke puncak lewat nilai 0
 *  - newest    : entri terbaru dulu
 */
export function sortSummaries<T extends EventSummary>(
  events: readonly T[],
  sort: NonNullable<EventQuery['sort']>,
  now: Date,
  profile?: UserProfile | null,
): T[] {
  if (sort === 'newest') {
    return [...events].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  if (sort === 'deadline') {
    return [...events].sort((a, b) => {
      const left = a.primaryDeadlineAt ? new Date(a.primaryDeadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
      const right = b.primaryDeadlineAt ? new Date(b.primaryDeadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (left !== right) return left - right;
      return a.id.localeCompare(b.id);
    });
  }

  return rankEvents(events, profile ?? null, now).map((scored) => scored.event as T);
}
