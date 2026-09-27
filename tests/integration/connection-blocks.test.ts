import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import type { NetworkViewer } from '@/lib/network';
import { actAs, createUser } from './harness';

/**
 * Blokir (ADR-041) lewat PostgREST sungguhan: policy INSERT/UPDATE
 * `connections` yang memanggil `is_blocked()`, trigger yang memutus
 * koneksi lama, dan view `connection_blocks_with_names` yang HARUS
 * memfilter ke pemanggil sendiri (security_invoker = off, ADR-040/041).
 */
const repo = new SupabaseEventRepository(noCache);

const reasonOf = (error: unknown) => (error instanceof AppError ? (error.reason ?? `tanpa-reason: ${error.message}`) : String(error));
async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return reasonOf(error);
  }
}

function viewer(id: string, fullName: string): NetworkViewer {
  return { id, fullName, educationLevel: 'D4_S1', major: null, interests: [] };
}

beforeEach(() => actAs(null));

describe('SupabaseEventRepository — blokir', () => {
  it('memutus koneksi ACCEPTED yang ada dan mencegah ajakan baru dari kedua arah', async () => {
    const ana = viewer(createUser({ fullName: 'Ana Blokir Integrasi' }), 'Ana Blokir Integrasi');
    const budi = viewer(createUser({ fullName: 'Budi Blokir Integrasi' }), 'Budi Blokir Integrasi');
    actAs(budi.id);
    await repo.updateNetworkProfile(budi, { discoverable: true, headline: null });
    actAs(ana.id);
    await repo.requestConnection(ana, budi.id, null);
    actAs(budi.id);
    const [pending] = await repo.listConnections(budi.id);
    await repo.respondToConnection(budi.id, pending!.id, 'accept');
    expect((await repo.listConnections(budi.id))[0]!.status).toBe('ACCEPTED');

    await repo.blockPerson(budi.id, ana.id);
    expect(await repo.listConnections(budi.id)).toEqual([]);
    actAs(ana.id);
    expect(await repo.listConnections(ana.id)).toEqual([]);

    expect(await reason(repo.requestConnection(ana, budi.id, null))).toBe('person_unavailable');
    actAs(budi.id);
    expect(await reason(repo.requestConnection(budi, ana.id, null))).toBe('person_unavailable');
  });

  it('memblokir ajakan yang masih menunggu ikut menyingkirkannya', async () => {
    const ana = viewer(createUser({ fullName: 'Ana Blokir Pending' }), 'Ana Blokir Pending');
    const budi = viewer(createUser({ fullName: 'Budi Blokir Pending' }), 'Budi Blokir Pending');
    actAs(budi.id);
    await repo.updateNetworkProfile(budi, { discoverable: true, headline: null });
    actAs(ana.id);
    await repo.requestConnection(ana, budi.id, 'Halo');

    actAs(budi.id);
    await repo.blockPerson(budi.id, ana.id);
    expect(await repo.listConnections(budi.id)).toEqual([]);
    actAs(ana.id);
    expect(await repo.listConnections(ana.id)).toEqual([]);
  });

  it('tidak bisa memblokir diri sendiri', async () => {
    const ana = viewer(createUser({ fullName: 'Ana Blokir Diri' }), 'Ana Blokir Diri');
    actAs(ana.id);
    expect(await reason(repo.blockPerson(ana.id, ana.id))).toBe('connection_self');
  });

  it('membuka blokir mengizinkan ajakan lagi', async () => {
    const ana = viewer(createUser({ fullName: 'Ana Buka Blokir' }), 'Ana Buka Blokir');
    const budi = viewer(createUser({ fullName: 'Budi Buka Blokir' }), 'Budi Buka Blokir');
    actAs(budi.id);
    await repo.updateNetworkProfile(budi, { discoverable: true, headline: null });
    await repo.blockPerson(budi.id, ana.id);
    actAs(ana.id);
    expect(await reason(repo.requestConnection(ana, budi.id, null))).toBe('person_unavailable');

    actAs(budi.id);
    await repo.unblockPerson(budi.id, ana.id);
    actAs(ana.id);
    expect(await repo.requestConnection(ana, budi.id, null)).toBe('requested');
  });

  it('daftar blokir hanya berisi milik sendiri, lengkap dengan nama; pihak ketiga tidak melihatnya', async () => {
    const ana = viewer(createUser({ fullName: 'Ana Daftar Blokir' }), 'Ana Daftar Blokir');
    const budi = viewer(createUser({ fullName: 'Budi Daftar Blokir' }), 'Budi Daftar Blokir');
    const cici = viewer(createUser({ fullName: 'Cici Daftar Blokir' }), 'Cici Daftar Blokir');
    actAs(ana.id);
    await repo.blockPerson(ana.id, budi.id);

    const own = await repo.listBlockedPeople(ana.id);
    expect(own).toEqual([{ userId: budi.id, fullName: 'Budi Daftar Blokir', createdAt: expect.any(String) }]);

    // Pihak ketiga memanggil PostgREST dengan JWT-nya sendiri — jalur yang
    // sama persis dipakai aplikasi. View ini `security_invoker = off`
    // (ADR-041), jadi kalau filter `WHERE blocker_id = auth.uid()` di
    // dalam SQL view sampai hilang, baris di atas akan bocor ke sini.
    actAs(cici.id);
    expect(await repo.listBlockedPeople(cici.id)).toEqual([]);
  });

  it('blokir memblokir dari kedua arah bahkan tanpa network_profile (belum pernah opt-in)', async () => {
    const ana = viewer(createUser({ fullName: 'Ana Tanpa Profil' }), 'Ana Tanpa Profil');
    const budi = viewer(createUser({ fullName: 'Budi Tanpa Profil' }), 'Budi Tanpa Profil');
    actAs(ana.id);
    await repo.blockPerson(ana.id, budi.id);
    // Budi tidak discoverable sama sekali (tidak pernah opt-in), jadi
    // pesannya sudah person_unavailable dari sisi is_discoverable — yang
    // penting insert TIDAK melempar error lain (mis. dari trigger blokir).
    expect(await reason(repo.requestConnection(ana, budi.id, null))).toBe('person_unavailable');
  });

  it('memblokir dua kali tidak melempar (idempoten)', async () => {
    const ana = viewer(createUser({ fullName: 'Ana Blokir Dua Kali' }), 'Ana Blokir Dua Kali');
    const budi = viewer(createUser({ fullName: 'Budi Blokir Dua Kali' }), 'Budi Blokir Dua Kali');
    actAs(ana.id);
    await repo.blockPerson(ana.id, budi.id);
    await expect(repo.blockPerson(ana.id, budi.id)).resolves.toBeUndefined();
    expect(await repo.listBlockedPeople(ana.id)).toHaveLength(1);
  });
});
