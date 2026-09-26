import { describe, expect, it } from 'vitest';
import { MemoryEventRepository } from './memory-repository';
import type { AppError } from '@/lib/errors';

describe('MemoryEventRepository — Saved Events & Application Tracker', () => {
  it('dapat menyimpan dan membatalkan simpanan kegiatan', async () => {
    const repo = new MemoryEventRepository();
    const all = await repo.listEvents({});
    const eventId = all.items[0]!.id;
    const userId = 'user-test-1';

    // Awalnya belum disimpan
    expect(await repo.isEventSaved(userId, eventId)).toBe(false);
    expect(await repo.listSavedEventIds(userId)).toEqual([]);

    // Simpan event
    await repo.saveEvent(userId, eventId);
    expect(await repo.isEventSaved(userId, eventId)).toBe(true);
    expect(await repo.listSavedEventIds(userId)).toContain(eventId);

    const savedEvents = await repo.listSavedEvents(userId);
    expect(savedEvents.length).toBe(1);
    expect(savedEvents[0]?.id).toBe(eventId);

    // Batalkan simpan
    await repo.unsaveEvent(userId, eventId);
    expect(await repo.isEventSaved(userId, eventId)).toBe(false);
    expect(await repo.listSavedEventIds(userId)).toEqual([]);
    expect(await repo.listSavedEvents(userId)).toEqual([]);
  });

  it('dapat menambah, memperbarui, dan menghapus entri tracker', async () => {
    const repo = new MemoryEventRepository();
    const all = await repo.listEvents({});
    const eventId = all.items[1]!.id;
    const userId = 'user-test-2';

    // Tambahkan entri tracker
    await repo.upsertTrackerItem(userId, eventId, 'APPLIED', 'Sudah kirim proposal via web');
    let items = await repo.listTrackerItems(userId);
    expect(items.length).toBe(1);
    expect(items[0]?.status).toBe('APPLIED');
    expect(items[0]?.notes).toBe('Sudah kirim proposal via web');
    expect(items[0]?.event.id).toBe(eventId);

    // Update status ke INTERVIEW
    await repo.upsertTrackerItem(userId, eventId, 'INTERVIEW', 'Jadwal wawancara besok');
    items = await repo.listTrackerItems(userId);
    expect(items.length).toBe(1);
    expect(items[0]?.status).toBe('INTERVIEW');
    expect(items[0]?.notes).toBe('Jadwal wawancara besok');

    // Hapus dari tracker
    await repo.removeTrackerItem(userId, eventId);
    items = await repo.listTrackerItems(userId);
    expect(items.length).toBe(0);
  });

  it('menggunakan profil pengguna untuk mempersonalisasi ranking listEvents', async () => {
    const repo = new MemoryEventRepository();
    const _resWithoutProfile = await repo.listEvents({ sort: 'relevance' });

    // Berikan profil dengan minat 'teknologi' dan jenjang 'D4_S1'
    const resWithProfile = await repo.listEvents({
      sort: 'relevance',
      profile: {
        educationLevel: 'D4_S1',
        interests: ['teknologi'],
      },
    });

    expect(resWithProfile.items.length).toBeGreaterThan(0);
    // Event yang cocok dengan profil teknologi & D4_S1 seharusnya mendapat skor tinggi
    const topEvent = resWithProfile.items[0];
    expect(
      topEvent?.categorySlugs.includes('teknologi') ||
        topEvent?.educationLevels.includes('D4_S1') ||
        topEvent?.educationLevels.includes('UMUM'),
    ).toBe(true);
  });

  it('menghitung organizerCount unik secara benar pada getStats', async () => {
    const repo = new MemoryEventRepository();
    const stats = await repo.getStats();
    expect(stats.organizerCount).toBeGreaterThan(0);
    expect(stats.totalActive).toBeGreaterThanOrEqual(stats.organizerCount);
  });
});

describe('MemoryEventRepository — event yang tidak tayang (paritas policy saved_events_own/tracker_own)', () => {
  it('menyimpan atau melacak event PENDING ditolak event_unavailable, seperti RLS produksi', async () => {
    const repo = new MemoryEventRepository();
    const [pending] = await repo.listByStatus('PENDING', 1);
    const reasons = await Promise.all(
      [
        () => repo.saveEvent('u-paritas', pending!.id),
        () => repo.upsertTrackerItem('u-paritas', pending!.id, 'APPLIED'),
        () => repo.addTrackerItemIfAbsent('u-paritas', pending!.id),
      ].map((run) => run().then(() => 'ok', (error: AppError) => error.reason)),
    );
    expect(reasons).toEqual(['event_unavailable', 'event_unavailable', 'event_unavailable']);
    expect(await repo.isEventSaved('u-paritas', pending!.id)).toBe(false);
  });
});
