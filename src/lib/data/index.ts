import { dataMode } from '@/lib/env';
import { MemoryEventRepository } from './memory-repository';
import type { EventRepository } from './repository';

let cached: EventRepository | null = null;

/**
 * Pemilih implementasi. Satu-satunya tempat di seluruh aplikasi yang tahu
 * data datang dari mana.
 *
 * Impor Supabase sengaja dinamis: kalau di-`import` statis, bundler ikut
 * menarik `server-only` ke setiap jalur yang menyentuh repository — padahal
 * di mode seed backend-nya memang tidak ada.
 */
export async function getEventRepository(): Promise<EventRepository> {
  if (cached) return cached;

  if (dataMode === 'supabase') {
    const { SupabaseEventRepository } = await import('./supabase-repository');
    cached = new SupabaseEventRepository();
  } else {
    cached = new MemoryEventRepository();
  }

  return cached;
}

export { dataMode };
export type { EventRepository };
