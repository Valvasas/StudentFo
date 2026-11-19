import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_COMMENT_LIMITS } from '@/lib/event-comments';
import { AppError } from '@/lib/errors';
import { CONNECTION_PAGE, type NetworkViewer } from '@/lib/network';
import { MemoryEventRepository } from './memory-repository';
import type { EventActor } from './repository';

/**
 * Suka, komentar, bagikan, "Lagi ramai", hapus postingan (ADR-092) di mode
 * seed — skenario yang sama dengan supabase/tests/119_event_engagement.test.sql.
 */
async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

const actor = (id: string, fullName = `Nama ${id}`, isAdmin = false): EventActor => ({ id, fullName, email: `${id}@demo`, isAdmin });
const network = (id: string, fullName = `Nama ${id}`): NetworkViewer => ({ id, fullName, educationLevel: 'D4_S1', major: null, interests: [] });
const dinda = actor('dinda', 'Dinda Pratiwi Sari');
const bima = actor('bima', 'Bima Arya');

describe('MemoryEventRepository — suka & komentar kegiatan', () => {
  let repository: MemoryEventRepository;
  let eventId: string;

  // Jam sistem dibekukan ke jam data contoh: `listEvents()` membaca `new Date()`,
  // dan suka contoh meluruh (paruh 72 jam) — tanpa ini tes gagal begitu kalender maju.
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T03:00:00Z'));
    repository = new MemoryEventRepository(new Date('2026-11-16T03:00:00Z'));
    // Kegiatan tanpa suka/komentar contoh, supaya angka bisa dihitung tangan.
    const seeded = new Set(['kompetisi-inovasi-perangkat-lunak-nusantara-2026', 'festival-film-pendek-pelajar-nusantara', 'lomba-karya-tulis-ilmiah-energi-terbarukan']);
    eventId = (await repository.listEvents({ types: ['LOMBA'], pageSize: 48 })).items.find((event) => !seeded.has(event.slug))!.id;
  });

  it('data contoh: kegiatan unggulan langsung punya suka & komentar', async () => {
    const [top] = (await repository.listEvents({ sort: 'popular', pageSize: 3 })).items;
    expect(top?.trendScore).toBeGreaterThan(0);
    expect(top?.counts?.likes).toBeGreaterThan(0);
  });

  it('suka menyala/mati, tamu melihat angka, kegiatan tak tayang ditolak', async () => {
    expect(await repository.toggleEventLike('bima', eventId)).toEqual({ liked: true, likes: 1 });
    expect(await repository.toggleEventLike('bima', eventId)).toEqual({ liked: false, likes: 0 });
    await repository.toggleEventLike('bima', eventId);
    await repository.toggleEventLike('dinda', eventId);
    expect(await repository.getEventEngagement(null, eventId)).toMatchObject({ likes: 2, liked: false, available: true });
    expect((await repository.getEventEngagement('bima', eventId)).liked).toBe(true);
    // Ekspor data akun: hanya suka milik sendiri.
    const liked = (await repository.listEvents({ types: ['LOMBA'], pageSize: 48 })).items.find((event) => event.id === eventId);
    expect((await repository.listMyEventLikes('bima')).map((like) => like.eventSlug)).toEqual([liked?.slug]);
    expect(await repository.listMyEventLikes('orang-lain')).toEqual([]);

    const pending = (await repository.listByStatus('PENDING', 1))[0]!;
    expect(await reason(repository.toggleEventLike('bima', pending.id))).toBe('event_unavailable');
    expect(await repository.getEventEngagement('bima', pending.id)).toMatchObject({ likes: 0, comments: 0 });
  });

  it('komentar: validasi, kontak ditolak, balasan satu tingkat, penulis dikabari sekali per kegiatan', async () => {
    expect(await reason(repository.createEventComment(dinda, eventId, ' x ', null))).toBe('invalid_event_comment');
    expect(await reason(repository.createEventComment(dinda, eventId, 'chat aku 081234567890', null))).toBe('community_contact_blocked');
    const pending = (await repository.listByStatus('PENDING', 1))[0]!;
    expect(await reason(repository.createEventComment(dinda, pending.id, 'Belum tayang kok bisa?', null))).toBe('comment_event_unavailable');

    const top = await repository.createEventComment(dinda, eventId, 'Tahun lalu temanya apa ya?', null);
    const reply = await repository.createEventComment(bima, eventId, 'Energi terbarukan, cek arsipnya.', top);
    await repository.createEventComment(bima, eventId, 'Juri dari kampus mana?', top);
    await repository.createEventComment(dinda, eventId, 'Makasih!', top);
    expect(await reason(repository.createEventComment(bima, eventId, 'Balasan untuk balasan', reply))).toBe('event_comment_not_found');

    const page = await repository.listEventComments('bima', eventId);
    expect(page.total).toBe(4);
    expect(page.threads).toHaveLength(1);
    expect(page.threads[0]).toMatchObject({ id: top, isMine: false, role: null, author: { name: 'Dinda S.' } });
    expect(page.threads[0]!.replies.map((item) => item.body)).toEqual(['Energi terbarukan, cek arsipnya.', 'Juri dari kampus mana?', 'Makasih!']);

    const notes = (await repository.listNotifications('dinda', 50)).filter((note) => note.type === 'EVENT_COMMENT_REPLY');
    expect(notes).toHaveLength(1);
    expect((await repository.listNotifications('bima', 50)).some((note) => note.type === 'EVENT_COMMENT_REPLY')).toBe(false);
    expect((await repository.getEventEngagement(null, eventId)).comments).toBe(4);
  });

  it('penanda resmi: pengelola terverifikasi = Penyelenggara, admin = Tim StudentFo', async () => {
    repository.seedDemoOrganizer({ id: 'org', fullName: 'Sekar Ayu', email: 'org@demo' });
    const managedId = (await repository.listManagedEvents('org'))[0]!.event.id;
    await repository.createEventComment(actor('org', 'Sekar Ayu'), managedId, 'Panitia di sini, tema diumumkan Senin.', null);
    await repository.createEventComment(actor('admin', 'Admin', true), managedId, 'Info dari tim StudentFo.', null);
    const threads = (await repository.listEventComments('bima', managedId)).threads;
    expect(threads.find((thread) => thread.body.startsWith('Panitia di sini'))?.role).toBe('organizer');
    expect(threads.find((thread) => thread.body.startsWith('Info dari tim'))?.role).toBe('team');
    expect(threads.filter((thread) => thread.role === null).every((thread) => !thread.isMine)).toBe(true);
  });

  it('blokir menyembunyikan dua arah; hapus membawa balasan; batas 30/hari', async () => {
    const top = await repository.createEventComment(dinda, eventId, 'Komentar Dinda', null);
    await repository.createEventComment(bima, eventId, 'Balasan Bima', top);
    // Memblokir mensyaratkan target pernah terlihat (ADR-041).
    await repository.updateNetworkProfile(network('bima', 'Bima Arya'), { discoverable: true, headline: null });
    await repository.blockPerson('dinda', 'bima');
    expect((await repository.listEventComments('bima', eventId)).total).toBe(0);
    expect(await reason(repository.createEventComment(bima, eventId, 'Masih bisa membalas?', top))).toBe('event_comment_not_found');
    await repository.unblockPerson('dinda', 'bima');

    expect(await reason(repository.deleteEventComment('bima', top))).toBe('event_comment_not_found');
    await repository.deleteEventComment('dinda', top);
    expect((await repository.listEventComments('bima', eventId)).total).toBe(0);

    // Bima sudah berkomentar sekali di atas (balasan yang ditolak karena blokir tidak memakan kuota).
    for (let index = 1; index < EVENT_COMMENT_LIMITS.perDay; index += 1) await repository.createEventComment(bima, eventId, `Komentar ${index}`, null);
    expect(await reason(repository.createEventComment(bima, eventId, 'Satu lagi', null))).toBe('comment_rate_limited');
  });

  it('laporan: tiga pelapor menyembunyikan utas (kartu ikut), diabaikan = tampil lagi, moderator final', async () => {
    const top = await repository.createEventComment(dinda, eventId, 'Tahun lalu temanya apa ya?', null);
    await repository.createEventComment(bima, eventId, 'Balasan yang ikut tersembunyi', top);
    expect(await reason(repository.reportEventComment('dinda', { commentId: top, reason: 'spam', details: null }))).toBe('report_unavailable');
    await repository.reportEventComment('r1', { commentId: top, reason: 'spam', details: 'Promosi' });
    await repository.reportEventComment('r1', { commentId: top, reason: 'spam', details: 'Klik lagi' });
    await repository.reportEventComment('r2', { commentId: top, reason: 'misleading', details: null });
    expect((await repository.listEventComments('bima', eventId)).total).toBe(2);
    await repository.reportEventComment('r3', { commentId: top, reason: 'harassment', details: null });
    expect((await repository.listEventComments('bima', eventId)).total).toBe(0);
    const [card] = (await repository.listEvents({ pageSize: 48 })).items.filter((event) => event.id === eventId);
    expect(card?.counts?.comments).toBe(0);

    const [queue] = await repository.listEventCommentReports(50);
    expect(queue).toMatchObject({ commentId: top, reportCount: 3, hidden: true, hiddenAuto: true, reasons: ['harassment', 'misleading', 'spam'] });
    await repository.resolveEventCommentReport({ reportId: queue!.reportId, actorId: 'admin', actorName: 'Admin', outcome: 'DISMISSED', hide: false, note: 'Wajar' });
    expect((await repository.listEventComments('bima', eventId)).total).toBe(2);
    expect((await repository.listNotifications('r1', 50)).some((note) => note.type === 'REPORT_DISMISSED' && note.message.includes('komentar kegiatan'))).toBe(true);

    await repository.hideEventCommentAsAdmin({ commentId: top, actorId: 'admin', actorName: 'Admin', reason: 'Menyesatkan' });
    expect((await repository.listEventComments('bima', eventId)).total).toBe(0);
    expect(await reason(repository.hideEventCommentAsAdmin({ commentId: top, actorId: 'admin', reason: null }))).toBe('event_comment_not_found');
    expect((await repository.listMyEventComments('dinda')).find((item) => item.id === top)?.hidden).toBe(true);
  });
});

describe('MemoryEventRepository — bagikan ke koneksi', () => {
  let repository: MemoryEventRepository;
  let eventId: string;

  async function connect(a: NetworkViewer, b: NetworkViewer) {
    await repository.updateNetworkProfile(b, { discoverable: true, headline: null });
    await repository.requestConnection(a, b.id, null);
    const [pending] = (await repository.listConnections(b.id, { limit: CONNECTION_PAGE.maxLimit, cursor: null, kind: 'incoming' })).items;
    await repository.respondToConnection(b.id, pending!.id, 'accept');
  }

  beforeEach(async () => {
    repository = new MemoryEventRepository();
    eventId = (await repository.listEvents({ types: ['LOMBA'] })).items[0]!.id;
  });

  it('hanya koneksi diterima yang dikabari; kalimat tetap; kirim ulang = notifikasi yang sama', async () => {
    const ayu = network('ayu', 'Ayu Lestari');
    const budi = network('budi', 'Budi Santoso');
    const citra = network('citra', 'Citra');
    await connect(ayu, budi);
    await repository.updateNetworkProfile(citra, { discoverable: true, headline: null });
    await repository.requestConnection(ayu, citra.id, null);

    expect((await repository.listShareRecipients(ayu)).map((person) => person.userId)).toEqual(['budi']);
    expect(await repository.shareEventWithConnections(ayu, eventId, ['budi', 'budi', 'citra', 'ayu', 'asing'])).toBe(1);
    await repository.shareEventWithConnections(ayu, eventId, ['budi']);
    const shared = (await repository.listNotifications('budi', 50)).filter((note) => note.type === 'EVENT_SHARED');
    expect(shared).toHaveLength(1);
    expect(shared[0]?.message).toMatch(/^Ayu L\. membagikan ".+" kepadamu\.$/);
    expect((await repository.listNotifications('citra', 50)).some((note) => note.type === 'EVENT_SHARED')).toBe(false);

    expect(await reason(repository.shareEventWithConnections(ayu, eventId, []))).toBe('invalid_share');
    const pending = (await repository.listByStatus('PENDING', 1))[0]!;
    expect(await reason(repository.shareEventWithConnections(ayu, pending.id, ['budi']))).toBe('event_unavailable');
  });
});

describe('MemoryEventRepository — "Lagi ramai"', () => {
  it('skor = Σ bobot × peluruhan; kegiatan yang baru ramai naik; urutan tidak pernah naik-turun', async () => {
    const repository = new MemoryEventRepository();
    const before = (await repository.listEvents({ sort: 'popular', pageSize: 48 })).items;
    const quiet = before.at(-1)!;
    expect(quiet.trendScore).toBe(0);
    for (const userId of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) await repository.toggleEventLike(userId, quiet.id);
    await repository.saveEvent('a', quiet.id);
    // Dua komentar satu orang = satu sinyal komentar.
    await repository.createEventComment(actor('a'), quiet.id, 'Aku ikut!', null);
    await repository.createEventComment(actor('a'), quiet.id, 'Ada yang mau setim?', null);

    const after = (await repository.listEvents({ sort: 'popular', pageSize: 48 })).items;
    const scored = after.find((event) => event.id === quiet.id)!;
    expect(scored.trendScore).toBeCloseTo(10 * 1 + 3 + 2, 3);
    expect(after.indexOf(scored)).toBeLessThan(before.indexOf(quiet));
    const scores = after.map((event) => event.trendScore ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('MemoryEventRepository — perawatan postingan & cara mendaftar', () => {
  let repository: MemoryEventRepository;
  let eventId: string;
  const admin = { reviewerId: 'admin', reviewerName: 'Admin' };

  beforeEach(async () => {
    repository = new MemoryEventRepository();
    // Kegiatan tanpa formulir (data contoh memberi pendaftar ke beberapa kegiatan).
    const candidates = (await repository.listEvents({ types: ['LOMBA'], pageSize: 48 })).items;
    for (const candidate of candidates) {
      if (!(await repository.getRegistrationForm(candidate.id))) {
        eventId = candidate.id;
        break;
      }
    }
  });

  it('hapus permanen: harus diturunkan dulu, wajib alasan, tercatat, semua turunan hilang', async () => {
    await repository.toggleEventLike('bima', eventId);
    await repository.createEventComment(bima, eventId, 'Salah info ya ini?', null);
    await repository.saveEvent('bima', eventId);
    expect(await reason(repository.deleteEventPermanently({ eventId, actorId: 'admin', reason: 'Salah posting' }))).toBe('event_not_taken_down');

    await repository.reviewEvent({ eventId, decision: 'REJECTED', ...admin, reason: 'Dihapus admin: salah posting' });
    expect((await repository.searchEventsForAdmin({ search: '', status: 'REJECTED', limit: 10 })).find((row) => row.id === eventId)?.rejectionReason).toBe(
      'Dihapus admin: salah posting',
    );
    expect(await reason(repository.deleteEventPermanently({ eventId, actorId: 'admin', reason: 'abc' }))).toBe('deletion_reason_required');
    await repository.deleteEventPermanently({ eventId, actorId: 'admin', actorName: 'Admin', reason: 'Salah posting, duplikat' });

    expect(await repository.getEventForAdmin(eventId)).toBeNull();
    expect(await repository.listSavedEventIds('bima')).toEqual([]);
    expect(await repository.listMyEventComments('bima')).toEqual([]);
    const [log] = await repository.listModerationLog(1);
    expect(log).toMatchObject({ subjectId: eventId, fromStatus: 'REJECTED', toStatus: 'DELETED', reason: 'Salah posting, duplikat' });
    expect(await reason(repository.deleteEventPermanently({ eventId, actorId: 'admin', reason: 'Sekali lagi' }))).toBe('event_not_found');
  });

  it('pendaftar aktif menghalangi hapus permanen', async () => {
    repository.seedDemoOrganizer({ id: 'org', fullName: 'Sekar Ayu', email: 'org@demo' });
    const withRegistrants = (await repository.listManagedEvents('org')).find((item) => item.event.isFree === false) ?? (await repository.listManagedEvents('org'))[0]!;
    const managedId = withRegistrants.event.id;
    const registrations = await repository.listEventRegistrations(actor('org', 'Sekar Ayu'), managedId);
    if (!registrations.some((entry) => entry.status !== 'CANCELLED' && entry.status !== 'REJECTED')) {
      await repository.saveRegistrationForm(actor('org'), managedId, { isOpen: true, intro: null, fields: [], capacity: null, feeAmount: null, paymentInstructions: null });
      await repository.registerForEvent(bima, managedId, {});
    }
    await repository.reviewEvent({ eventId: managedId, decision: 'REJECTED', ...admin, reason: 'Uji' });
    expect(await reason(repository.deleteEventPermanently({ eventId: managedId, actorId: 'admin', reason: 'Salah posting' }))).toBe('event_has_registrations');
  });

  it('cara mendaftar: pengelola & admin boleh, orang lain tidak; nilai di luar daftar ditolak', async () => {
    repository.seedDemoOrganizer({ id: 'org', fullName: 'Sekar Ayu', email: 'org@demo' });
    const managedId = (await repository.listManagedEvents('org'))[0]!.event.id;
    await repository.setEventRegistrationMode(actor('org'), managedId, 'studentfo');
    expect((await repository.getEventForAdmin(managedId))?.registrationMode).toBe('studentfo');
    expect(await reason(repository.setEventRegistrationMode(bima, managedId, 'external'))).toBe('not_event_manager');
    expect(await reason(repository.setEventRegistrationMode(actor('admin', 'Admin', true), managedId, 'gform' as 'external'))).toBe('invalid_request');
    await repository.setEventRegistrationMode(actor('admin', 'Admin', true), managedId, 'external');
    expect((await repository.getEventForAdmin(managedId))?.registrationMode).toBe('external');
  });
});
