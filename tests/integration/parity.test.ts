import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { MemoryEventRepository } from '@/lib/data/memory-repository';
import type { EventRepository } from '@/lib/data/repository';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import type { SubmissionPayload } from '@/types/domain';
import { actAs, createEvent, createUser } from './harness';

/**
 * Paritas mode seed ↔ produksi. MemoryEventRepository MENDUPLIKASI aturan
 * yang di produksi dijaga SQL (kapasitas tim, batas laju, visibilitas). Setiap
 * skenario di sini dijalankan terhadap KEDUA implementasi dengan harapan yang
 * sama; kalau salah satu menyimpang, demo mengizinkan hal yang produksi tolak
 * (atau sebaliknya) — dan bug itu baru ketahuan setelah deploy.
 */
interface World {
  readonly name: string;
  readonly repo: EventRepository;
  user(): string;
  /** Jalankan sebagai pengguna ini (produksi: JWT → RLS). */
  as<T>(userId: string | null, run: () => Promise<T>): Promise<T>;
  approvedEventId(): Promise<string>;
  pendingEventId(): Promise<string>;
}

function memoryWorld(): World {
  const repo = new MemoryEventRepository();
  return {
    name: 'memory',
    repo,
    user: () => randomUUID(),
    as: (_userId, run) => run(),
    approvedEventId: async () => (await repo.listEvents({ pageSize: 1 })).items[0]!.id,
    pendingEventId: async () => (await repo.listByStatus('PENDING', 1))[0]!.id,
  };
}

function supabaseWorld(): World {
  return {
    name: 'supabase',
    repo: new SupabaseEventRepository(noCache),
    user: () => createUser(),
    as: async (userId, run) => {
      actAs(userId);
      try {
        return await run();
      } finally {
        actAs(null);
      }
    },
    approvedEventId: async () => createEvent().id,
    pendingEventId: async () => createEvent({ status: 'PENDING' }).id,
  };
}

async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    return error instanceof AppError ? String(error.reason ?? error.code) : `lempar:${String(error)}`;
  }
}

function submission(): SubmissionPayload {
  const unique = randomUUID().slice(0, 8);
  return {
    title: `Paritas Kiriman ${unique}`,
    organizer: `Org ${unique}`,
    description: null,
    eventType: 'LOMBA',
    registrationLink: 'https://daftar.example/paritas',
    sourceUrl: null,
    educationLevels: ['SMA_SMK'],
    categorySlugs: [],
    location: null,
    isOnline: true,
    deadlineAt: new Date(Date.now() + 15 * 86_400_000).toISOString(),
  };
}

describe.each([memoryWorld, supabaseWorld])('paritas: %o', (makeWorld) => {
  it('tim 2 slot: ketua + 1 anggota → anggota berikutnya team_full', async () => {
    const world = makeWorld();
    const [leader, member, late] = [world.user(), world.user(), world.user()];
    const eventId = await world.approvedEventId();
    const teamId = await world.as(leader, () =>
      world.repo.createTeam({ eventId, title: 'Tim Paritas', description: null, slotsNeeded: 2, createdBy: leader, createdByName: 'Ketua' }),
    );
    expect(await outcome(() => world.as(member, () => world.repo.joinTeam(member, 'Anggota', teamId)))).toBe('ok');
    expect(await outcome(() => world.as(late, () => world.repo.joinTeam(late, 'Telat', teamId)))).toBe('team_full');
    const team = await world.repo.getTeamById(teamId);
    expect(team?.memberCount).toBe(2);
  });

  it('ketua tidak bisa keluar; bukan ketua tidak bisa mengeluarkan anggota', async () => {
    const world = makeWorld();
    const [leader, member] = [world.user(), world.user()];
    const eventId = await world.approvedEventId();
    const teamId = await world.as(leader, () =>
      world.repo.createTeam({ eventId, title: 'Tim Aturan', description: null, slotsNeeded: 5, createdBy: leader, createdByName: 'Ketua' }),
    );
    await world.as(member, () => world.repo.joinTeam(member, 'Anggota', teamId));
    expect(await outcome(() => world.as(leader, () => world.repo.leaveTeam(leader, teamId)))).toBe('leader_cannot_leave');
    expect(await outcome(() => world.as(member, () => world.repo.removeTeamMember(member, teamId, leader)))).toBe('team_forbidden');
  });

  it('tim hanya untuk event APPROVED', async () => {
    const world = makeWorld();
    const leader = world.user();
    const pendingId = await world.pendingEventId();
    expect(
      await outcome(() =>
        world.as(leader, () =>
          world.repo.createTeam({ eventId: pendingId, title: 'Tim Intip', description: null, slotsNeeded: 3, createdBy: leader, createdByName: 'K' }),
        ),
      ),
    ).toBe('event_unavailable');
  });

  it('event PENDING tidak bisa disimpan maupun dilacak', async () => {
    const world = makeWorld();
    const user = world.user();
    const pendingId = await world.pendingEventId();
    expect(await outcome(() => world.as(user, () => world.repo.saveEvent(user, pendingId)))).toBe('event_unavailable');
    expect(await outcome(() => world.as(user, () => world.repo.upsertTrackerItem(user, pendingId, 'APPLIED')))).toBe('event_unavailable');
    expect(await outcome(() => world.as(user, () => world.repo.addTrackerItemIfAbsent(user, pendingId)))).toBe('event_unavailable');
    expect(await world.as(user, () => world.repo.isEventSaved(user, pendingId))).toBe(false);
  });

  it('simpan ulang tidak memundurkan tahap tracker', async () => {
    const world = makeWorld();
    const user = world.user();
    const eventId = await world.approvedEventId();
    await world.as(user, async () => {
      await world.repo.addTrackerItemIfAbsent(user, eventId);
      await world.repo.upsertTrackerItem(user, eventId, 'INTERVIEW');
      await world.repo.addTrackerItemIfAbsent(user, eventId);
    });
    const items = await world.as(user, () => world.repo.listTrackerItems(user));
    expect(items.find((item) => item.eventId === eventId)?.status).toBe('INTERVIEW');
  });

  it('kiriman ke-4 per email per jam → submission_rate_limited', async () => {
    const world = makeWorld();
    const email = `paritas-${randomUUID()}@uji.example`;
    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await outcome(() => world.repo.createSubmission({ submittedByEmail: email, submittedBy: null, payload: submission() })));
    }
    expect(results).toEqual(['ok', 'ok', 'ok', 'submission_rate_limited']);
  });

  it('consumeRateLimit: batas & ember terpisah', async () => {
    const world = makeWorld();
    const bucket = `paritas:${randomUUID()}`;
    const results = [];
    for (let i = 0; i < 3; i += 1) results.push(await world.repo.consumeRateLimit(bucket, 2, 60));
    results.push(await world.repo.consumeRateLimit(`${bucket}:lain`, 2, 60));
    expect(results).toEqual([true, true, false, true]);
  });
});
