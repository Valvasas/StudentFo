import { beforeEach, describe, expect, it } from 'vitest';
import { CONNECTION_RATE_LIMIT, NETWORK_LIMITS, type NetworkViewer } from '@/lib/network';
import { AppError } from '@/lib/errors';
import { MemoryEventRepository } from './memory-repository';
import type { PeopleFilter } from './repository';
import { DEMO_STARTER_NETWORK, SEED_PEOPLE } from './seed-data';

const ana: NetworkViewer = { id: 'ana', fullName: 'Ana', educationLevel: 'D4_S1', major: 'Teknik Informatika', interests: ['teknologi', 'desain'] };
const budi: NetworkViewer = { id: 'budi', fullName: 'Budi', educationLevel: 'D3', major: null, interests: [] };

const filter = (overrides: Partial<PeopleFilter> = {}): PeopleFilter => ({
  search: '',
  interest: null,
  limit: NETWORK_LIMITS.suggestionLimit,
  viewerEvents: [],
  ...overrides,
});

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

describe('MemoryEventRepository — koneksi', () => {
  let repository: MemoryEventRepository;

  beforeEach(async () => {
    repository = new MemoryEventRepository(new Date('2026-09-27T03:00:00Z'));
    await repository.updateNetworkProfile(budi, { discoverable: true, headline: 'Halo' });
  });

  it('bawaan: pengguna baru tidak bisa ditemukan', async () => {
    expect(await repository.getNetworkProfile('orang-baru')).toEqual({ discoverable: false, headline: null });
  });

  it('ajakan terlihat di kedua sisi dengan arah yang benar, dan yang diajak dikabari', async () => {
    expect(await repository.requestConnection(ana, 'budi', 'Halo Budi')).toBe('requested');

    const [outgoing] = await repository.listConnections('ana');
    const [incoming] = await repository.listConnections('budi');
    expect(outgoing).toMatchObject({ direction: 'outgoing', status: 'PENDING', person: { fullName: 'Budi', headline: 'Halo' } });
    expect(incoming).toMatchObject({ direction: 'incoming', status: 'PENDING', message: 'Halo Budi', person: { fullName: 'Ana' } });

    const notifications = await repository.listNotifications('budi', 10);
    expect(notifications.some((n) => n.type === 'CONNECTION_REQUEST' && n.message === 'Ana ingin terhubung denganmu.')).toBe(true);
  });

  it('hanya yang diajak boleh menerima; pengirim dikabari saat diterima', async () => {
    await repository.requestConnection(ana, 'budi', null);
    const [pending] = await repository.listConnections('ana');

    expect(await reason(repository.respondToConnection('ana', pending!.id, 'accept'))).toBe('connection_forbidden');
    expect(await reason(repository.respondToConnection('orang-lain', pending!.id, 'accept'))).toBe('connection_not_found');

    await repository.respondToConnection('budi', pending!.id, 'accept');
    const [accepted] = await repository.listConnections('ana');
    expect(accepted).toMatchObject({ status: 'ACCEPTED' });
    expect(accepted!.respondedAt).not.toBeNull();
    expect((await repository.listNotifications('ana', 10)).some((n) => n.type === 'CONNECTION_ACCEPTED')).toBe(true);
  });

  it('menolak menghapus ajakan (tidak ada status "ditolak" yang tersisa)', async () => {
    await repository.requestConnection(ana, 'budi', null);
    const [pending] = await repository.listConnections('budi');
    await repository.respondToConnection('budi', pending!.id, 'decline');
    expect(await repository.listConnections('ana')).toEqual([]);
  });

  it('dua arah yang sama-sama mau langsung terhubung, bukan dua ajakan menggantung', async () => {
    await repository.updateNetworkProfile(ana, { discoverable: true, headline: null });
    await repository.requestConnection(ana, 'budi', null);
    expect(await repository.requestConnection(budi, 'ana', null)).toBe('accepted');

    const connections = await repository.listConnections('ana');
    expect(connections).toHaveLength(1);
    expect(connections[0]!.status).toBe('ACCEPTED');
  });

  it('ajakan ganda, ke diri sendiri, atau ke orang tersembunyi ditolak dengan kode yang jelas', async () => {
    await repository.requestConnection(ana, 'budi', null);
    expect(await reason(repository.requestConnection(ana, 'budi', null))).toBe('connection_exists');
    expect(await reason(repository.requestConnection(ana, 'ana', null))).toBe('connection_self');
    expect(await reason(repository.requestConnection(ana, 'seed-user-14', null))).toBe('person_unavailable');
    expect(await reason(repository.requestConnection(ana, 'tidak-ada', null))).toBe('person_unavailable');
  });

  it('batas laju dihitung dari percobaan: kirim-batal-kirim tidak mengakali batas', async () => {
    for (let index = 0; index < CONNECTION_RATE_LIMIT.perDay; index += 1) {
      await repository.requestConnection(ana, 'budi', null);
      const [pending] = await repository.listConnections('ana');
      await repository.removeConnection('ana', pending!.id);
    }
    expect(await reason(repository.requestConnection(ana, 'budi', null))).toBe('connection_rate_limited');
  });

  it('kedua pihak boleh memutus; pihak ketiga tidak', async () => {
    await repository.requestConnection(ana, 'budi', null);
    const [pending] = await repository.listConnections('ana');
    expect(await reason(repository.removeConnection('orang-lain', pending!.id))).toBe('connection_not_found');
    await repository.removeConnection('budi', pending!.id);
    expect(await repository.listConnections('ana')).toEqual([]);
  });

  it('saran: hanya yang bisa ditemukan, tanpa diri sendiri & yang sudah berhubungan, diperingkat', async () => {
    await repository.requestConnection(ana, 'seed-user-1', null);
    const suggestions = await repository.suggestPeople(ana, filter());
    const ids = suggestions.map((item) => item.person.userId);

    expect(ids).not.toContain('ana');
    expect(ids).not.toContain('seed-user-1');
    expect(ids).not.toContain('seed-user-14');
    expect(ids).toContain('budi');
    const scores = suggestions.map((item) => item.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('saran bisa disaring minat & kata kunci', async () => {
    const design = await repository.suggestPeople(ana, filter({ interest: 'desain' }));
    expect(design.length).toBeGreaterThan(0);
    expect(design.every((item) => item.person.interests.includes('desain'))).toBe(true);

    const named = await repository.suggestPeople(ana, filter({ search: 'nadia statistika' }));
    expect(named.map((item) => item.person.fullName)).toEqual(['Nadia Kusuma']);
  });

  it('koneksi bersama & tim di kegiatan yang disimpan pembaca ikut jadi alasan', async () => {
    repository.seedDemoNetwork('ana');
    const [team] = await repository.listTeams();
    const suggestions = await repository.suggestPeople(ana, filter({ viewerEvents: [{ id: team!.eventId, slug: 'x', title: 'X', eventType: 'LOMBA' }] }));
    const dimas = suggestions.find((item) => item.person.userId === 'seed-user-2');
    // Dimas terhubung dengan Rani (seed-user-1), yang ada di jaringan awal Ana.
    expect(dimas?.mutualCount).toBeGreaterThanOrEqual(1);
    expect(dimas?.sharedEvents.map((event) => event.id)).toEqual([team!.eventId]);
  });

  it('jaringan awal demo: diterima, masuk (dengan notifikasi), dan terkirim', async () => {
    repository.seedDemoNetwork('ana');
    const connections = await repository.listConnections('ana');
    expect(connections.filter((c) => c.status === 'ACCEPTED')).toHaveLength(DEMO_STARTER_NETWORK.accepted.length);
    expect(connections.filter((c) => c.status === 'PENDING' && c.direction === 'incoming')).toHaveLength(DEMO_STARTER_NETWORK.incoming.length);
    expect(connections.filter((c) => c.status === 'PENDING' && c.direction === 'outgoing')).toHaveLength(DEMO_STARTER_NETWORK.outgoing.length);
    expect(await repository.countUnreadNotifications('ana')).toBeGreaterThanOrEqual(DEMO_STARTER_NETWORK.incoming.length);
  });

  it('keanggotaan tim orang contoh jadi simpul kegiatan', async () => {
    const links = await repository.listTeamLinks(SEED_PEOPLE.map((p) => p.userId), 50);
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.event.slug.length > 0)).toBe(true);
    expect(await repository.listTeamLinks(['bukan-anggota'], 50)).toEqual([]);
  });
});
