import { z } from 'zod';
import { formText } from '@/lib/form-data';
import {
  LOBBY_INTENTS,
  type EventRegistration,
  type EventStatus,
  type EventSummary,
  type EventType,
  type LobbyEventRef,
  type LobbyIntent,
  type LobbyMember,
  type RegistrationStatus,
  type TrackerItem,
  type TrackerStatus,
} from '@/types/domain';

/**
 * Lobi lomba (ADR-071) — aturan murni yang dipakai KEDUA repository dan
 * dicerminkan fungsi SQL `can_use_lobby()` / `lobby_is_open()` di migration
 * 20261108100003. Ubah salah satu → ubah keduanya.
 */

export const LOBBY_LIMITS = {
  noteMax: 160,
  /** Sama dengan `consume_rate_limit('lobby-invite:…', 20, 86400)` di SQL. */
  invitesPerDay: 20,
  /** Koneksi yang ditawarkan untuk diajak — daftar berbatas (ADR-048). */
  inviteCandidates: 50,
} as const;

/** Tahap Papan lamaran yang berarti "sudah mendaftar". SAVED belum. */
export const LOBBY_TRACKER_STATUSES: readonly TrackerStatus[] = ['APPLIED', 'INTERVIEW', 'ACCEPTED'];
/** Pendaftaran formulir StudentFo yang masih hidup — ditolak/dibatalkan tidak masuk lobi. */
export const LOBBY_REGISTRATION_STATUSES: readonly RegistrationStatus[] = ['AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED'];

/** Lobi hanya untuk lomba yang pernah tayang — tim tidak bermakna untuk beasiswa atau magang. */
export function isLobbyEvent(event: { readonly eventType: EventType | null; readonly status: EventStatus | null }): boolean {
  return event.eventType === 'LOMBA' && (event.status === 'APPROVED' || event.status === 'EXPIRED');
}

export function hasRegistered(trackerStatus: TrackerStatus | null, registrationStatus: RegistrationStatus | null): boolean {
  return (
    (trackerStatus !== null && LOBBY_TRACKER_STATUSES.includes(trackerStatus)) ||
    (registrationStatus !== null && LOBBY_REGISTRATION_STATUSES.includes(registrationStatus))
  );
}

/**
 * Bisa bergabung/mengajak = lomba masih tayang dan pendaftarannya belum
 * ditutup. Setelah itu tim sudah harus terbentuk: lobi tinggal arsip baca.
 */
export function isLobbyOpen(event: { readonly status: EventStatus; readonly primaryDeadlineAt: string | null }, now: Date = new Date()): boolean {
  if (event.status !== 'APPROVED') return false;
  const deadline = event.primaryDeadlineAt ? Date.parse(event.primaryDeadlineAt) : Number.NaN;
  return !Number.isFinite(deadline) || deadline > now.getTime();
}

export function toLobbyEventRef(event: Pick<EventSummary, 'id' | 'slug' | 'title' | 'organizer' | 'status' | 'primaryDeadlineAt'>): LobbyEventRef {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    organizer: event.organizer,
    status: event.status,
    primaryDeadlineAt: event.primaryDeadlineAt,
  };
}

/**
 * Lomba yang lobinya bisa dimasuki pengguna, dari Papan lamaran DAN
 * pendaftaran formulir — satu lomba sekali. Yang masih buka dulu, tenggat
 * terdekat dulu; arsip (sudah ditutup) di belakang.
 */
export function lobbyEventsOf(
  tracker: readonly Pick<TrackerItem, 'status' | 'event'>[],
  registrations: readonly Pick<EventRegistration, 'status' | 'event'>[],
  now: Date = new Date(),
): readonly LobbyEventRef[] {
  const chosen = new Map<string, LobbyEventRef>();
  for (const item of tracker) {
    if (hasRegistered(item.status, null) && isLobbyEvent(item.event)) chosen.set(item.event.id, toLobbyEventRef(item.event));
  }
  for (const { status, event } of registrations) {
    if (!hasRegistered(null, status) || !isLobbyEvent(event) || chosen.has(event.id) || event.status === null) continue;
    chosen.set(event.id, toLobbyEventRef({ ...event, status: event.status }));
  }
  const deadlineOf = (event: LobbyEventRef) => (event.primaryDeadlineAt ? Date.parse(event.primaryDeadlineAt) : Number.POSITIVE_INFINITY);
  return [...chosen.values()].sort(
    (a, b) => Number(isLobbyOpen(b, now)) - Number(isLobbyOpen(a, now)) || deadlineOf(a) - deadlineOf(b) || a.title.localeCompare(b.title),
  );
}

/**
 * Yang paling mungkin cocok tampil dulu: pencari tim melihat tim yang butuh
 * anggota, dan sebaliknya; lalu yang sudah terhubung; lalu yang terbaru.
 */
const COMPLEMENT: Record<LobbyIntent, LobbyIntent | null> = { CARI_TIM: 'CARI_ANGGOTA', CARI_ANGGOTA: 'CARI_TIM', SIAP: null };

export function rankLobbyMembers(members: readonly LobbyMember[], viewerIntent: LobbyIntent | null): readonly LobbyMember[] {
  const wanted = viewerIntent ? COMPLEMENT[viewerIntent] : null;
  const score = (member: LobbyMember) => (member.intent === wanted ? 2 : 0) + (member.relation === 'connected' ? 1 : 0);
  return [...members].sort((a, b) => score(b) - score(a) || Date.parse(b.joinedAt) - Date.parse(a.joinedAt) || a.fullName.localeCompare(b.fullName));
}

export const lobbyMemberSchema = z.object({
  intent: z.enum(LOBBY_INTENTS),
  note: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ' '))
    .pipe(z.union([z.literal('').transform(() => null), z.string().max(LOBBY_LIMITS.noteMax)])),
});
export type LobbyMemberInput = z.infer<typeof lobbyMemberSchema>;

export function parseLobbyMember(formData: FormData) {
  return lobbyMemberSchema.safeParse({ intent: formText(formData, 'intent'), note: formText(formData, 'note') });
}
