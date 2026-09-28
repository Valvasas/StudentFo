import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { MemoryEventRepository } from '@/lib/data/memory-repository';
import type { EventRepository } from '@/lib/data/repository';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import type { NetworkViewer } from '@/lib/network';
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

const person = (id: string): NetworkViewer => ({ id, fullName: 'Pengguna Uji', educationLevel: null, major: null, interests: [] });

async function discoverable(world: World, ids: readonly string[]): Promise<void> {
  for (const id of ids) await world.as(id, () => world.repo.updateNetworkProfile(person(id), { discoverable: true, headline: null }));
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

  it('koneksi berhalaman (ADR-041): rantai kursor = urutan yang sama, jumlah tidak bergantung halaman', async () => {
    const world = makeWorld();
    const me = world.user();
    const peers = Array.from({ length: 5 }, () => world.user());
    await discoverable(world, [me, ...peers]);
    for (const id of peers.slice(0, 3)) await world.as(me, () => world.repo.requestConnection(person(me), id, null));
    for (const id of peers.slice(0, 2)) {
      await world.as(id, async () => {
        const [incoming] = (await world.repo.listConnections(id, { limit: 10, cursor: null })).items;
        await world.repo.respondToConnection(id, incoming!.id, 'accept');
      });
    }
    for (const id of peers.slice(3)) await world.as(id, () => world.repo.requestConnection(person(id), me, null));

    const pages: string[][] = [];
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await world.as(me, () => world.repo.listConnections(me, { limit: 2, cursor }));
      pages.push(page.items.map((item) => `${item.status}:${item.direction}`));
      ids.push(...page.items.map((item) => item.person.userId));
      cursor = page.nextCursor;
    } while (cursor);

    // Sama di kedua dunia: ukuran halaman, ajakan menunggu dulu, isi tiap kelompok.
    expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
    expect(pages.flat().map((label) => label.split(':')[0])).toEqual(['PENDING', 'PENDING', 'PENDING', 'ACCEPTED', 'ACCEPTED']);
    expect(new Set(ids.slice(0, 3))).toEqual(new Set(peers.slice(2)));
    expect(new Set(ids.slice(3))).toEqual(new Set(peers.slice(0, 2)));
    // Urutan "terbaru dulu" per baris hanya pasti di Postgres (stempel per
    // transaksi, mikrodetik). Mode seed memakai milidetik: dua ajakan di
    // milidetik yang sama SERI dan diurutkan id acak — tetap sah & stabil.
    if (world.name === 'supabase') {
      expect(pages).toEqual([['PENDING:incoming', 'PENDING:incoming'], ['PENDING:outgoing', 'ACCEPTED:outgoing'], ['ACCEPTED:outgoing']]);
      expect(ids.slice(2)).toEqual([peers[2], peers[1], peers[0]]);
    }
    expect(await world.as(me, () => world.repo.countConnections(me))).toEqual({ accepted: 2, incoming: 2, outgoing: 1 });
    expect(await outcome(() => world.as(me, () => world.repo.listConnections(me, { limit: 2, cursor: 'rusak' })))).toBe('invalid_request');
  });

  it('blokir (ADR-041): memutus, ajakan dua arah ditolak, hanya pemblokir yang bisa membuka', async () => {
    const world = makeWorld();
    const [a, b] = [world.user(), world.user()];
    await discoverable(world, [a, b]);
    await world.as(a, () => world.repo.requestConnection(person(a), b, null));

    expect(await outcome(() => world.as(a, () => world.repo.blockPerson(a, b)))).toBe('ok');
    expect(await outcome(() => world.as(a, () => world.repo.blockPerson(a, b)))).toBe('ok');
    expect(await outcome(() => world.as(a, () => world.repo.blockPerson(a, a)))).toBe('block_self');
    expect(await world.as(a, () => world.repo.countConnections(a))).toEqual({ accepted: 0, incoming: 0, outgoing: 0 });
    expect(await world.as(b, () => world.repo.countConnections(b))).toEqual({ accepted: 0, incoming: 0, outgoing: 0 });
    expect(await outcome(() => world.as(b, () => world.repo.requestConnection(person(b), a, null)))).toBe('person_unavailable');
    expect(await outcome(() => world.as(a, () => world.repo.requestConnection(person(a), b, null)))).toBe('person_unavailable');
    expect(await outcome(() => world.as(b, () => world.repo.unblockPerson(b, a)))).toBe('block_not_found');
    expect((await world.as(b, () => world.repo.listBlockedPeople(b))).length).toBe(0);

    expect(await outcome(() => world.as(a, () => world.repo.unblockPerson(a, b)))).toBe('ok');
    expect(await outcome(() => world.as(a, () => world.repo.unblockPerson(a, b)))).toBe('block_not_found');
    expect(await outcome(() => world.as(b, () => world.repo.requestConnection(person(b), a, null)))).toBe('ok');
  });
});
