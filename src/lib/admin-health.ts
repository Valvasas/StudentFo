import type { ModerationLogEntry } from '@/types/domain';

/**
 * Batas tunggu antrean moderasi. Banyak tenggat pendaftaran di katalog ini
 * kurang dari dua minggu; kiriman yang tertahan lebih dari dua hari sudah
 * kehilangan sebagian besar waktu daftar pesertanya sebelum sempat tayang.
 */
export const REVIEW_SLA_HOURS = 48;

const HOUR_MS = 3_600_000;
const DECISION_WINDOW_DAYS = 7;

export interface QueueHealth {
  readonly count: number;
  /** Umur item tertua dalam jam (dibulatkan ke bawah); null bila antrean kosong. */
  readonly oldestHours: number | null;
  readonly overdue: number;
}

export interface DecisionSummary {
  readonly approved: number;
  readonly rejected: number;
  readonly windowDays: number;
}

export function summarizeQueue(createdAts: readonly string[], now: Date = new Date()): QueueHealth {
  let oldest: number | null = null;
  let overdue = 0;
  for (const iso of createdAts) {
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) continue;
    const hours = Math.max(0, Math.floor((now.getTime() - time) / HOUR_MS));
    if (oldest === null || hours > oldest) oldest = hours;
    if (hours >= REVIEW_SLA_HOURS) overdue += 1;
  }
  return { count: createdAts.length, oldestHours: oldest, overdue };
}

/**
 * Keputusan MANUSIA dalam jendela 7 hari. Entri tanpa aktor (job expiry,
 * SQL manual) dan pemulihan ke PENDING bukan keputusan moderasi — ikut
 * dihitung berarti angka "disetujui" naik sendiri setiap malam.
 */
export function summarizeDecisions(entries: readonly ModerationLogEntry[], now: Date = new Date()): DecisionSummary {
  const since = now.getTime() - DECISION_WINDOW_DAYS * 24 * HOUR_MS;
  let approved = 0;
  let rejected = 0;
  for (const entry of entries) {
    if (!entry.actorId || new Date(entry.createdAt).getTime() < since) continue;
    if (entry.toStatus === 'APPROVED' || entry.toStatus === 'VERIFIED') approved += 1;
    else if (entry.toStatus === 'REJECTED' || entry.toStatus === 'REVOKED') rejected += 1;
  }
  return { approved, rejected, windowDays: DECISION_WINDOW_DAYS };
}

export function formatWait(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return '< 1 jam';
  if (hours < 48) return `${hours} jam`;
  return `${Math.floor(hours / 24)} hari`;
}
