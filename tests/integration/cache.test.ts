import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CacheLayer } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { actAs, createEvent, createUser } from './harness';

/** Data Cache tiruan: kunci = keyParts + argumen (seperti unstable_cache), bisa dikosongkan seperti revalidateTag. */
function recordingCache() {
  const store = new Map<string, unknown>();
  const misses = new Map<string, number>();
  const layer: CacheLayer = (fn, keyParts) => async (...args) => {
    const key = JSON.stringify([keyParts, args]);
    if (!store.has(key)) {
      const name = keyParts.join('/');
      misses.set(name, (misses.get(name) ?? 0) + 1);
      store.set(key, await fn(...args));
    }
    return store.get(key) as Awaited<ReturnType<typeof fn>>;
  };
  // Hitung miss per jenis query: listing juga membaca statistik (mode hitung, ADR-035).
  return {
    layer,
    misses: (name = 'events-listing-v1') => misses.get(name) ?? 0,
    invalidate: () => store.clear(),
  };
}

describe('cache data publik SupabaseEventRepository', () => {
  it('listing & detail dibaca sekali, lalu dari cache sampai tag dicabut', async () => {
    const token = `zc${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    createEvent({ title: `Lomba Cache Pertama ${token}` });
    const cache = recordingCache();
    const repo = new SupabaseEventRepository(cache.layer);

    const first = await repo.listEvents({ search: token });
    createEvent({ title: `Lomba Cache Kedua ${token}` });
    const second = await repo.listEvents({ search: token });
    expect(second.total).toBe(first.total); // masih dari cache
    expect(cache.misses()).toBe(1);

    cache.invalidate(); // = revalidateTag('events') setelah moderasi
    expect((await repo.listEvents({ search: token })).total).toBe(first.total + 1);
  });

  it('urutan filter berbeda berbagi satu entri cache', async () => {
    const cache = recordingCache();
    const repo = new SupabaseEventRepository(cache.layer);
    await repo.listEvents({ types: ['LOMBA', 'BEASISWA'], categories: ['sains', 'teknologi'] });
    await repo.listEvents({ types: ['BEASISWA', 'LOMBA'], categories: ['teknologi', 'sains'] });
    expect(cache.misses()).toBe(1);
  });

  it('profil TIDAK masuk kunci cache: kandidat dibagi, peringkat tetap personal', async () => {
    const token = `zp${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    createEvent({ title: `Magang Desain ${token}`, categories: ['desain'], levels: ['SMA_SMK'] });
    createEvent({ title: `Riset Sains ${token}`, categories: ['sains'], levels: ['S2'] });
    const cache = recordingCache();
    const repo = new SupabaseEventRepository(cache.layer);

    const designer = await repo.listEvents({ search: token, profile: { interests: ['desain'], educationLevel: 'SMA_SMK' } });
    const scientist = await repo.listEvents({ search: token, profile: { interests: ['sains'], educationLevel: 'S2' } });
    expect(cache.misses()).toBe(1);
    expect(designer.items[0]?.title).toContain('Magang Desain');
    expect(scientist.items[0]?.title).toContain('Riset Sains');
  });

  it('data publik di-cache tanpa identitas: pengguna yang masuk tidak mengubah hasil maupun kunci', async () => {
    const cache = recordingCache();
    const repo = new SupabaseEventRepository(cache.layer);
    const event = createEvent();
    actAs(null);
    const asGuest = await repo.getEventBySlug(event.slug);
    actAs(createUser({ role: 'ADMIN' }));
    const asAdmin = await repo.getEventBySlug(event.slug);
    actAs(null);
    expect(asAdmin).toEqual(asGuest);
    expect(cache.misses('events-detail-v1')).toBe(1);
  });
});
