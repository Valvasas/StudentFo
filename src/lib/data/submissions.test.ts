import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { UploadedImage } from '@/lib/image-file';
import type { SubmissionPayload } from '@/types/domain';
import { MemoryEventRepository } from './memory-repository';
import type { MediaViewer } from './repository';

function payload(overrides: Partial<SubmissionPayload> = {}): SubmissionPayload {
  return {
    title: 'Lomba Poster Hari Lingkungan 2026',
    organizer: 'Komunitas Hijau Kampus',
    description: 'Lomba poster digital bertema pengurangan sampah plastik.',
    eventType: 'LOMBA',
    registrationLink: 'https://contoh.org/daftar',
    sourceUrl: null,
    educationLevels: ['SMA_SMK', 'D4_S1'],
    categorySlugs: ['sosial'],
    location: null,
    isOnline: true,
    deadlineAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    stages: [],
    isFree: null,
    priceAmount: null,
    guidebookUrl: null,
    organizerContact: null,
    proofLink: null,
    ...overrides,
  };
}

async function pendingId(repo: MemoryEventRepository): Promise<string> {
  const [submission] = await repo.listSubmissions('PENDING', 10);
  return submission!.id;
}

describe('MemoryEventRepository — kiriman komunitas', () => {
  it('kiriman baru masuk antrean PENDING dan belum tayang', async () => {
    const repo = new MemoryEventRepository();
    await repo.createSubmission({ submittedByEmail: 'a@b.co', submittedBy: null, payload: payload() });

    const pending = await repo.listSubmissions('PENDING', 10);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payload?.title).toBe('Lomba Poster Hari Lingkungan 2026');

    const listing = await repo.listEvents({ search: 'Poster Hari Lingkungan' });
    expect(listing.total).toBe(0);
  });

  it('disetujui = tayang di katalog dengan tenggat utama, dan keluar dari antrean', async () => {
    const repo = new MemoryEventRepository();
    await repo.createSubmission({ submittedByEmail: 'a@b.co', submittedBy: null, payload: payload() });
    await repo.reviewSubmission({ submissionId: await pendingId(repo), decision: 'APPROVED', reviewerId: null });

    const listing = await repo.listEvents({ search: 'Poster Hari Lingkungan' });
    expect(listing.total).toBe(1);
    const event = await repo.getEventBySlug(listing.items[0]!.slug);
    expect(event?.deadlines).toHaveLength(1);
    expect(event?.deadlines[0]?.isPrimary).toBe(true);
    expect(await repo.listSubmissions('PENDING', 10)).toHaveLength(0);
    expect(await repo.listSubmissions('APPROVED', 10)).toHaveLength(1);
  });

  it('tahapan kiriman menjadi tenggat non-utama; tenggat utama tetap pendaftaran', async () => {
    const repo = new MemoryEventRepository();
    const registration = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const submission = new Date(Date.now() + 20 * 86_400_000).toISOString();
    const final = new Date(Date.now() + 40 * 86_400_000).toISOString();
    await repo.createSubmission({
      submittedByEmail: 'a@b.co',
      submittedBy: null,
      // Urutan isian ≠ urutan waktu: hasilnya tetap urut waktu, seperti di Supabase.
      payload: payload({ deadlineAt: registration, stages: [{ label: 'final', deadlineAt: final }, { label: 'submission', deadlineAt: submission }] }),
    });
    await repo.reviewSubmission({ submissionId: await pendingId(repo), decision: 'APPROVED', reviewerId: null });
    const [summary] = (await repo.listEvents({ search: 'Poster Hari Lingkungan' })).items;
    expect(summary!.primaryDeadlineAt).toBe(registration);
    expect((await repo.getEventBySlug(summary!.slug))!.deadlines.map(({ label, deadlineAt, isPrimary }) => ({ label, deadlineAt, isPrimary }))).toEqual([
      { label: 'registration', deadlineAt: registration, isPrimary: true },
      { label: 'submission', deadlineAt: submission, isPrimary: false },
      { label: 'final', deadlineAt: final, isPrimary: false },
    ]);
  });

  it('menolak duplikat judul + penyelenggara, cermin dedup_hash', async () => {
    const repo = new MemoryEventRepository();
    await repo.createSubmission({ submittedByEmail: 'a@b.co', submittedBy: null, payload: payload() });
    await repo.createSubmission({
      submittedByEmail: 'c@d.co',
      submittedBy: null,
      payload: payload({ title: 'lomba poster  HARI lingkungan 2026' }),
    });
    const [first, second] = await repo.listSubmissions('PENDING', 10);

    await repo.reviewSubmission({ submissionId: first!.id, decision: 'APPROVED', reviewerId: null });
    await expect(
      repo.reviewSubmission({ submissionId: second!.id, decision: 'APPROVED', reviewerId: null }),
    ).rejects.toMatchObject({ reason: 'submission_duplicate' });
  });

  it('kiriman yang sudah ditinjau tidak bisa ditinjau ulang', async () => {
    const repo = new MemoryEventRepository();
    await repo.createSubmission({ submittedByEmail: 'a@b.co', submittedBy: null, payload: payload() });
    const id = await pendingId(repo);
    await repo.reviewSubmission({ submissionId: id, decision: 'REJECTED', reviewerId: null });

    const retry = repo.reviewSubmission({ submissionId: id, decision: 'APPROVED', reviewerId: null });
    await expect(retry).rejects.toBeInstanceOf(AppError);
    await expect(retry).rejects.toMatchObject({ reason: 'submission_not_found' });
  });
});

describe('MemoryEventRepository — tracker idempoten', () => {
  it('addTrackerItemIfAbsent tidak menimpa tahapan yang sudah maju', async () => {
    const repo = new MemoryEventRepository();
    const eventId = (await repo.listEvents({})).items[0]!.id;

    await repo.upsertTrackerItem('u1', eventId, 'INTERVIEW');
    await repo.addTrackerItemIfAbsent('u1', eventId);

    const [item] = await repo.listTrackerItems('u1');
    expect(item?.status).toBe('INTERVIEW');
  });

  it('addTrackerItemIfAbsent menambah entri SAVED kalau belum dilacak', async () => {
    const repo = new MemoryEventRepository();
    const eventId = (await repo.listEvents({})).items[0]!.id;

    await repo.addTrackerItemIfAbsent('u1', eventId);
    const [item] = await repo.listTrackerItems('u1');
    expect(item?.status).toBe('SAVED');
  });
});

describe('MemoryEventRepository — listing & pita minggu ini', () => {
  it('includeClosed ikut menampilkan event EXPIRED, default tidak', async () => {
    const repo = new MemoryEventRepository();
    const open = await repo.listEvents({ pageSize: 48 });
    const all = await repo.listEvents({ pageSize: 48, includeClosed: true });

    expect(open.items.every((event) => event.status === 'APPROVED')).toBe(true);
    expect(all.total).toBeGreaterThanOrEqual(open.total);
  });

  it('getDeadlineWeek mengembalikan 7 hari dan jumlahnya cocok dengan closingThisWeek', async () => {
    const repo = new MemoryEventRepository();
    const week = await repo.getDeadlineWeek();
    const stats = await repo.getStats();

    expect(week).toHaveLength(7);
    // closingThisWeek = H-0..H-7 (8 hari), pita = H-0..H-6 (7 hari).
    expect(week.reduce((sum, day) => sum + day.count, 0)).toBeLessThanOrEqual(stats.closingThisWeek);
  });

  it('memberCount selalu sama dengan jumlah anggota di mode seed', async () => {
    const repo = new MemoryEventRepository();
    for (const team of await repo.listTeams()) {
      expect(team.memberCount).toBe(team.members.length);
    }
  });
});

describe('MemoryEventRepository — batas laju kiriman', () => {
  it('kiriman keempat dari email yang sama dalam satu jam ditolak dengan kode yang aman', async () => {
    const repo = new MemoryEventRepository();
    for (let i = 0; i < 3; i += 1) {
      await repo.createSubmission({ submittedByEmail: 'a@b.co', submittedBy: null, payload: payload({ title: `Lomba ${i}` }) });
    }

    const error = await repo
      .createSubmission({ submittedByEmail: 'a@b.co', submittedBy: null, payload: payload() })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).reason).toBe('submission_rate_limited');
    expect((error as AppError).httpStatus).toBe(429);

    await expect(
      repo.createSubmission({ submittedByEmail: 'lain@b.co', submittedBy: null, payload: payload() }),
    ).resolves.toEqual({ posterAttached: false });
  });
});

describe('MemoryEventRepository — kabar ke pengirim yang masuk (cermin trigger notify_submission_decision)', () => {
  it('disetujui → notifikasi bertaut ke event baru; ditolak → notifikasi tanpa event; tamu → tidak ada', async () => {
    const repo = new MemoryEventRepository();
    const sender = 'a1111111-1111-4111-8111-111111111111';
    await repo.createSubmission({ submittedByEmail: 's@b.co', submittedBy: sender, payload: payload({ title: 'Lomba Poster Dikabari 2026' }) });
    await repo.createSubmission({ submittedByEmail: 's@b.co', submittedBy: sender, payload: payload({ title: 'Kiriman Ditolak Dikabari' }) });
    await repo.createSubmission({ submittedByEmail: 'tamu@b.co', submittedBy: null, payload: payload({ title: 'Kiriman Tamu Tanpa Kabar' }) });

    for (const submission of await repo.listSubmissions('PENDING', 10)) {
      const approve = submission.payload?.title === 'Lomba Poster Dikabari 2026';
      await repo.reviewSubmission({ submissionId: submission.id, decision: approve ? 'APPROVED' : 'REJECTED', reviewerId: null });
    }

    const notifications = await repo.listNotifications(sender, 10);
    const approved = notifications.find((n) => n.type === 'SUBMISSION_APPROVED');
    const rejected = notifications.find((n) => n.type === 'SUBMISSION_REJECTED');
    expect(approved?.event?.title).toBe('Lomba Poster Dikabari 2026');
    expect(rejected?.event).toBeNull();
    expect(rejected?.message).toContain('Kiriman Ditolak Dikabari');
    expect(notifications.filter((n) => n.type.startsWith('SUBMISSION_'))).toHaveLength(2);
    expect(await repo.countUnreadNotifications(sender)).toBe(2);

    await repo.markNotificationAsRead(sender, approved!.id);
    expect(await repo.countUnreadNotifications(sender)).toBe(1);
  });

  describe('poster lampiran (ADR-084) — cermin supabase/tests/117_submission_poster.test.sql', () => {
    const poster: UploadedImage = { type: 'image/png', width: 800, height: 1000, bytes: new Uint8Array(512).fill(9) };
    const viewer = (id: string, isAdmin = false): MediaViewer => ({ id, isAdmin });

    it('hanya pengirim yang masuk yang bisa melampirkan; tamu tetap terkirim tanpa poster', async () => {
      const repo = new MemoryEventRepository();
      expect(await repo.createSubmission({ submittedByEmail: 'tamu@b.co', submittedBy: null, payload: payload(), poster })).toEqual({ posterAttached: false });
      expect(await repo.createSubmission({ submittedByEmail: 'ana@b.co', submittedBy: 'ana', payload: payload({ title: 'Lomba Kedua 2026' }), poster })).toEqual({ posterAttached: true });

      const [guest, member] = await repo.listSubmissions('PENDING', 10);
      expect(guest?.poster).toBeNull();
      expect(member?.poster).toEqual({ width: 800, height: 1000 });
    });

    it('poster yang belum tayang hanya terbuka bagi moderator dan pengirimnya', async () => {
      const repo = new MemoryEventRepository();
      await repo.createSubmission({ submittedByEmail: 'ana@b.co', submittedBy: 'ana', payload: payload(), poster });
      const id = await pendingId(repo);

      expect((await repo.getSubmissionPosterFile(viewer('ana'), id))?.bytes[0]).toBe(9);
      expect(await repo.getSubmissionPosterFile(viewer('admin', true), id)).not.toBeNull();
      expect(await repo.getSubmissionPosterFile(viewer('budi'), id)).toBeNull();
      expect(await repo.getSubmissionPosterFile(null, id)).toBeNull();
      expect(await repo.getSubmissionPosterFile(viewer('admin', true), 'tidak-ada')).toBeNull();
    });

    it('disetujui: berkas yang sama menjadi poster acara dan lepas dari kirimannya', async () => {
      const repo = new MemoryEventRepository();
      await repo.createSubmission({ submittedByEmail: 'ana@b.co', submittedBy: 'ana', payload: payload(), poster });
      const id = await pendingId(repo);
      await repo.reviewSubmission({ submissionId: id, decision: 'APPROVED', reviewerId: 'admin' });

      const listing = await repo.listEvents({ search: 'Poster Hari Lingkungan' });
      const event = await repo.getEventBySlug(listing.items[0]!.slug);
      expect(event?.poster).toMatchObject({ width: 800, height: 1000 });
      expect(listing.items[0]?.poster?.id).toBe(event?.poster?.id);
      const photos = await repo.listEventPhotos(event!.id);
      expect(photos).toHaveLength(1);
      expect(photos[0]).toMatchObject({ isPoster: true, width: 800, height: 1000 });
      // Publik lewat rute foto acara; rute kiriman tidak lagi menyajikannya.
      expect((await repo.getEventPhotoFile(photos[0]!.id))?.bytes[0]).toBe(9);
      expect(await repo.getSubmissionPosterFile(viewer('ana'), id)).toBeNull();
      expect((await repo.listSubmissions('APPROVED', 10))[0]?.poster).toBeNull();
    });

    it('ditolak: berkasnya dihapus, dan mengembalikan ke antrean tidak menghidupkannya lagi', async () => {
      const repo = new MemoryEventRepository();
      await repo.createSubmission({ submittedByEmail: 'ana@b.co', submittedBy: 'ana', payload: payload(), poster });
      const id = await pendingId(repo);
      await repo.reviewSubmission({ submissionId: id, decision: 'REJECTED', reviewerId: 'admin', reason: 'Poster memuat nomor rekening pribadi' });

      expect(await repo.getSubmissionPosterFile(viewer('admin', true), id)).toBeNull();
      expect((await repo.listSubmissions('REJECTED', 10))[0]?.poster).toBeNull();

      await repo.restoreRejected({ subjectType: 'submission', subjectId: id, reviewerId: 'admin' });
      expect((await repo.listSubmissions('PENDING', 10))[0]?.poster).toBeNull();
    });
  });
});
