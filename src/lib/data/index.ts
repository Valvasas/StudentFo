import { dataMode } from '@/lib/env';
import { MemoryEventRepository } from './memory-repository';
import type { EventRepository } from './repository';

/**
 * Umur maksimum data demo sebelum dibangun ulang dari seed.
 *
 * KENAPA PERLU: tenggat di data contoh dihitung RELATIF terhadap saat
 * repository dibuat ("tutup 3 hari lagi"). Server demo yang hidup berminggu-
 * minggu tanpa reset akan melihat semua kegiatannya berubah jadi "ditutup",
 * dan halaman utama kosong. Selain itu data demo dibagi semua pengunjung:
 * satu orang yang menolak semua kegiatan lewat persona admin akan merusak
 * pratinjau bagi yang lain. Reset berkala membatasi kedua masalah itu,
 * sekaligus membatasi pertumbuhan memori dari data per pengunjung.
 */
export const DEMO_DATA_TTL_MS = 6 * 60 * 60 * 1000;

interface MemoryStoreSlot {
  repository: MemoryEventRepository;
  createdAt: number;
}

/**
 * Disimpan di globalThis, bukan variabel modul: `next dev` mengevaluasi ulang
 * modul saat hot reload, dan variabel modul biasa akan membuang semua yang
 * disimpan pengguna demo setiap kali sebuah berkas disunting.
 */
const globalForData = globalThis as typeof globalThis & {
  __studentfoMemoryStore?: MemoryStoreSlot;
  __studentfoSupabaseRepository?: EventRepository;
};

export function isDemoStoreExpired(createdAt: number, now: number, ttlMs = DEMO_DATA_TTL_MS): boolean {
  return now - createdAt >= ttlMs || now < createdAt;
}

function memoryRepository(now = Date.now()): MemoryEventRepository {
  const slot = globalForData.__studentfoMemoryStore;
  if (slot && !isDemoStoreExpired(slot.createdAt, now)) return slot.repository;

  const repository = new MemoryEventRepository(new Date(now));
  globalForData.__studentfoMemoryStore = { repository, createdAt: now };
  return repository;
}

/**
 * Pemilih implementasi. Satu-satunya tempat di seluruh aplikasi yang tahu
 * data datang dari mana.
 *
 * Impor Supabase sengaja dinamis: kalau di-`import` statis, bundler ikut
 * menarik `server-only` ke setiap jalur yang menyentuh repository — padahal
 * di mode seed backend-nya memang tidak ada.
 */
export async function getEventRepository(): Promise<EventRepository> {
  if (dataMode === 'seed') return memoryRepository();

  if (!globalForData.__studentfoSupabaseRepository) {
    const { SupabaseEventRepository } = await import('./supabase-repository');
    globalForData.__studentfoSupabaseRepository = new SupabaseEventRepository();
  }
  return globalForData.__studentfoSupabaseRepository;
}

/** Kapan data demo terakhir dibangun ulang; null di luar mode seed. */
export function demoDataCreatedAt(): Date | null {
  if (dataMode !== 'seed') return null;
  memoryRepository();
  return new Date(globalForData.__studentfoMemoryStore!.createdAt);
}

/** Bangun ulang data demo dari seed sekarang juga (aksi admin demo). */
export function resetDemoData(): void {
  if (dataMode !== 'seed') throw new Error('resetDemoData hanya berlaku di mode seed.');
  globalForData.__studentfoMemoryStore = undefined;
  memoryRepository();
}

export { dataMode };
export type { EventRepository };
