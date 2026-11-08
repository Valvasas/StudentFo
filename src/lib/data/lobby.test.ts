import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { CONNECTION_PAGE, type NetworkViewer } from '@/lib/network';
import { MemoryEventRepository } from './memory-repository';
import { SEED_LOBBY } from './seed-data';

/**
 * Lobi lomba di mode seed (ADR-071) — skenario yang SAMA dengan
 * supabase/tests/111_event_lobby.test.sql, supaya mode seed tidak lebih
 * longgar dari produksi.
 */
const viewer = (id: string, fullName: string): NetworkViewer => ({ id, fullName, educationLevel: 'D4_S1', major: null, interests: [] });
const ayu = viewer('ayu', 'Ayu Lobi');
const bima = viewer('bima', 'Bima Lobi');
const citra = viewer('citra', 'Citra Lobi');
const dodi = viewer('dodi', 'Dodi Lobi');

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

describe('MemoryEventRepository — lobi lomba', () => {
  let repository: MemoryEventRepository;
  let lombaId: string;
  let beasiswaId: string;

  async function connect(a: NetworkViewer, b: NetworkViewer) {
    await repository.updateNetworkProfile(b, { discoverable: true, headline: null });
    await repository.requestConnection(a, b.id, null);
    const [pending] = (await repository.listConnections(b.id, { limit: CONNECTION_PAGE.maxLimit, cursor: null, kind: 'incoming' })).items;
    await repository.respondToConnection(b.id, pending!.id, 'accept');
  }

  beforeEach(async () => {
    repository = new MemoryEventRepository();
    // Lomba TANPA anggota contoh — lobi contoh (SEED_LOBBY) punya penghuni tetap.
    lombaId = (await repository.listEvents({ types: ['LOMBA'] })).items.find((event) => event.slug !== SEED_LOBBY.eventSlug)!.id;
    beasiswaId = (await repository.listEvents({ types: ['BEASISWA'] })).items[0]!.id;
    for (const person of [ayu, dodi]) await repository.upsertTrackerItem(person.id, lombaId, 'APPLIED');
    await repository.upsertTrackerItem(bima.id, lombaId, 'ACCEPTED');
    await repository.upsertTrackerItem(citra.id, lombaId, 'SAVED');
    await repository.upsertTrackerItem(ayu.id, beasiswaId, 'APPLIED');
  });

  it('hanya yang sudah mendaftar, dan hanya untuk lomba', async () => {
    expect(await reason(repository.joinLobby(citra, lombaId, { intent: 'CARI_TIM', note: null }))).toBe('lobby_forbidden');
    expect(await repository.getLobby(citra, lombaId)).toBeNull();
    expect(await reason(repository.joinLobby(ayu, beasiswaId, { intent: 'CARI_TIM', note: null }))).toBe('lobby_forbidden');

    const mine = await repository.listMyLobbies(ayu.id);
    expect(mine.map((lobby) => lobby.event.id)).toEqual([lombaId]);
    expect(mine[0]?.membership).toBeNull();
  });

  it('roster timbal-balik: sebelum bergabung hanya jumlah; bergabung ulang memperbarui kartu', async () => {
    await repository.joinLobby(bima, lombaId, { intent: 'CARI_TIM', note: 'Bisa backend' });
    const before = await repository.getLobby(ayu, lombaId);
    expect(before).toMatchObject({ me: null, members: [], memberCount: 1, open: true });

    await repository.joinLobby(ayu, lombaId, { intent: 'CARI_TIM', note: null });
    await repository.joinLobby(ayu, lombaId, { intent: 'CARI_ANGGOTA', note: 'Butuh backend' });
    const after = await repository.getLobby(ayu, lombaId);
    expect(after?.me).toMatchObject({ intent: 'CARI_ANGGOTA', note: 'Butuh backend', relation: 'self' });
    expect(after?.members.map((member) => member.fullName)).toEqual(['Bima Lobi']);
    expect(after?.memberCount).toBe(2);
    expect((await repository.listMyLobbies(ayu.id))[0]?.membership?.intent).toBe('CARI_ANGGOTA');
  });

  it('pencari tim melihat tim yang butuh anggota lebih dulu', async () => {
    await repository.joinLobby(dodi, lombaId, { intent: 'SIAP', note: null });
    await repository.joinLobby(bima, lombaId, { intent: 'CARI_ANGGOTA', note: null });
    await repository.joinLobby(ayu, lombaId, { intent: 'CARI_TIM', note: null });
    const lobby = await repository.getLobby(ayu, lombaId);
    expect(lobby?.members[0]?.fullName).toBe('Bima Lobi');
  });

  it('sesama anggota lobi boleh saling mengajak terhubung walau tidak bisa ditemukan di Koneksi', async () => {
    expect(await reason(repository.requestConnection(ayu, bima.id, null))).toBe('person_unavailable');
    for (const person of [ayu, bima]) await repository.joinLobby(person, lombaId, { intent: 'CARI_TIM', note: null });
    expect(await repository.requestConnection(ayu, bima.id, 'Dari lobi')).toBe('requested');
    expect((await repository.getLobby(ayu, lombaId))?.members[0]?.relation).toBe('pending');
  });

  it('blokir menyembunyikan dua arah', async () => {
    await connect(ayu, dodi);
    for (const person of [ayu, dodi]) await repository.joinLobby(person, lombaId, { intent: 'CARI_TIM', note: null });
    await repository.blockPerson(ayu.id, dodi.id);
    expect((await repository.getLobby(ayu, lombaId))?.members).toEqual([]);
    expect((await repository.getLobby(dodi, lombaId))?.members).toEqual([]);
  });

  it('ajakan: hanya ke koneksi, sekali per lomba, notifikasi satu per orang', async () => {
    expect(await reason(repository.inviteToLobby(ayu, lombaId, citra.id))).toBe('lobby_invite_invalid');
    await connect(ayu, citra);
    await connect(bima, citra);

    expect((await repository.getLobby(ayu, lombaId))?.invitable.map((peer) => peer.userId)).toEqual([citra.id]);
    expect(await repository.inviteToLobby(ayu, lombaId, citra.id)).toBe('invited');
    expect(await repository.inviteToLobby(ayu, lombaId, citra.id)).toBe('already');
    expect(await repository.inviteToLobby(bima, lombaId, citra.id)).toBe('invited');

    const lobby = await repository.getLobby(ayu, lombaId);
    expect(lobby?.invitable).toEqual([]);
    expect(lobby?.invited.map((peer) => peer.userId)).toEqual([citra.id]);

    const invites = (await repository.listNotifications(citra.id, 20)).filter((notification) => notification.type === 'LOBBY_INVITE');
    expect(invites).toHaveLength(1);
    expect(invites[0]?.message).toMatch(/^Ayu Lobi mengajakmu ikut /);
    expect(invites[0]?.event?.id).toBe(lombaId);
  });

  it('keluar lobi hanya menghapus kartu sendiri; hapus akun membersihkan lobi', async () => {
    for (const person of [ayu, bima]) await repository.joinLobby(person, lombaId, { intent: 'CARI_TIM', note: null });
    await repository.leaveLobby(ayu.id, lombaId);
    expect((await repository.getLobby(ayu, lombaId))?.me).toBeNull();
    expect((await repository.getLobby(bima, lombaId))?.memberCount).toBe(1);

    await repository.deleteAccount({ userId: bima.id, actorId: bima.id, reason: null });
    expect((await repository.getLobby(ayu, lombaId))?.memberCount).toBe(0);
  });
});

describe('MemoryEventRepository — lobi contoh (mode demo)', () => {
  it('persona demo yang di-seed langsung punya lobi berisi, dan melihat koneksinya sebagai "Terhubung" setelah bergabung', async () => {
    const repository = new MemoryEventRepository();
    const demo = viewer('demo-mahasiswa', 'Mahasiswa Demo');
    repository.seedDemoNetwork(demo.id);
    repository.seedDemoLobby(demo.id);
    const [lobby] = await repository.listMyLobbies(demo.id);
    expect(lobby?.event.slug).toBe(SEED_LOBBY.eventSlug);
    expect(lobby?.memberCount).toBe(SEED_LOBBY.members.length);

    await repository.joinLobby(demo, lobby!.event.id, { intent: 'CARI_TIM', note: null });
    const view = await repository.getLobby(demo, lobby!.event.id);
    expect(view?.members.find((member) => member.userId === 'seed-user-1')?.relation).toBe('connected');
    expect(view?.members[0]?.intent).toBe('CARI_ANGGOTA');
    expect(view?.invitable.map((peer) => peer.userId)).not.toContain('seed-user-1');
  });
});

describe('MemoryEventRepository — pendataan kinerja', () => {
  it('menyimpan tanpa identitas, membaca per rentang dengan judul acara', async () => {
    const repository = new MemoryEventRepository();
    const event = (await repository.listEvents({ types: ['LOMBA'] })).items[0]!;
    await repository.recordOutboundSurvey({
      eventId: event.id,
      signedIn: false,
      educationLevel: 'SMA_SMK',
      source: 'INSTAGRAM',
      plan: 'CARI_TIM',
      province: null,
      institution: null,
    });
    await repository.recordOutboundSurvey({ eventId: 'tidak-ada', signedIn: false, educationLevel: 'D3', source: 'GOOGLE', plan: null, province: null, institution: null });

    const rows = await repository.listOutboundSurveys(new Date(Date.now() - 86_400_000));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eventTitle: event.title, eventSlug: event.slug, source: 'INSTAGRAM', signedIn: false });
    expect(Object.keys(rows[0]!)).not.toContain('userId');
    expect(await repository.listOutboundSurveys(new Date(Date.now() + 60_000))).toEqual([]);
  });
});
