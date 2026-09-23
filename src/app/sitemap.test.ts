import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/data', () => ({ getEventRepository: vi.fn() }));

const { getEventRepository } = await import('@/lib/data');
const sitemap = (await import('./sitemap')).default;

function makeEvent(id: string) {
  return {
    id,
    slug: `event-${id}`,
    title: `Event ${id}`,
    organizer: 'Panitia',
    eventType: 'LOMBA' as const,
    educationLevels: [],
    categorySlugs: [],
    location: null,
    isOnline: true,
    status: 'APPROVED' as const,
    savedCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    primaryDeadlineAt: null,
    primaryDeadlineLabel: null,
  };
}

describe('sitemap', () => {
  it('menarik SEMUA halaman, bukan cuma halaman pertama', async () => {
    const totalEvents = 130;
    const pageSize = 48;
    const totalPages = Math.ceil(totalEvents / pageSize);

    const listEvents = vi.fn(async ({ page }: { page: number }) => {
      const start = (page - 1) * pageSize;
      const items = Array.from(
        { length: Math.min(pageSize, totalEvents - start) },
        (_, i) => makeEvent(String(start + i)),
      );
      return { items, total: totalEvents, page, pageSize, totalPages };
    });

    vi.mocked(getEventRepository).mockResolvedValue({ listEvents } as never);

    const result = await sitemap();

    const eventUrls = result.filter((entry) => entry.url.includes('/events/event-'));
    expect(eventUrls).toHaveLength(totalEvents);
    expect(listEvents).toHaveBeenCalledTimes(totalPages);
  });

  it('selalu memakai sort "newest", tidak pernah default relevance', async () => {
    const listEvents = vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 48, totalPages: 1 }));
    vi.mocked(getEventRepository).mockResolvedValue({ listEvents } as never);

    await sitemap();

    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({ sort: 'newest' }));
  });

  it('tidak berhenti sebelum waktunya kalau totalPages berubah di antara panggilan', async () => {
    let call = 0;
    const listEvents = vi.fn(async ({ page }: { page: number }) => {
      call += 1;
      const totalPages = call === 1 ? 2 : 3;
      return { items: [makeEvent(`p${page}`)], total: 3 * 48, page, pageSize: 48, totalPages };
    });
    vi.mocked(getEventRepository).mockResolvedValue({ listEvents } as never);

    const result = await sitemap();
    const eventUrls = result.filter((entry) => entry.url.includes('/events/event-'));
    expect(eventUrls).toHaveLength(3);
  });

  it('tetap menyajikan rute statis kalau repository gagal, bukan melempar error', async () => {
    vi.mocked(getEventRepository).mockRejectedValue(new Error('DB down'));

    const result = await sitemap();

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((entry) => !entry.url.includes('/events/event-'))).toBe(true);
  });

  it('berhenti di batas pengaman kalau totalPages tidak masuk akal', async () => {
    const listEvents = vi.fn(async ({ page }: { page: number }) => ({
      items: [makeEvent(`huge-${page}`)],
      total: Number.MAX_SAFE_INTEGER,
      page,
      pageSize: 48,
      totalPages: Number.MAX_SAFE_INTEGER,
    }));
    vi.mocked(getEventRepository).mockResolvedValue({ listEvents } as never);

    const result = await sitemap();

    expect(listEvents.mock.calls.length).toBeLessThanOrEqual(50_000);
    expect(result.length).toBeGreaterThan(0);
  }, 10_000);
});
