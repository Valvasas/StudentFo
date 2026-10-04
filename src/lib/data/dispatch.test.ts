import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { MemoryEventRepository } from './memory-repository';
import { DISPATCH_LEASE_SECONDS } from './repository';

/** Tenggat utama H-1 di seed (lihat notifications.test.ts). */
const EVENT_H1 = 'e1000000-0000-4000-8000-000000000006';

afterEach(() => vi.useRealTimers());

/** Orang contoh di seed juga punya tracker — uji hanya melihat penerimanya sendiri. */
async function claimFor(repo: MemoryEventRepository, userId: string) {
  return (await repo.claimDeadlineDispatches(500)).filter((item) => item.recipient.userId === userId);
}

describe('MemoryEventRepository — dispatch pengingat (cermin claim/ack_notification_dispatch)', () => {
  it('klaim → tidak dibagikan lagi selama sewa → ack → selesai', async () => {
    const repo = new MemoryEventRepository();
    await repo.saveEvent('user-dispatch', EVENT_H1);

    const [first, ...rest] = await claimFor(repo, 'user-dispatch');
    expect(rest).toEqual([]);
    expect(first).toMatchObject({
      type: 'DEADLINE_H1',
      recipient: { userId: 'user-dispatch', email: null },
      event: { id: EVENT_H1, daysLeft: 1 },
    });
    expect(first?.message).toContain('besok');

    expect(await claimFor(repo, 'user-dispatch')).toEqual([]);
    expect(await repo.acknowledgeDeadlineDispatches([first!.notificationId, first!.notificationId, 'id-asing'])).toBe(1);
    expect(await repo.acknowledgeDeadlineDispatches([first!.notificationId])).toBe(0);
  });

  it('sewa yang habis tanpa ack membuat pengingat diklaim ulang (at-least-once)', async () => {
    const repo = new MemoryEventRepository();
    await repo.saveEvent('user-lease', EVENT_H1);
    const [claimed] = await claimFor(repo, 'user-lease');

    vi.useFakeTimers({ now: Date.now() + (DISPATCH_LEASE_SECONDS + 1) * 1000, toFake: ['Date'] });
    const [again] = await claimFor(repo, 'user-lease');
    expect(again?.notificationId).toBe(claimed?.notificationId);
  });

  it('ack sebelum diklaim tidak menandai apa pun', async () => {
    const repo = new MemoryEventRepository();
    await repo.saveEvent('user-early', EVENT_H1);
    const [notification] = await repo.listNotifications('user-early', 10);
    expect(await repo.acknowledgeDeadlineDispatches([notification!.id])).toBe(0);
    expect(await claimFor(repo, 'user-early')).toHaveLength(1);
  });
});

describe('MemoryEventRepository — lencana & promosi (ADR-049)', () => {
  it('hanya acara APPROVED; perubahan langsung terlihat di katalog dan daftar promosi', async () => {
    const repo = new MemoryEventRepository();
    const target = (await repo.listEvents({ sort: 'newest', pageSize: 48 })).items.find((event) => !event.featuredUntil)!;
    const until = new Date(Date.now() + 5 * 86_400_000).toISOString();

    await repo.updateEventPresentation({ eventId: target.id, verificationBadge: 'COMMUNITY', featuredUntil: until });
    const updated = await repo.getEventBySlug(target.slug);
    expect(updated).toMatchObject({ verificationBadge: 'COMMUNITY', featuredUntil: until });
    expect((await repo.listFeaturedEvents(50)).map((event) => event.id)).toContain(target.id);

    const promotedFirst = await repo.listEvents({ sort: 'newest', pageSize: 48, promoted: true });
    expect(promotedFirst.items.slice(0, 2).map((event) => event.id)).toContain(target.id);

    await repo.updateEventPresentation({ eventId: target.id, verificationBadge: null, featuredUntil: null });
    expect(await repo.getEventBySlug(target.slug)).toMatchObject({ verificationBadge: null, featuredUntil: null });
  });

  it('acara PENDING atau tak dikenal ditolak — promosi bukan pintu belakang penerbitan', async () => {
    const repo = new MemoryEventRepository();
    const [pending] = await repo.listByStatus('PENDING', 1);
    for (const eventId of [pending!.id, 'tidak-ada']) {
      await expect(repo.updateEventPresentation({ eventId, verificationBadge: 'OFFICIAL_GOV', featuredUntil: null })).rejects.toSatisfy(
        (error: unknown) => error instanceof AppError && error.reason === 'event_unavailable',
      );
    }
  });

  it('filter biaya: gratis & berbayar saling lepas; yang belum diketahui tidak masuk keduanya', async () => {
    const repo = new MemoryEventRepository();
    const all = await repo.listEvents({ pageSize: 48 });
    const free = await repo.listEvents({ pageSize: 48, cost: 'free' });
    const paid = await repo.listEvents({ pageSize: 48, cost: 'paid' });
    expect(free.items.every((event) => event.isFree === true)).toBe(true);
    expect(paid.items.every((event) => event.isFree === false)).toBe(true);
    expect(free.total).toBeGreaterThan(0);
    expect(paid.total).toBeGreaterThan(0);
    expect(free.total + paid.total).toBeLessThan(all.total);
  });
});
