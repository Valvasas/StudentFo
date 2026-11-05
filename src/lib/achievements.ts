import type { EventStatus, EventType, OrganizerStatus, RegistrationStatus } from '@/types/domain';

/**
 * Lencana pencapaian (ADR-064) — DIHITUNG, tidak pernah DIBERIKAN.
 *
 * Tidak ada tabel lencana, tidak ada penghitung, tidak ada tombol "klaim":
 * setiap kali profil dibuka, lencana dihitung ulang dari catatan yang tidak
 * bisa ditulis pemilik akun sendiri. Konsekuensinya sengaja:
 *  - Mendaftar → dapat lencana → membatalkan TIDAK menyisakan lencana;
 *    catatan yang dihitung sudah tidak ada.
 *  - Tidak ada endpoint yang bisa dipanggil berulang untuk "menambah".
 *
 * Sumber yang DIPAKAI (status hanya bisa diubah RPC SECURITY DEFINER /
 * moderator, lihat migration 20261014100001 & ADR-037/042):
 *  - pendaftaran internal berstatus CONFIRMED (dikonfirmasi panitia, atau
 *    otomatis untuk acara gratis) pada acara yang tayang & sudah DITUTUP;
 *  - kiriman kegiatan yang DISETUJUI moderator;
 *  - status penyelenggara VERIFIED & acara kelolaan yang sudah ditutup.
 *
 * Sumber yang sengaja TIDAK dipakai, karena pemilik akun bisa menulisnya
 * sendiri tanpa saksi: tahap Papan lamaran ("Sudah daftar", "Diterima"),
 * hasil portofolio ("Juara 1"), kelengkapan profil, jumlah koneksi/tim
 * (cukup dengan akun-akun palsu).
 */

export type BadgeKey = 'kompetitor' | 'pembelajar' | 'penjelajah' | 'kontributor' | 'tuan-rumah' | 'terverifikasi';
/** 0 = belum diraih. Tingkat dibawa bentuk medali + teks, bukan warna saja. */
export type BadgeTier = 0 | 1 | 2 | 3;

export interface BadgeLevel {
  readonly threshold: number;
  readonly title: string;
}

export interface BadgeDefinition {
  readonly key: BadgeKey;
  readonly name: string;
  /** Satuan hitungan dalam kalimat progres: "2 dari 3 lomba". */
  readonly unit: string;
  readonly rule: string;
  /** Kenapa hitungan ini tidak bisa dicurangi — ditampilkan apa adanya ke pemilik. */
  readonly fairness: string;
  readonly levels: readonly BadgeLevel[];
  readonly organizerOnly: boolean;
}

const SETTLED_RULE = 'Dihitung setelah pendaftarannya ditutup dan kamu masih terdaftar.';

export const BADGES: readonly BadgeDefinition[] = [
  {
    key: 'kompetitor',
    name: 'Petarung Lomba',
    unit: 'lomba',
    rule: `Ikut lomba lewat formulir StudentFo dan pendaftaranmu dikonfirmasi panitia. ${SETTLED_RULE}`,
    fairness: 'Status terkonfirmasi hanya bisa diberikan panitia (atau otomatis untuk lomba gratis). Lomba yang kamu kelola sendiri, pendaftaran yang dibatalkan, dan tanda "Sudah daftar" di Papan lamaran tidak dihitung.',
    levels: [
      { threshold: 1, title: 'Debut Arena' },
      { threshold: 3, title: 'Aktif Berkompetisi' },
      { threshold: 10, title: 'Veteran Lomba' },
    ],
    organizerOnly: false,
  },
  {
    key: 'pembelajar',
    name: 'Pembelajar',
    unit: 'kelas & seminar',
    rule: `Ikut workshop, pelatihan, atau seminar lewat formulir StudentFo dan terkonfirmasi. ${SETTLED_RULE}`,
    fairness: 'Sama dengan lomba: dikonfirmasi panitia, satu acara dihitung sekali, dan batal berarti tidak dihitung.',
    levels: [
      { threshold: 1, title: 'Langkah Pertama' },
      { threshold: 5, title: 'Haus Ilmu' },
      { threshold: 15, title: 'Pembelajar Sejati' },
    ],
    organizerOnly: false,
  },
  {
    key: 'penjelajah',
    name: 'Penjelajah',
    unit: 'jenis kegiatan',
    rule: 'Terkonfirmasi di jenis kegiatan yang berbeda-beda — lomba, beasiswa, magang, workshop, seminar, pelatihan, atau volunter.',
    fairness: 'Yang dihitung JENIS-nya, bukan jumlah pendaftaran: sepuluh lomba tetap satu jenis.',
    levels: [
      { threshold: 2, title: 'Lintas Jalur' },
      { threshold: 3, title: 'Serba Bisa' },
      { threshold: 5, title: 'Penjelajah Penuh' },
    ],
    organizerOnly: false,
  },
  {
    key: 'kontributor',
    name: 'Kontributor',
    unit: 'kiriman tayang',
    rule: 'Kirim lomba atau beasiswa yang belum ada lewat “Kirim kegiatan” sambil masuk ke akunmu, lalu disetujui moderator.',
    fairness: 'Setiap kiriman diperiksa manusia sebelum tayang. Kiriman yang ditolak atau masih menunggu tidak dihitung.',
    levels: [
      { threshold: 1, title: 'Pembawa Kabar' },
      { threshold: 5, title: 'Kurator Komunitas' },
      { threshold: 20, title: 'Pilar Komunitas' },
    ],
    organizerOnly: false,
  },
  {
    key: 'terverifikasi',
    name: 'Penyelenggara Terverifikasi',
    unit: 'verifikasi',
    rule: 'Pengajuan penyelenggaramu diperiksa dan disetujui moderator.',
    fairness: 'Hanya moderator yang bisa memverifikasi, dan lencana ini hilang bila verifikasinya dicabut.',
    levels: [{ threshold: 1, title: 'Terverifikasi' }],
    organizerOnly: true,
  },
  {
    key: 'tuan-rumah',
    name: 'Tuan Rumah',
    unit: 'acara selesai',
    rule: 'Acara yang kamu kelola tayang di StudentFo sampai pendaftarannya ditutup.',
    fairness: 'Acara harus disetujui moderator dan benar-benar ditutup; acara yang ditolak atau masih buka belum dihitung.',
    levels: [
      { threshold: 1, title: 'Acara Perdana' },
      { threshold: 5, title: 'Penyelenggara Andal' },
      { threshold: 15, title: 'Tuan Rumah Ulung' },
    ],
    organizerOnly: true,
  },
];

const LEARNING_TYPES: readonly EventType[] = ['WORKSHOP', 'KONFERENSI', 'PELATIHAN'];
const LISTED_STATUSES: readonly EventStatus[] = ['APPROVED', 'EXPIRED'];

export interface RegistrationFact {
  readonly eventId: string;
  /** null = acaranya tidak lagi terbaca (dihapus, ditolak, disembunyikan) — tidak dihitung. */
  readonly eventType: EventType | null;
  readonly eventStatus: EventStatus | null;
  readonly deadlineAt: string | null;
  readonly status: RegistrationStatus;
  /** Kapan statusnya jadi CONFIRMED: keputusan panitia, atau saat mendaftar untuk acara gratis. */
  readonly confirmedAt: string;
}

export interface AchievementFacts {
  readonly registrations: readonly RegistrationFact[];
  /** Acara yang dikelola pemilik akun — mendaftar di acara sendiri tidak dihitung. */
  readonly managedEventIds: readonly string[];
  readonly approvedSubmissions: number;
  readonly organizerStatus: OrganizerStatus | null;
  readonly organizerReviewedAt: string | null;
  /** Acara kelolaan yang sudah ditutup (`organizer_event_history()`). */
  readonly hostedEventClosedAt: readonly (string | null)[];
}

export interface BadgeProgress {
  readonly definition: BadgeDefinition;
  readonly tier: BadgeTier;
  readonly count: number;
  /** Terkonfirmasi tetapi pendaftarannya belum ditutup — akan dihitung bila tetap terdaftar. */
  readonly pending: number;
  readonly current: BadgeLevel | null;
  readonly next: BadgeLevel | null;
  /** Kapan tingkat saat ini tercapai; null bila sumbernya tidak mencatat waktu. */
  readonly earnedAt: string | null;
}

interface Settled {
  readonly eventId: string;
  readonly eventType: EventType;
  readonly at: number;
}

/** Pendaftaran yang sudah "jadi" (dihitung) dan yang masih menunggu ditutup. */
export function settleRegistrations(
  facts: Pick<AchievementFacts, 'registrations' | 'managedEventIds'>,
  now: Date = new Date(),
): { readonly settled: readonly Settled[]; readonly pending: readonly { eventId: string; eventType: EventType }[] } {
  const managed = new Set(facts.managedEventIds);
  const settled = new Map<string, Settled>();
  const pending = new Map<string, { eventId: string; eventType: EventType }>();

  for (const fact of facts.registrations) {
    if (fact.status !== 'CONFIRMED' || fact.eventType === null || fact.eventStatus === null) continue;
    if (!LISTED_STATUSES.includes(fact.eventStatus) || managed.has(fact.eventId)) continue;

    const deadline = fact.deadlineAt ? Date.parse(fact.deadlineAt) : Number.NaN;
    const closed = fact.eventStatus === 'EXPIRED' || (Number.isFinite(deadline) && deadline <= now.getTime());
    if (!closed) {
      pending.set(fact.eventId, { eventId: fact.eventId, eventType: fact.eventType });
      continue;
    }
    // Jadi = saat KEDUA syarat terpenuhi (terkonfirmasi & ditutup), tidak pernah di masa depan.
    const confirmed = Date.parse(fact.confirmedAt);
    const at = Math.min(Number.isFinite(deadline) ? Math.max(deadline, confirmed) : confirmed, now.getTime());
    const previous = settled.get(fact.eventId);
    if (!previous || at < previous.at) settled.set(fact.eventId, { eventId: fact.eventId, eventType: fact.eventType, at });
  }

  for (const eventId of settled.keys()) pending.delete(eventId);
  return { settled: [...settled.values()].sort((a, b) => a.at - b.at), pending: [...pending.values()] };
}

function progressOf(definition: BadgeDefinition, count: number, pending: number, earnedAtFor: (threshold: number) => string | null): BadgeProgress {
  const reached = definition.levels.filter((level) => count >= level.threshold);
  const current = reached.at(-1) ?? null;
  return {
    definition,
    tier: reached.length as BadgeTier,
    count,
    pending,
    current,
    next: definition.levels[reached.length] ?? null,
    earnedAt: current ? earnedAtFor(current.threshold) : null,
  };
}

const isoAt = (times: readonly number[], threshold: number): string | null => {
  const at = times[threshold - 1];
  return at === undefined ? null : new Date(at).toISOString();
};

/**
 * Semua lencana yang relevan untuk akun ini, urut seperti `BADGES`.
 * Lencana penyelenggara hanya untuk akun yang pernah mengajukan diri.
 */
export function evaluateBadges(facts: AchievementFacts, now: Date = new Date()): readonly BadgeProgress[] {
  const { settled, pending } = settleRegistrations(facts, now);

  const ofTypes = (types: readonly EventType[]) => settled.filter((item) => types.includes(item.eventType)).map((item) => item.at);
  const pendingOf = (types: readonly EventType[]) => pending.filter((item) => types.includes(item.eventType)).length;

  const typeReachedAt: number[] = [];
  const seenTypes = new Set<EventType>();
  for (const item of settled) {
    if (seenTypes.has(item.eventType)) continue;
    seenTypes.add(item.eventType);
    typeReachedAt.push(item.at);
  }
  const pendingNewTypes = new Set(pending.map((item) => item.eventType).filter((type) => !seenTypes.has(type))).size;

  const hosted = facts.hostedEventClosedAt.map((value) => (value ? Date.parse(value) : Number.NaN));
  const hostedTimes = hosted.every(Number.isFinite) ? [...hosted].sort((a, b) => a - b) : [];
  const verified = facts.organizerStatus === 'VERIFIED';

  const results: BadgeProgress[] = [];
  for (const definition of BADGES) {
    if (definition.organizerOnly && facts.organizerStatus === null) continue;
    switch (definition.key) {
      case 'kompetitor': {
        const times = ofTypes(['LOMBA']);
        results.push(progressOf(definition, times.length, pendingOf(['LOMBA']), (threshold) => isoAt(times, threshold)));
        break;
      }
      case 'pembelajar': {
        const times = ofTypes(LEARNING_TYPES);
        results.push(progressOf(definition, times.length, pendingOf(LEARNING_TYPES), (threshold) => isoAt(times, threshold)));
        break;
      }
      case 'penjelajah':
        results.push(progressOf(definition, typeReachedAt.length, pendingNewTypes, (threshold) => isoAt(typeReachedAt, threshold)));
        break;
      case 'kontributor':
        results.push(progressOf(definition, Math.max(0, facts.approvedSubmissions), 0, () => null));
        break;
      case 'terverifikasi':
        results.push(progressOf(definition, verified ? 1 : 0, facts.organizerStatus === 'PENDING' ? 1 : 0, () => (verified ? facts.organizerReviewedAt : null)));
        break;
      case 'tuan-rumah':
        results.push(progressOf(definition, facts.hostedEventClosedAt.length, 0, (threshold) => isoAt(hostedTimes, threshold)));
        break;
    }
  }
  return results;
}

export interface BadgeSummary {
  readonly earned: number;
  readonly tiersEarned: number;
  readonly tiersTotal: number;
}

export function summarizeBadges(progress: readonly BadgeProgress[]): BadgeSummary {
  return {
    earned: progress.filter((item) => item.tier > 0).length,
    tiersEarned: progress.reduce((sum, item) => sum + item.tier, 0),
    tiersTotal: progress.reduce((sum, item) => sum + item.definition.levels.length, 0),
  };
}

/** Tingkat yang baru tercapai (≤ 7 hari) diberi label "Baru". Tanpa tanggal = tidak pernah "baru". */
export function isFreshBadge(progress: BadgeProgress, now: Date = new Date(), days = 7): boolean {
  if (progress.tier === 0 || !progress.earnedAt) return false;
  const age = now.getTime() - Date.parse(progress.earnedAt);
  return age >= 0 && age <= days * 86_400_000;
}

/**
 * Lencana yang paling dekat ke tingkat berikutnya — bahan ajakan "1 lomba
 * lagi". Yang sudah mentok tidak ikut; seri diputus urutan `BADGES`.
 */
export function nearestBadgeGoal(progress: readonly BadgeProgress[]): BadgeProgress | null {
  let best: BadgeProgress | null = null;
  for (const item of progress) {
    if (!item.next || item.definition.organizerOnly) continue;
    const remaining = item.next.threshold - item.count;
    if (!best || remaining < (best.next?.threshold ?? 0) - best.count) best = item;
  }
  return best;
}
