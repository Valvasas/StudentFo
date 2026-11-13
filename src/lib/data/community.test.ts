import { beforeEach, describe, expect, it } from 'vitest';
import { COMMUNITY_LIMITS } from '@/lib/community';
import { AppError } from '@/lib/errors';
import type { NetworkViewer } from '@/lib/network';
import { MemoryEventRepository } from './memory-repository';
import type { CommunityViewer } from './repository';

/**
 * Komunitas (ADR-087) di mode seed — skenario yang sama dengan
 * supabase/tests/118_community.test.sql.
 */

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

const viewer = (id: string, fullName = `Nama ${id}`): CommunityViewer => ({ id, fullName });
const networkViewer = (id: string): NetworkViewer => ({ id, fullName: `Nama ${id}`, educationLevel: 'D4_S1', major: null, interests: [] });
const dinda = viewer('dinda', 'Dinda Pratiwi Sari');
const bima = viewer('bima', 'Bima');
const post = { topic: 'tanya' as const, title: 'Boleh tim lintas kampus?', body: 'Ada yang tahu apakah lomba ini boleh tim lintas kampus?', eventId: null };

describe('MemoryEventRepository — Komunitas', () => {
  let repository: MemoryEventRepository;

  beforeEach(() => {
    repository = new MemoryEventRepository(new Date('2026-11-12T03:00:00Z'));
  });

  it('data contoh: lini masa terisi, setiap topik punya contoh, nama penulis disingkat', async () => {
    const page = await repository.listCommunityPosts('pembaca', { topic: null, eventId: null, before: null });
    expect(page.available).toBe(true);
    expect(new Set(page.items.map((item) => item.topic))).toEqual(new Set(['tanya', 'cari-tim', 'info', 'cerita']));
    for (const item of page.items) expect(item.author.name).toMatch(/^\S+ [A-Z]\.$/);
    // Urut aktivitas terbaru: postingan yang baru dibalas di atas.
    const times = page.items.map((item) => item.lastActivityAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('menulis → tampil dengan nama tersingkat; kegiatan harus tayang; kontak pribadi ditolak', async () => {
    const id = await repository.createCommunityPost(dinda, post);
    const [first] = (await repository.listCommunityPosts('bima', { topic: 'tanya', eventId: null, before: null })).items;
    expect(first).toMatchObject({ id, title: post.title, isMine: false, replyCount: 0, author: { name: 'Dinda S.' } });

    expect(await reason(repository.createCommunityPost(dinda, { ...post, body: 'Yang minat chat 081234567890 ya' }))).toBe('community_contact_blocked');
    expect(await reason(repository.createCommunityPost(dinda, { ...post, eventId: 'tidak-ada' }))).toBe('community_event_unavailable');
    expect(await reason(repository.createCommunityPost(dinda, { ...post, title: 'Hai' }))).toBe('invalid_community_post');
  });

  it('kursor: halaman berikutnya melanjutkan tanpa mengulang', async () => {
    for (let index = 0; index < COMMUNITY_LIMITS.postsPerDay; index += 1) {
      await repository.createCommunityPost(viewer(`penulis-${index}`), { ...post, title: `Pertanyaan nomor ${index + 1}` });
    }
    const first = await repository.listCommunityPosts('bima', { topic: null, eventId: null, before: null, limit: 4 });
    expect(first.items).toHaveLength(4);
    expect(first.nextCursor).not.toBeNull();
    const second = await repository.listCommunityPosts('bima', { topic: null, eventId: null, before: first.nextCursor, limit: 50 });
    const seen = new Set(first.items.map((item) => item.id));
    expect(second.items.some((item) => seen.has(item.id))).toBe(false);
    expect(first.items.length + second.items.length).toBe((await repository.listCommunityPosts('bima', { topic: null, eventId: null, before: null, limit: 50 })).items.length);
  });

  it('membalas: penulis dikabari SATU kali per postingan (diperbarui), membalas sendiri tidak mengabari', async () => {
    const id = await repository.createCommunityPost(dinda, post);
    await repository.replyToCommunityPost(bima, id, 'Boleh, tahun lalu timku lintas kampus.');
    await repository.replyToCommunityPost(bima, id, 'Cek juga buku panduannya bagian 3.');
    await repository.replyToCommunityPost(dinda, id, 'Terima kasih infonya!');

    const thread = await repository.getCommunityThread('bima', id);
    expect(thread?.replies.map((reply) => reply.isOp)).toEqual([false, false, true]);
    const notes = (await repository.listNotifications('dinda', 20)).filter((notification) => notification.type === 'COMMUNITY_REPLY');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ communityPostId: id, isRead: false });
    expect((await repository.listNotifications('bima', 20)).some((notification) => notification.type === 'COMMUNITY_REPLY')).toBe(false);

    // Dibaca lalu ada balasan baru → belum dibaca lagi, tetap satu baris.
    await repository.markAllNotificationsAsRead('dinda');
    await repository.replyToCommunityPost(viewer('cinta'), id, 'Aku juga mau ikut!');
    const again = (await repository.listNotifications('dinda', 20)).filter((notification) => notification.type === 'COMMUNITY_REPLY');
    expect(again).toHaveLength(1);
    expect(again[0]?.isRead).toBe(false);
  });

  it('"Bermanfaat": bisa ditandai & dilepas, bukan untuk tulisan sendiri', async () => {
    const id = await repository.createCommunityPost(dinda, post);
    expect(await repository.toggleCommunityHelpful('bima', { kind: 'post', id })).toBe(true);
    expect((await repository.getCommunityThread('bima', id))?.post).toMatchObject({ helpfulCount: 1, helped: true });
    expect(await repository.toggleCommunityHelpful('bima', { kind: 'post', id })).toBe(false);
    expect(await reason(repository.toggleCommunityHelpful('dinda', { kind: 'post', id }))).toBe('community_own_content');
  });

  it('blokir menyembunyikan dua arah; penangguhan menghilangkan tulisan', async () => {
    const id = await repository.createCommunityPost(dinda, post);
    await repository.replyToCommunityPost(bima, id, 'Balasan sebelum diblokir.');
    // Memblokir mensyaratkan target pernah terlihat (ADR-041).
    await repository.updateNetworkProfile(networkViewer('bima'), { discoverable: true, headline: null });
    await repository.blockPerson('dinda', 'bima');

    expect(await repository.getCommunityThread('bima', id)).toBeNull();
    expect(await reason(repository.replyToCommunityPost(bima, id, 'Masih bisa membalas?'))).toBe('community_post_not_found');
    expect((await repository.getCommunityThread('dinda', id))?.replies).toHaveLength(0);

    await repository.unblockPerson('dinda', 'bima');
    await repository.updateNetworkProfile(networkViewer('dinda'), { discoverable: true, headline: null });
    await repository.setUserSuspension({ userId: 'dinda', actorId: 'admin', actorName: 'Admin', suspend: true, reason: 'Uji penangguhan' });
    expect(await repository.getCommunityThread('bima', id)).toBeNull();
  });

  it('laporan: bukan tulisan sendiri, satu terbuka per pelapor, tiga pelapor = sembunyi otomatis; diabaikan = tampil lagi', async () => {
    const id = await repository.createCommunityPost(dinda, post);
    const report = (reporter: string) => repository.reportCommunityContent(reporter, { kind: 'post', id, reason: 'spam', details: null });
    expect(await reason(report('dinda'))).toBe('report_unavailable');

    await report('p1');
    await report('p1');
    await report('p2');
    expect((await repository.listCommunityReports(10))[0]).toMatchObject({ reportCount: 2, hidden: false });
    await report('p3');
    expect(await repository.getCommunityThread('bima', id)).toBeNull();
    const [item] = await repository.listCommunityReports(10);
    expect(item).toMatchObject({ reportCount: 3, hidden: true, hiddenAuto: true, authorName: 'Dinda Pratiwi Sari', snapshot: expect.stringContaining(post.title) });
    expect(await repository.countOpenReports()).toBe(3);

    await repository.resolveCommunityReport({ reportId: item!.reportId, actorId: 'admin', actorName: 'Admin Uji', outcome: 'DISMISSED', hide: false, note: 'Pertanyaan wajar' });
    expect(await repository.getCommunityThread('bima', id)).not.toBeNull();
    expect(await repository.listCommunityReports(10)).toHaveLength(0);
    const [entry] = await repository.listModerationLog(1);
    expect(entry).toMatchObject({ subjectType: 'report', toStatus: 'DISMISSED', reason: 'Pertanyaan wajar', title: expect.stringMatching(/^Laporan Komunitas: postingan/) });
    const told = (await repository.listNotifications('p1', 20)).filter((notification) => notification.type === 'REPORT_DISMISSED');
    expect(told).toHaveLength(1);
    expect(told[0]?.message).not.toContain('Pertanyaan wajar');
  });

  it('ditindak + disembunyikan moderator = final; hapus postingan membawa balasan & notifikasinya, laporan tetap', async () => {
    const id = await repository.createCommunityPost(dinda, post);
    await repository.replyToCommunityPost(bima, id, 'Balasan biasa.');
    await repository.reportCommunityContent('p1', { kind: 'post', id, reason: 'harassment', details: 'Menghina' });
    const [item] = await repository.listCommunityReports(10);
    await repository.resolveCommunityReport({ reportId: item!.reportId, actorId: 'admin', outcome: 'RESOLVED', hide: true, note: null });
    expect(await repository.getCommunityThread('bima', id)).toBeNull();
    expect((await repository.listMyCommunityContent('dinda')).find((content) => content.id === id)).toMatchObject({ hidden: true });

    await repository.deleteCommunityPost('dinda', id);
    expect((await repository.listNotifications('dinda', 20)).some((notification) => notification.communityPostId === id)).toBe(false);
    expect(await repository.listMyCommunityContent('bima')).toHaveLength(0);
    expect(await reason(repository.deleteCommunityPost('dinda', id))).toBe('community_post_not_found');
  });

  it(`batas laju: ${COMMUNITY_LIMITS.postsPerDay} postingan per hari`, async () => {
    for (let index = 0; index < COMMUNITY_LIMITS.postsPerDay; index += 1) {
      await repository.createCommunityPost(bima, { ...post, topic: 'cerita', title: `Cerita lomba ke-${index + 1}` });
    }
    expect(await reason(repository.createCommunityPost(bima, { ...post, topic: 'cerita', title: 'Cerita lomba ke-6' }))).toBe('community_rate_limited');
  });
});
