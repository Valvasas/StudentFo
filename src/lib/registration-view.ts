import { daysUntil, formatDateId } from '@/lib/deadline';
import { tintOf, type Tint } from '@/lib/tint';
import { DEADLINE_LABEL_TEXT, type EventDetail, type RegistrationStatus } from '@/types/domain';

/**
 * Teks tiket yang dipakai halaman daftar (pratinjau) DAN halaman tiket,
 * supaya keduanya tidak menghitung "agenda berikutnya" dengan cara berbeda.
 *
 * Skema acara tidak punya tanggal pelaksanaan (ADR-039) — yang ada hanya
 * tenggat bertahap. Tiket menampilkan tahap SETELAH pendaftaran yang belum
 * lewat (final, pengumpulan karya, pengumuman); bila tidak ada, jujur
 * bahwa jadwalnya dari panitia, bukan menebak.
 */
export function ticketAgenda(event: Pick<EventDetail, 'deadlines'>, now: Date = new Date()): string {
  const next = event.deadlines.find((deadline) => deadline.label !== 'registration' && (daysUntil(deadline.deadlineAt, now) ?? -1) >= 0);
  return next ? `${DEADLINE_LABEL_TEXT[next.label]} · ${formatDateId(next.deadlineAt)}` : 'Jadwal dari panitia';
}

export function ticketPlace(event: Pick<EventDetail, 'isOnline' | 'location'>): string {
  return event.isOnline ? 'Daring' : (event.location ?? 'Lokasi menyusul');
}

/** Tint tiket = identitas ACARA (deterministik dari id-nya), tidak pernah status (ADR-054). */
export function ticketTint(event: Pick<EventDetail, 'id'>): Tint {
  return tintOf(event.id);
}

export function stampLabelOf(status: RegistrationStatus, waitlistPosition: number | null): string {
  switch (status) {
    case 'CONFIRMED':
      return 'Terdaftar';
    case 'PENDING':
      return 'Ditinjau';
    case 'WAITLISTED':
      return waitlistPosition ? `Antre #${waitlistPosition}` : 'Antre';
    case 'REJECTED':
      return 'Tidak diterima';
    case 'CANCELLED':
      return 'Dibatalkan';
  }
}

export const registrationDraftKey = (eventId: string) => `studentfo:pendaftaran:${eventId}`;
