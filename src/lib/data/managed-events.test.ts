import { describe, expect, it } from 'vitest';
import { MemoryEventRepository } from './memory-repository';

describe('MemoryEventRepository — hak kelola satu acara', () => {
  it('getManagedEvent = entri listManagedEvents yang sama; bukan pengelola / id asing → null', async () => {
    const repository = new MemoryEventRepository();
    repository.seedDemoOrganizer({ id: 'org', fullName: 'Sekar Ayu', email: 'org@demo' });
    const managed = await repository.listManagedEvents('org');
    expect(managed.length).toBeGreaterThan(0);

    for (const entry of managed) expect(await repository.getManagedEvent('org', entry.event.id)).toEqual(entry);
    expect(await repository.getManagedEvent('orang-lain', managed[0]!.event.id)).toBeNull();
    expect(await repository.getManagedEvent('org', 'acara-asing')).toBeNull();
  });
});
