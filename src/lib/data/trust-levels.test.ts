import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { SubmissionPayload } from '@/types/domain';
import { MemoryEventRepository } from './memory-repository';
import type { EventActor } from './repository';
import { SEED_EVENTS } from './seed-data';

/**
 * Tingkat kepercayaan & data uji (ADR-096) di mode seed — skenario yang sama
 * dengan supabase/tests/124_event_trust_levels.test.sql.
 */
const admin: EventActor = { id: 'admin-1', fullName: 'Admin Percaya', email: 'admin@studentfo.test', isAdmin: true };

function payload(overrides: Partial<SubmissionPayload> = {}): SubmissionPayload {
  return {
    title: 'Lomba Uji Kepercayaan 2027',
    organizer: 'Panitia Uji',
    description: 'Lomba untuk menguji label kepercayaan.',
    eventType: 'LOMBA',
    registrationLink: 'https://panitia.test/daftar',
    sourceUrl: 'https://panitia.test/pengumuman',
    educationLevels: ['D4_S1'],
    categorySlugs: ['sosial'],
    location: null,
    isOnline: true,
    deadlineAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    stages: [],
    isFree: true,
    priceAmount: null,
    guidebookUrl: null,
    organizerContact: null,
    proofLink: null,
    ...overrides,
  };
}

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

const firstPublic = SEED_EVENTS.find((event) => event.status === 'APPROVED')!;

describe('tingkat kepercayaan (ADR-096)', () => {
  it('cermin backfill: hanya yang berlencana otoritas yang terverifikasi moderator', async () => {
    const repository = new MemoryEventRepository();
    const page = await repository.listEvents({ includeClosed: true, pageSize: 48, sort: 'newest' });
    expect(page.items.length).toBeGreaterThan(0);
    for (const event of page.items) {
      expect(event.verificationLevel).toBe(event.verificationBadge ? 'MODERATOR_VERIFIED' : 'PUBLIC_SOURCE');
    }
  });

  it('menyetujui dengan centang menaikkan tingkat; tanpa centang tetap dari sumber publik', async () => {
    const repository = new MemoryEventRepository();
    const [pending] = await repository.listByStatus('PENDING', 1);
    expect(pending).toBeDefined();
    await repository.reviewEvent({ eventId: pending!.id, decision: 'APPROVED', reviewerId: admin.id, verificationLevel: 'MODERATOR_VERIFIED' });
    expect((await repository.getEventForAdmin(pending!.id))?.verificationLevel).toBe('MODERATOR_VERIFIED');
  });

  it('acara buatan admin selalu terverifikasi moderator', async () => {
    const repository = new MemoryEventRepository();
    const created = await repository.createEventAsAdmin(admin, payload());
    expect((await repository.getEventBySlug(created.slug))?.verificationLevel).toBe('MODERATOR_VERIFIED');
  });

  it('saklar admin: nilai di luar daftar ditolak, kegiatan tak dikenal = event_not_found', async () => {
    const repository = new MemoryEventRepository();
    expect(await reason(repository.setEventTrust({ eventId: firstPublic.id, verificationLevel: 'PALSU' as never }))).toBe('invalid_request');
    expect(await reason(repository.setEventTrust({ eventId: 'tidak-ada', isDemo: true }))).toBe('event_not_found');
    await repository.setEventTrust({ eventId: firstPublic.id, verificationLevel: 'MODERATOR_VERIFIED' });
    const [row] = (await repository.searchEventsForAdmin({ search: firstPublic.slug, status: null, limit: 5 })).filter((item) => item.id === firstPublic.id);
    expect(row?.verificationLevel).toBe('MODERATOR_VERIFIED');
  });
});

describe('data uji (ADR-096)', () => {
  it('hilang dari katalog, detail, dan sorotan, tetapi tetap terlihat di Kelola postingan', async () => {
    const repository = new MemoryEventRepository();
    await repository.setEventTrust({ eventId: firstPublic.id, isDemo: true });

    const listed = await repository.listEvents({ includeClosed: true, pageSize: 48, sort: 'newest' });
    expect(listed.items.some((event) => event.id === firstPublic.id)).toBe(false);
    expect(await repository.getEventBySlug(firstPublic.slug)).toBeNull();
    expect((await repository.listClosingSoon(48)).some((event) => event.id === firstPublic.id)).toBe(false);

    const admins = await repository.searchEventsForAdmin({ search: firstPublic.slug, status: null, limit: 5 });
    expect(admins.find((row) => row.id === firstPublic.id)?.isDemo).toBe(true);

    await repository.setEventTrust({ eventId: firstPublic.id, isDemo: false });
    expect(await repository.getEventBySlug(firstPublic.slug)).not.toBeNull();
  });
});
