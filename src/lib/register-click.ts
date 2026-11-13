import 'server-only';
import type { AuthUser } from '@/lib/auth';
import type { EventRepository } from '@/lib/data/repository';
import { recordSignal } from '@/lib/recommendation-signals';

/**
 * Anggota menekan "Daftar" (ADR-090): sinyal niat (ADR-032), lalu sama dengan
 * tombol "Simpan ke Tracker" — simpanan + Papan lamaran "Disimpan" bila belum
 * dilacak — tanpa sinyal `save` kedua. Orang yang sudah membuka pendaftaran
 * mengira lamarannya tercatat, dan tanpa baris itu pengingat tenggatnya pun
 * tidak pernah datang. Separuh saja (Papan lamaran tanpa simpanan) membuat
 * halaman acara bertuliskan "Di pendaftaranmu: Disimpan" sambil menawarkan
 * "Simpan ke Tracker".
 *
 * Tidak pernah "Sudah Daftar": klik bukan bukti pendaftaran selesai di situs
 * luar, dan tahap Papan lamaran dilaporkan sendiri karena dipakai portofolio,
 * lencana, dan akses lobi (ADR-046). Tahap yang sudah lebih jauh tidak
 * disentuh. Tidak pernah melempar: gagal mencatat tidak boleh menahan orang di
 * depan pintu pendaftaran.
 */
export async function noteRegisterClick(
  eventId: string,
  user: AuthUser,
  repository: Pick<EventRepository, 'saveEvent' | 'addTrackerItemIfAbsent'>,
): Promise<void> {
  await recordSignal('register_click', eventId, user);
  try {
    await repository.saveEvent(user.id, eventId);
    await repository.addTrackerItemIfAbsent(user.id, eventId);
  } catch (error) {
    console.error('[papan-lamaran] gagal menambah dari klik Daftar:', error);
  }
}
