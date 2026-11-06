import { TRACKER_STATUSES, type TrackerStatus } from '@/types/domain';

/**
 * "Urungkan" untuk aksi yang bisa dibalik (ADR-067). Pasangan konfirmasi:
 * aksi yang tidak bisa dibalik DIKONFIRMASI sebelum jalan; aksi yang bisa
 * dibalik jalan seketika lalu menawarkan jalan pulang — konfirmasi di setiap
 * ketukan kecil hanya melatih orang menekan "Ya" tanpa membaca.
 *
 * Keadaan sebelumnya dioper lewat `?urungkan=` sebagai DATA dari daftar
 * tertutup (jenis + id + kode tahap), bukan teks — sejalan dengan ADR-019.
 * Token palsu paling jauh mengubah data milik pemanggil sendiri: aksi yang
 * menjalankannya tetap memeriksa sesi dan memvalidasi isinya.
 */
export const UNDO_PARAM = 'urungkan';

export type UndoToken =
  | { readonly kind: 'tahap'; readonly eventId: string; readonly status: TrackerStatus }
  | { readonly kind: 'simpan'; readonly eventId: string };

/** UUID (seed & produksi). Selain itu bukan id kegiatan — token ditolak. */
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function undoTokenOf(token: UndoToken): string {
  return token.kind === 'tahap' ? `tahap.${token.eventId}.${token.status}` : `simpan.${token.eventId}`;
}

export function parseUndoToken(raw: string | readonly string[] | undefined): UndoToken | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length > 80) return null;
  const [kind, eventId, status, ...rest] = value.split('.');
  if (rest.length > 0 || !eventId || !EVENT_ID.test(eventId)) return null;
  if (kind === 'simpan' && status === undefined) return { kind, eventId };
  if (kind === 'tahap' && (TRACKER_STATUSES as readonly string[]).includes(status ?? '')) {
    return { kind, eventId, status: status as TrackerStatus };
  }
  return null;
}
