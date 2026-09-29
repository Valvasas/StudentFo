import type { Achievement, EventType, PortfolioEntry, ResultVerification, TrackerItem, TrackerStatus } from '@/types/domain';
import { ACHIEVEMENTS } from '@/types/domain';

/**
 * Portofolio (ADR-046) = baris tracker yang sudah "Sudah daftar" atau lebih
 * jauh. Tidak ada langkah "tambahkan ke portofolio": begitu status tracker
 * berubah, entrinya ada. Aturan di berkas ini dicerminkan migration
 * 20260929100001 dan MemoryEventRepository — ubah ketiganya bersamaan.
 */
export const PORTFOLIO_STATUSES: readonly TrackerStatus[] = ['APPLIED', 'INTERVIEW', 'ACCEPTED'];

export const PORTFOLIO_LIMITS = { noteMax: 120, proofMax: 500 } as const;

export function isPortfolioStatus(status: TrackerStatus): boolean {
  return PORTFOLIO_STATUSES.includes(status);
}

/**
 * Beasiswa & magang menyangkut kondisi ekonomi dan lamaran kerja — privat
 * sampai pemiliknya sendiri memilih menampilkannya. Sama dengan
 * `portfolio_default_visible()` di SQL.
 */
export function defaultPortfolioVisible(eventType: EventType): boolean {
  return eventType !== 'BEASISWA' && eventType !== 'MAGANG';
}

/** Apakah entri ini tampil di profil publik. "Ditolak" tidak pernah tampil. */
export function isPubliclyListed(item: Pick<TrackerItem, 'status' | 'portfolioVisible'> & { event: { eventType: EventType } }): boolean {
  return isPortfolioStatus(item.status) && (item.portfolioVisible ?? defaultPortfolioVisible(item.event.eventType));
}

/** Hasil yang masuk akal per jenis kegiatan — "Juara 1" untuk beasiswa tidak bermakna. */
export const ACHIEVEMENT_OPTIONS: Record<EventType, readonly Achievement[]> = {
  LOMBA: ['PESERTA', 'FINALIS', 'JUARA_HARAPAN', 'JUARA_3', 'JUARA_2', 'JUARA_1'],
  BEASISWA: ['PENERIMA'],
  MAGANG: ['PENERIMA', 'BERSERTIFIKAT'],
  WORKSHOP: ['PESERTA', 'BERSERTIFIKAT'],
  PELATIHAN: ['PESERTA', 'BERSERTIFIKAT'],
  KONFERENSI: ['PESERTA', 'BERSERTIFIKAT'],
  VOLUNTEER: ['PESERTA', 'BERSERTIFIKAT'],
};

export function achievementLabel(achievement: Achievement, eventType: EventType): string {
  switch (achievement) {
    case 'PESERTA':
      return eventType === 'VOLUNTEER' ? 'Relawan' : 'Peserta';
    case 'FINALIS':
      return 'Finalis';
    case 'JUARA_HARAPAN':
      return 'Juara harapan';
    case 'JUARA_3':
      return 'Juara 3';
    case 'JUARA_2':
      return 'Juara 2';
    case 'JUARA_1':
      return 'Juara 1';
    case 'PENERIMA':
      return eventType === 'BEASISWA' ? 'Penerima beasiswa' : eventType === 'MAGANG' ? 'Diterima magang' : 'Diterima';
    case 'BERSERTIFIKAT':
      return eventType === 'MAGANG' ? 'Selesai magang, bersertifikat' : 'Bersertifikat';
  }
}

/** Label satu entri: hasil yang dilaporkan, atau tahap tracker kalau belum diisi. */
export function portfolioOutcomeLabel(entry: { status: TrackerStatus; achievement: Achievement | null; eventType: EventType }): string {
  if (entry.achievement) return achievementLabel(entry.achievement, entry.eventType);
  switch (entry.status) {
    case 'APPLIED':
      return 'Terdaftar';
    case 'INTERVIEW':
      return 'Tahap seleksi';
    case 'ACCEPTED':
      return entry.eventType === 'LOMBA' ? 'Lolos seleksi' : 'Diterima';
    case 'REJECTED':
      return 'Belum lolos';
    case 'SAVED':
      return 'Disimpan';
  }
}

/** Posisi urut: hasil tertinggi dulu, lalu yang terbaru. */
const ACHIEVEMENT_RANK: Record<Achievement, number> = {
  JUARA_1: 7,
  JUARA_2: 6,
  JUARA_3: 5,
  JUARA_HARAPAN: 4,
  FINALIS: 3,
  PENERIMA: 3,
  BERSERTIFIKAT: 2,
  PESERTA: 1,
};

export function achievementRank(achievement: Achievement | null): number {
  return achievement ? ACHIEVEMENT_RANK[achievement] : 0;
}

export function toPortfolioEntry(item: TrackerItem, verifiedBy: string | null = null): PortfolioEntry {
  return {
    eventId: item.eventId,
    slug: item.event.slug,
    title: item.event.title,
    organizer: item.event.organizer,
    eventType: item.event.eventType,
    status: item.status,
    achievement: item.achievement,
    achievementNote: item.achievementNote,
    proofUrl: item.proofUrl,
    deadlineAt: item.event.primaryDeadlineAt,
    verifiedBy,
  };
}

/** Alasan "tidak sesuai" dari penyelenggara — sama dengan CHECK di migration 20260929110001. */
export const VERIFICATION_NOTE_MAX = 300;

/** Nama lembaga per acara untuk entri yang terkonfirmasi — satu sumber untuk profil pemilik. */
export function verifiedByEvent(verifications: readonly ResultVerification[]): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const verification of verifications) {
    if (verification.status === 'VERIFIED' && verification.orgName) result.set(verification.eventId, verification.orgName);
  }
  return result;
}

export interface PortfolioInput {
  readonly achievement: Achievement | null;
  readonly achievementNote: string | null;
  readonly proofUrl: string | null;
  readonly visible: boolean;
}

export interface RawPortfolioInput {
  readonly achievement: string;
  readonly note: string;
  readonly proofUrl: string;
  readonly visible: boolean;
}

/**
 * Validasi input form hasil. `null` = tidak sah (dilaporkan sebagai kode
 * `invalid_portfolio`, bukan pesan bebas). Tautan bukti hanya https: tautan
 * ini dibuka orang lain dari profil publik, dan database menolak selain itu.
 */
export function parsePortfolioInput(raw: RawPortfolioInput, eventType: EventType): PortfolioInput | null {
  const achievementRaw = raw.achievement.trim();
  let achievement: Achievement | null = null;
  if (achievementRaw) {
    if (!(ACHIEVEMENTS as readonly string[]).includes(achievementRaw)) return null;
    if (!ACHIEVEMENT_OPTIONS[eventType].includes(achievementRaw as Achievement)) return null;
    achievement = achievementRaw as Achievement;
  }

  const note = raw.note.replace(/\s+/g, ' ').trim();
  if (note.length > PORTFOLIO_LIMITS.noteMax) return null;

  const proof = raw.proofUrl.trim();
  let proofUrl: string | null = null;
  if (proof) {
    if (proof.length > PORTFOLIO_LIMITS.proofMax || /\s/.test(proof)) return null;
    let parsed: URL;
    try {
      parsed = new URL(proof);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname) return null;
    proofUrl = parsed.toString();
    if (proofUrl.length > PORTFOLIO_LIMITS.proofMax) return null;
  }

  return { achievement, achievementNote: note || null, proofUrl, visible: raw.visible };
}
