import { describe, expect, it } from 'vitest';
import { DEMO_SEEDED_USER_LIMIT, MemoryEventRepository } from './memory-repository';

const NOW = new Date('2026-10-05T03:00:00Z');
const organizer = (id: string) => ({ id, fullName: `Panitia ${id}`, email: `${id}@demo.studentfo.local` });

describe('batas identitas demo yang menerima data awal', () => {
  it('identitas di atas batas tetap bisa masuk, tetapi tidak menambah baris ke memori bersama', async () => {
    const repository = new MemoryEventRepository(NOW, { demoSeedLimit: 2 });
    repository.seedDemoNetwork('a', NOW);
    repository.seedDemoNetwork('b', NOW);
    repository.seedDemoNetwork('c', NOW);

    expect((await repository.countConnections('a')).accepted).toBeGreaterThan(0);
    expect((await repository.countConnections('b')).accepted).toBeGreaterThan(0);
    expect(await repository.countConnections('c')).toEqual({ accepted: 0, incoming: 0, outgoing: 0 });
  });

  it('masuk ulang dengan identitas yang sama tidak menghabiskan jatah', async () => {
    const repository = new MemoryEventRepository(NOW, { demoSeedLimit: 1 });
    repository.seedDemoOrganizer(organizer('a'), NOW);
    repository.seedDemoOrganizer(organizer('a'), NOW);
    repository.seedDemoPortfolio('a', NOW);
    repository.seedDemoOrganizer(organizer('b'), NOW);

    expect(await repository.listManagedEvents('a')).not.toHaveLength(0);
    expect(await repository.listManagedEvents('b')).toHaveLength(0);
  });

  it('batas bawaan cukup lega untuk satu siklus demo, tapi tetap berhingga', () => {
    expect(DEMO_SEEDED_USER_LIMIT).toBeGreaterThanOrEqual(500);
    expect(Number.isFinite(DEMO_SEEDED_USER_LIMIT)).toBe(true);
  });
});
