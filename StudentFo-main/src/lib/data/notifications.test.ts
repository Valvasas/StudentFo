import { describe, expect, it } from 'vitest';
import { MemoryEventRepository } from './memory-repository';

/**
 * Event seed dengan tenggat utama tepat H-1 (lihat seed-data.ts). Dipatok
 * ke id, bukan ke urutan hasil listEvents: urutan relevance bisa berubah
 * saat bobot rekomendasi disetel ulang, dan test ini bukan test ranking.
 */
const EVENT_H1 = 'e1000000-0000-4000-8000-000000000006';

describe('MemoryEventRepository — notifikasi tenggat', () => {
  it('tidak memunculkan notifikasi untuk pengguna yang belum menyimpan apa pun', async () => {
    const repo = new MemoryEventRepository();

    expect(await repo.listNotifications('user-kosong', 10)).toEqual([]);
    expect(await repo.countUnreadNotifications('user-kosong')).toBe(0);
  });

  it('memunculkan pengingat H-1 untuk kegiatan yang disimpan', async () => {
    const repo = new MemoryEventRepository();
    const userId = 'user-notif-1';

    await repo.saveEvent(userId, EVENT_H1);

    const notifications = await repo.listNotifications(userId, 10);
    expect(notifications.length).toBe(1);
    expect(notifications[0]?.type).toBe('DEADLINE_H1');
    expect(notifications[0]?.event?.id).toBe(EVENT_H1);
    expect(notifications[0]?.message).toContain('besok');
    expect(await repo.countUnreadNotifications(userId)).toBe(1);
  });

  it('memunculkan pengingat untuk kegiatan yang hanya ada di tracker', async () => {
    const repo = new MemoryEventRepository();
    const userId = 'user-notif-2';

    await repo.upsertTrackerItem(userId, EVENT_H1, 'APPLIED');

    const notifications = await repo.listNotifications(userId, 10);
    expect(notifications.length).toBe(1);
    expect(notifications[0]?.event?.id).toBe(EVENT_H1);
  });

  /**
   * Regresi: kegiatan yang disimpan DAN dilacak adalah kasus paling umum —
   * `toggleSaveEventAction` menambahkan entri tracker otomatis saat user
   * menyimpan. Kalau kedua sumber digabung tanpa dedup, setiap pengguna
   * menerima pesan dobel untuk setiap kegiatan yang ia simpan.
   */
  it('tidak menghasilkan notifikasi dobel saat kegiatan disimpan sekaligus dilacak', async () => {
    const repo = new MemoryEventRepository();
    const userId = 'user-notif-3';

    await repo.saveEvent(userId, EVENT_H1);
    await repo.upsertTrackerItem(userId, EVENT_H1, 'SAVED');

    expect((await repo.listNotifications(userId, 10)).length).toBe(1);
  });

  it('menandai satu notifikasi sebagai dibaca, dan statusnya bertahan antar pembacaan', async () => {
    const repo = new MemoryEventRepository();
    const userId = 'user-notif-4';

    await repo.saveEvent(userId, EVENT_H1);
    const [notification] = await repo.listNotifications(userId, 10);
    expect(notification?.isRead).toBe(false);

    await repo.markNotificationAsRead(userId, notification!.id);

    // Daftarnya dihitung ulang setiap dibaca; id-nya harus deterministik
    // supaya tanda "sudah dibaca" tidak hilang di request berikutnya.
    const after = await repo.listNotifications(userId, 10);
    expect(after[0]?.id).toBe(notification!.id);
    expect(after[0]?.isRead).toBe(true);
    expect(await repo.countUnreadNotifications(userId)).toBe(0);
  });

  it('menandai semua notifikasi sebagai dibaca', async () => {
    const repo = new MemoryEventRepository();
    const userId = 'user-notif-5';

    await repo.saveEvent(userId, EVENT_H1);
    expect(await repo.countUnreadNotifications(userId)).toBe(1);

    await repo.markAllNotificationsAsRead(userId);
    expect(await repo.countUnreadNotifications(userId)).toBe(0);
  });

  it('tidak mencampur notifikasi antar pengguna', async () => {
    const repo = new MemoryEventRepository();

    await repo.saveEvent('user-a', EVENT_H1);
    await repo.saveEvent('user-b', EVENT_H1);
    const [notifA] = await repo.listNotifications('user-a', 10);
    await repo.markNotificationAsRead('user-a', notifA!.id);

    expect(await repo.countUnreadNotifications('user-a')).toBe(0);
    expect(await repo.countUnreadNotifications('user-b')).toBe(1);
  });

  it('menghormati batas jumlah yang diminta', async () => {
    const repo = new MemoryEventRepository();
    const userId = 'user-notif-6';

    await repo.saveEvent(userId, EVENT_H1);
    expect(await repo.listNotifications(userId, 0)).toEqual([]);
  });
});
