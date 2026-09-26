import { describe, expect, it } from 'vitest';
import type { SubmissionPayload } from '@/types/domain';
import { MemoryEventRepository } from './memory-repository';

const ADMIN_A = { reviewerId: 'a0000000-0000-4000-8000-000000000001', reviewerName: 'Admin A' };
const ADMIN_B = { reviewerId: 'b0000000-0000-4000-8000-000000000002', reviewerName: 'Admin B' };

const payload: SubmissionPayload = {
  title: 'Beasiswa Kiriman Log',
  organizer: 'Yayasan Log',
  description: null,
  eventType: 'BEASISWA',
  registrationLink: 'https://contoh.org/daftar',
  sourceUrl: null,
  educationLevels: ['D4_S1'],
  categorySlugs: [],
  location: null,
  isOnline: true,
  deadlineAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
};

describe('MemoryEventRepository — log moderasi (cermin trigger moderation_log)', () => {
  it('mencatat setiap keputusan, termasuk pembalikan oleh admin lain, terbaru di atas', async () => {
    const repo = new MemoryEventRepository();
    const [pending] = await repo.listByStatus('PENDING', 1);
    expect(pending).toBeDefined();

    await repo.reviewEvent({ eventId: pending!.id, decision: 'APPROVED', ...ADMIN_A });
    await repo.reviewEvent({ eventId: pending!.id, decision: 'REJECTED', reason: 'Tautan palsu', ...ADMIN_B });

    const log = await repo.listModerationLog(10);
    expect(log.map((entry) => [entry.fromStatus, entry.toStatus, entry.actorName, entry.reason])).toEqual([
      ['APPROVED', 'REJECTED', 'Admin B', 'Tautan palsu'],
      ['PENDING', 'APPROVED', 'Admin A', null],
    ]);
    expect(log[0]).toMatchObject({ subjectType: 'event', subjectId: pending!.id, title: pending!.title });
  });

  it('keputusan yang tidak mengubah status tidak dicatat', async () => {
    const repo = new MemoryEventRepository();
    const [pending] = await repo.listByStatus('PENDING', 1);
    await repo.reviewEvent({ eventId: pending!.id, decision: 'APPROVED', ...ADMIN_A });
    await repo.reviewEvent({ eventId: pending!.id, decision: 'APPROVED', ...ADMIN_B });
    expect(await repo.listModerationLog(10)).toHaveLength(1);
  });

  it('kiriman: disetujui mencatat kiriman + event terbit; ditolak mencatat kiriman', async () => {
    const repo = new MemoryEventRepository();
    await repo.createSubmission({ submittedByEmail: 'p@contoh.org', payload });
    await repo.createSubmission({ submittedByEmail: 'q@contoh.org', payload: { ...payload, title: 'Kiriman Spam Log' } });
    const [first, second] = await repo.listSubmissions('PENDING', 10);

    await repo.reviewSubmission({ submissionId: first!.id, decision: 'APPROVED', ...ADMIN_A });
    await repo.reviewSubmission({ submissionId: second!.id, decision: 'REJECTED', ...ADMIN_B });

    const log = await repo.listModerationLog(10);
    expect(log.map((entry) => [entry.subjectType, entry.title, entry.fromStatus, entry.toStatus, entry.actorName])).toEqual([
      ['submission', 'Kiriman Spam Log', 'PENDING', 'REJECTED', 'Admin B'],
      ['submission', 'Beasiswa Kiriman Log', 'PENDING', 'APPROVED', 'Admin A'],
      ['event', 'Beasiswa Kiriman Log', null, 'APPROVED', 'Admin A'],
    ]);
  });

  it('batas jumlah dihormati', async () => {
    const repo = new MemoryEventRepository();
    const pending = await repo.listByStatus('PENDING', 2);
    for (const event of pending) await repo.reviewEvent({ eventId: event.id, decision: 'REJECTED', ...ADMIN_A });
    expect(await repo.listModerationLog(1)).toHaveLength(1);
  });
});
