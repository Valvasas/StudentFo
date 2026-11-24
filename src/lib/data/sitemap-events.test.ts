import { describe, expect, it } from 'vitest';
import { getDeadlineState } from '@/lib/deadline';
import { MemoryEventRepository } from './memory-repository';

/** Sitemap = kegiatan yang masih bisa didaftari (ADR-097); yang tutup tetap bisa dibuka tapi tidak disetor. */
describe('listSitemapEvents', () => {
  it('hanya kegiatan tayang yang belum tutup, tanpa data uji, tanpa duplikat', async () => {
    const repository = new MemoryEventRepository();
    const all = await repository.listEvents({ includeClosed: true, pageSize: 48, sort: 'newest' });
    const open = all.items.filter((event) => event.status === 'APPROVED' && getDeadlineState(event.primaryDeadlineAt).urgency !== 'closed');
    const closed = all.items.filter((event) => !open.includes(event));
    expect(closed.length).toBeGreaterThan(0);

    const [demo] = open;
    await repository.setEventTrust({ eventId: demo!.id, isDemo: true });

    const entries = await repository.listSitemapEvents(5000);
    const slugs = entries.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).not.toContain(demo!.slug);
    for (const event of closed) expect(slugs).not.toContain(event.slug);
    expect(slugs.length).toBe(open.length - 1);
    for (const entry of entries) expect(Number.isNaN(Date.parse(entry.updatedAt))).toBe(false);
  });

  it('menghormati batas', async () => {
    expect(await new MemoryEventRepository().listSitemapEvents(2)).toHaveLength(2);
  });
});
