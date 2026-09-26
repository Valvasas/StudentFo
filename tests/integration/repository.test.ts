import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import type { SubmissionPayload } from '@/types/domain';
import { actAs, createEvent, createUser, sql } from './harness';

const repo = new SupabaseEventRepository(noCache);

function reasonOf(error: unknown): string | undefined {
  return error instanceof AppError ? (error.reason as string | undefined) : undefined;
}

function payload(overrides: Partial<SubmissionPayload> = {}): SubmissionPayload {
  const unique = Math.random().toString(36).slice(2, 8);
  return {
    title: `Beasiswa Kiriman Integrasi ${unique}`,
    organizer: `Yayasan ${unique}`,
    description: null,
    eventType: 'BEASISWA',
    registrationLink: 'https://daftar.example/kiriman',
    sourceUrl: null,
    educationLevels: ['D4_S1'],
    categorySlugs: ['teknologi'],
    location: null,
    isOnline: true,
    deadlineAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    ...overrides,
  };
}

beforeEach(() => actAs(null));

describe('reviewEvent + listByStatus + log moderasi', () => {
  it('antrean berisi detail lengkap (sumber, tautan, tenggat); keputusan tercatat dengan aktornya', async () => {
    const admin = createUser({ role: 'ADMIN', fullName: 'Admin Integrasi' });
    const pending = createEvent({ status: 'PENDING', title: 'Antrean Integrasi' });

    const queue = await repo.listByStatus('PENDING', 50);
    const item = queue.find((event) => event.id === pending.id);
    expect(item).toMatchObject({ sourceUrl: `https://sumber.example/${pending.id}`, registrationLink: `https://daftar.example/${pending.id}` });
    expect(item?.deadlines).toHaveLength(1);

    await repo.reviewEvent({ eventId: pending.id, decision: 'REJECTED', reviewerId: admin, reason: 'Duplikat' });
    expect(await repo.getEventBySlug(pending.slug)).toBeNull();

    const log = await repo.listModerationLog(20);
    expect(log.find((entry) => entry.subjectId === pending.id)).toMatchObject({
      fromStatus: 'PENDING',
      toStatus: 'REJECTED',
      actorName: 'Admin Integrasi',
      reason: 'Duplikat',
    });
  });

  it('id bukan UUID diabaikan tanpa error driver bocor', async () => {
    await expect(repo.reviewEvent({ eventId: "1' OR 1=1", decision: 'APPROVED', reviewerId: null })).resolves.toBeUndefined();
  });
});

describe('createSubmission / reviewSubmission', () => {
  it('tamu bisa mengirim (RLS ugc_public_insert), admin menyetujui → event tayang + tercatat', async () => {
    const admin = createUser({ role: 'ADMIN' });
    const data = payload();
    await repo.createSubmission({ submittedByEmail: `kirim-${Date.now()}@uji.example`, payload: data });

    const [submission] = (await repo.listSubmissions('PENDING', 100)).filter((s) => s.payload?.title === data.title);
    expect(submission).toBeDefined();

    await repo.reviewSubmission({ submissionId: submission!.id, decision: 'APPROVED', reviewerId: admin });
    const listing = await repo.listEvents({ search: data.title.split(' ').at(-1)!, includeClosed: true });
    expect(listing.items.map((event) => event.title)).toContain(data.title);

    // Menyetujui ulang kiriman yang sama → bukan lagi PENDING.
    await expect(
      repo.reviewSubmission({ submissionId: submission!.id, decision: 'APPROVED', reviewerId: admin }),
    ).rejects.toSatisfy((error) => reasonOf(error) === 'submission_not_found');
  });

  it('judul + penyelenggara yang sudah ada → submission_duplicate (dedup_hash)', async () => {
    const admin = createUser({ role: 'ADMIN' });
    const data = payload();
    const email = `dup-${Date.now()}@uji.example`;
    await repo.createSubmission({ submittedByEmail: email, payload: data });
    await repo.createSubmission({ submittedByEmail: `${email}.2`, payload: data });
    const mine = (await repo.listSubmissions('PENDING', 100)).filter((s) => s.payload?.title === data.title);
    await repo.reviewSubmission({ submissionId: mine[0]!.id, decision: 'APPROVED', reviewerId: admin });
    await expect(
      repo.reviewSubmission({ submissionId: mine[1]!.id, decision: 'APPROVED', reviewerId: admin }),
    ).rejects.toSatisfy((error) => reasonOf(error) === 'submission_duplicate');
  });

  it('kiriman ke-4 dari email yang sama dalam satu jam → submission_rate_limited (trigger Postgres)', async () => {
    const email = `banjir-${Date.now()}@uji.example`;
    for (let i = 0; i < 3; i += 1) await repo.createSubmission({ submittedByEmail: email, payload: payload() });
    await expect(repo.createSubmission({ submittedByEmail: email, payload: payload() })).rejects.toSatisfy(
      (error) => reasonOf(error) === 'submission_rate_limited',
    );
  });

  it('penolakan mengisi reviewed_by kiriman', async () => {
    const admin = createUser({ role: 'ADMIN' });
    const data = payload();
    await repo.createSubmission({ submittedByEmail: `tolak-${Date.now()}@uji.example`, payload: data });
    const [submission] = (await repo.listSubmissions('PENDING', 100)).filter((s) => s.payload?.title === data.title);
    await repo.reviewSubmission({ submissionId: submission!.id, decision: 'REJECTED', reviewerId: admin });
    expect(sql(`SELECT reviewed_by FROM ugc_submissions WHERE id = '${submission!.id}'`)).toBe(admin);
  });
});

describe('saveEvent / unsaveEvent', () => {
  it('simpan & batal menjaga saved_count lewat trigger; hanya milik sendiri yang terbaca', async () => {
    const user = createUser();
    const other = createUser();
    const event = createEvent();
    actAs(user);

    await repo.saveEvent(user, event.id);
    await repo.saveEvent(user, event.id); // idempoten
    expect(await repo.isEventSaved(user, event.id)).toBe(true);
    expect(sql(`SELECT saved_count FROM events WHERE id = '${event.id}'`)).toBe('1');
    expect((await repo.listSavedEvents(user)).map((e) => e.id)).toEqual([event.id]);

    actAs(other);
    expect(await repo.isEventSaved(user, event.id)).toBe(false); // RLS: baris orang lain tak terbaca

    actAs(user);
    await repo.unsaveEvent(user, event.id);
    expect(await repo.isEventSaved(user, event.id)).toBe(false);
    expect(sql(`SELECT saved_count FROM events WHERE id = '${event.id}'`)).toBe('0');
  });

  it('event PENDING tidak bisa disimpan (policy saved_events_own WITH CHECK)', async () => {
    const user = createUser();
    const pending = createEvent({ status: 'PENDING' });
    actAs(user);
    await expect(repo.saveEvent(user, pending.id)).rejects.toBeInstanceOf(AppError);
    expect(await repo.isEventSaved(user, pending.id)).toBe(false);
  });
});

describe('notifikasi tenggat', () => {
  it('produsen SQL membuat H-3 untuk event tersimpan; baca, hitung, tandai dibaca hanya milik sendiri', async () => {
    const user = createUser();
    const other = createUser();
    const event = createEvent({ deadlineInDays: 2.5 });
    actAs(user);
    await repo.saveEvent(user, event.id);

    sql('SELECT public.create_deadline_notifications()');
    sql('SELECT public.create_deadline_notifications()'); // idempoten

    const notifications = await repo.listNotifications(user, 20);
    const mine = notifications.filter((n) => n.event?.id === event.id);
    expect(mine).toHaveLength(1);
    expect(await repo.countUnreadNotifications(user)).toBeGreaterThanOrEqual(1);

    actAs(other);
    await repo.markNotificationAsRead(other, mine[0]!.id); // bukan miliknya → tidak berefek
    actAs(user);
    expect((await repo.listNotifications(user, 20)).find((n) => n.id === mine[0]!.id)?.isRead).toBe(false);

    await repo.markAllNotificationsAsRead(user);
    expect(await repo.countUnreadNotifications(user)).toBe(0);
  });
});

describe('pembatas laju & sinyal rekomendasi (service_role)', () => {
  it('consumeRateLimit menegakkan batas lewat RPC', async () => {
    const bucket = `uji:${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await repo.consumeRateLimit(bucket, 3, 60));
    expect(results).toEqual([true, true, true, false]);
  });

  it('sinyal tercatat dan terbaca untuk kalibrasi', async () => {
    const event = createEvent();
    const user = createUser();
    const since = new Date(Date.now() - 60_000);
    await repo.recordRecommendationSignal({ eventId: event.id, kind: 'register_click', userId: user, interests: ['teknologi'], educationLevel: 'D4_S1' });
    const data = await repo.listCalibrationData(since);
    expect(data.signals.find((s) => s.eventId === event.id)).toMatchObject({ interests: ['teknologi'], educationLevel: 'D4_S1' });
    expect(data.events.some((e) => e.id === event.id)).toBe(true);
  });
});
