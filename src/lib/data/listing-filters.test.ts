import { describe, expect, it } from 'vitest';
import { MemoryEventRepository } from './memory-repository';

describe('MemoryEventRepository.listEvents — lokasi & mode', () => {
  it('lokasi dicocokkan persis, seperti `.in()` di Supabase', async () => {
    const repo = new MemoryEventRepository();
    const result = await repo.listEvents({ locations: ['Bandung'], pageSize: 48 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((event) => event.location === 'Bandung')).toBe(true);
    expect((await repo.listEvents({ locations: ['bandung'], pageSize: 48 })).total).toBe(0);
  });

  it('mode daring hanya mengembalikan kegiatan daring, luring sebaliknya', async () => {
    const repo = new MemoryEventRepository();
    const online = await repo.listEvents({ mode: 'online', pageSize: 48 });
    const onsite = await repo.listEvents({ mode: 'onsite', pageSize: 48 });
    const all = await repo.listEvents({ pageSize: 48 });
    expect(online.items.every((event) => event.isOnline)).toBe(true);
    expect(onsite.items.every((event) => !event.isOnline)).toBe(true);
    expect(online.total + onsite.total).toBe(all.total);
  });
});
