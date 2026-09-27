import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { CONNECTION_PAGE, type NetworkViewer } from '@/lib/network';
import { actAs, createEvent, createUser, sql } from './harness';

/**
 * Jalur Koneksi (ADR-040) lewat PostgREST sungguhan: view definer, hak
 * per kolom, trigger notifikasi & batas laju, dan RPC koneksi bersama —
 * hal-hal yang tidak bisa dibuktikan oleh MemoryEventRepository.
 */
const repo = new SupabaseEventRepository(noCache);
const connectionsOf = async (userId: string) => (await repo.listConnections(userId, { limit: CONNECTION_PAGE.maxLimit, cursor: null })).items;

const reasonOf = (error: unknown) => (error instanceof AppError ? (error.reason ?? `tanpa-reason: ${error.message}`) : String(error));
async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return reasonOf(error);
  }
}

function viewer(id: string, fullName: string, interests: string[] = []): NetworkViewer {
  return { id, fullName, educationLevel: 'D4_S1', major: 'Teknik Informatika', interests };
}

beforeEach(() => actAs(null));

describe('SupabaseEventRepository — koneksi', () => {
  it('opt-in → ajak berpesan → diterima; notifikasi di kedua sisi; status tidak bisa dipalsukan', async () => {
    const ana = viewer(createUser({ fullName: 'Ana Integrasi' }), 'Ana Integrasi');
    const budi = viewer(createUser({ fullName: 'Budi Integrasi' }), 'Budi Integrasi');

    actAs(budi.id);
    expect(await repo.getNetworkProfile(budi.id)).toEqual({ discoverable: false, headline: null });
    await repo.updateNetworkProfile(budi, { discoverable: true, headline: 'Backend' });
    await repo.updateNetworkProfile(budi, { discoverable: true, headline: 'Backend Go' });
    expect(await repo.getNetworkProfile(budi.id)).toEqual({ discoverable: true, headline: 'Backend Go' });

    actAs(ana.id);
    expect(await repo.requestConnection(ana, budi.id, 'Halo Budi')).toBe('requested');
    expect(await reason(repo.requestConnection(ana, budi.id, null))).toBe('connection_exists');
    const [outgoing] = await connectionsOf(ana.id);
    expect(outgoing).toMatchObject({ direction: 'outgoing', status: 'PENDING', person: { fullName: 'Budi Integrasi', headline: 'Backend Go' } });
    expect(await reason(repo.respondToConnection(ana.id, outgoing!.id, 'accept'))).toBe('connection_forbidden');

    actAs(budi.id);
    const [incoming] = await connectionsOf(budi.id);
    expect(incoming).toMatchObject({ direction: 'incoming', message: 'Halo Budi', person: { fullName: 'Ana Integrasi' } });
    expect((await repo.listNotifications(budi.id, 10)).some((n) => n.type === 'CONNECTION_REQUEST')).toBe(true);
    await repo.respondToConnection(budi.id, incoming!.id, 'accept');

    actAs(ana.id);
    const [accepted] = await connectionsOf(ana.id);
    expect(accepted!.status).toBe('ACCEPTED');
    expect(accepted!.respondedAt).not.toBeNull();
    expect((await repo.listNotifications(ana.id, 10)).some((n) => n.message === 'Budi Integrasi menerima ajakan koneksimu.')).toBe(true);
  });

  it('orang tersembunyi tidak bisa diajak & tidak muncul di saran; ajakan dua arah langsung terhubung', async () => {
    const ana = viewer(createUser({ fullName: 'Ana Dua Arah' }), 'Ana Dua Arah', ['teknologi']);
    const hidden = viewer(createUser({ fullName: 'Tersembunyi' }), 'Tersembunyi');
    const cici = viewer(createUser({ fullName: 'Cici Dua Arah' }), 'Cici Dua Arah', ['teknologi']);

    actAs(ana.id);
    expect(await reason(repo.requestConnection(ana, hidden.id, null))).toBe('person_unavailable');
    expect(await reason(repo.requestConnection(ana, 'bukan-uuid', null))).toBe('person_unavailable');
    await repo.updateNetworkProfile(ana, { discoverable: true, headline: null });

    actAs(cici.id);
    await repo.updateNetworkProfile(cici, { discoverable: true, headline: null });
    sql(`UPDATE public.users SET interests = '{teknologi}' WHERE id IN ('${ana.id}', '${cici.id}')`);
    const ids = (await repo.suggestPeople(cici, { search: 'Dua Arah', interest: null, limit: 24, viewerEvents: [] })).map((s) => s.person.userId);
    expect(ids).toContain(ana.id);
    expect(ids).not.toContain(hidden.id);
    expect(ids).not.toContain(cici.id);
    await repo.requestConnection(cici, ana.id, null);

    actAs(ana.id);
    expect(await repo.requestConnection(ana, cici.id, null)).toBe('accepted');
    expect((await connectionsOf(ana.id)).filter((c) => c.status === 'ACCEPTED')).toHaveLength(1);
    const after = await repo.suggestPeople(ana, { search: 'Dua Arah', interest: null, limit: 24, viewerEvents: [] });
    expect(after.map((s) => s.person.userId)).not.toContain(cici.id);
  });

  it('koneksi bersama & tim di kegiatan pembaca ikut jadi alasan; simpul kegiatan terbaca', async () => {
    const me = viewer(createUser({ fullName: 'Aku Bersama' }), 'Aku Bersama');
    const friend = viewer(createUser({ fullName: 'Teman Bersama' }), 'Teman Bersama');
    const target = viewer(createUser({ fullName: 'Target Bersama' }), 'Target Bersama');
    for (const person of [me, friend, target]) {
      actAs(person.id);
      await repo.updateNetworkProfile(person, { discoverable: true, headline: null });
    }
    actAs(me.id);
    await repo.requestConnection(me, friend.id, null);
    actAs(target.id);
    await repo.requestConnection(target, friend.id, null);
    actAs(friend.id);
    for (const connection of await connectionsOf(friend.id)) await repo.respondToConnection(friend.id, connection.id, 'accept');

    const event = createEvent({ title: 'Lomba Tim Bersama' });
    const teamId = sql(`INSERT INTO public.teams (event_id, created_by, title, slots_needed) VALUES ('${event.id}', '${target.id}', 'Tim Bersama', 4) RETURNING id`).split('\n')[0]!;
    sql(`INSERT INTO public.team_members (team_id, user_id, role) VALUES ('${teamId}', '${target.id}', 'leader')`);

    actAs(me.id);
    const [suggestion] = await repo.suggestPeople(me, {
      search: 'Target Bersama',
      interest: null,
      limit: 24,
      viewerEvents: [{ id: event.id, slug: event.slug, title: event.title, eventType: 'LOMBA' }],
    });
    expect(suggestion).toMatchObject({ mutualCount: 1, person: { userId: target.id } });
    expect(suggestion!.sharedEvents.map((e) => e.id)).toEqual([event.id]);

    const links = await repo.listTeamLinks([target.id], 50);
    expect(links).toEqual([{ userId: target.id, teamId, event: { id: event.id, slug: event.slug, title: event.title, eventType: 'LOMBA' } }]);
  });

  it('pihak ketiga tidak bisa memutus; yang diajak boleh menolak (baris hilang)', async () => {
    const a = viewer(createUser({ fullName: 'Pihak A' }), 'Pihak A');
    const b = viewer(createUser({ fullName: 'Pihak B' }), 'Pihak B');
    const c = viewer(createUser({ fullName: 'Pihak C' }), 'Pihak C');
    actAs(b.id);
    await repo.updateNetworkProfile(b, { discoverable: true, headline: null });
    actAs(a.id);
    await repo.requestConnection(a, b.id, null);
    const [pending] = await connectionsOf(a.id);

    actAs(c.id);
    expect(await reason(repo.removeConnection(c.id, pending!.id))).toBe('connection_not_found');
    expect(await connectionsOf(c.id)).toEqual([]);

    actAs(b.id);
    await repo.respondToConnection(b.id, pending!.id, 'decline');
    actAs(a.id);
    expect(await connectionsOf(a.id)).toEqual([]);

    // Memutus koneksi yang sudah diterima — dari sisi pengirim.
    actAs(b.id);
    await repo.updateNetworkProfile(b, { discoverable: true, headline: null });
    actAs(a.id);
    await repo.requestConnection(a, b.id, null);
    actAs(b.id);
    const [again] = await connectionsOf(b.id);
    await repo.respondToConnection(b.id, again!.id, 'accept');
    actAs(a.id);
    await repo.removeConnection(a.id, again!.id);
    expect(await connectionsOf(a.id)).toEqual([]);
  });

  it('batas laju: ajakan ke-31 dalam 24 jam ditolak dengan kode yang jelas', async () => {
    const spammer = viewer(createUser({ fullName: 'Pengirim Banyak' }), 'Pengirim Banyak');
    const target = viewer(createUser({ fullName: 'Target Banyak' }), 'Target Banyak');
    actAs(target.id);
    await repo.updateNetworkProfile(target, { discoverable: true, headline: null });
    sql(`INSERT INTO public.rate_limit_hits (bucket) SELECT 'connection:${spammer.id}' FROM generate_series(1, 30)`);
    actAs(spammer.id);
    expect(await reason(repo.requestConnection(spammer, target.id, null))).toBe('connection_rate_limited');
  });

  it('blokir (ADR-041): lewat view — nama di daftar blokir, saling hilang dari saran, pihak ketiga tidak terpengaruh', async () => {
    const a = viewer(createUser({ fullName: 'Ana Blokir' }), 'Ana Blokir', ['teknologi']);
    const b = viewer(createUser({ fullName: 'Budi Blokir' }), 'Budi Blokir', ['teknologi']);
    const c = viewer(createUser({ fullName: 'Cici Blokir' }), 'Cici Blokir', ['teknologi']);
    for (const person of [a, b, c]) {
      actAs(person.id);
      await repo.updateNetworkProfile(person, { discoverable: true, headline: null });
    }
    actAs(a.id);
    await repo.requestConnection(a, b.id, null);
    actAs(b.id);
    const [incoming] = await connectionsOf(b.id);
    await repo.respondToConnection(b.id, incoming!.id, 'accept');

    actAs(a.id);
    await repo.blockPerson(a.id, b.id);
    expect(await connectionsOf(a.id)).toEqual([]);
    expect(await repo.listBlockedPeople(a.id)).toMatchObject([{ userId: b.id, fullName: 'Budi Blokir' }]);
    const search = { search: 'Blokir', interest: null, limit: 24, viewerEvents: [] };
    const forA = (await repo.suggestPeople(a, search)).map((s) => s.person.userId);
    expect(forA).not.toContain(b.id);
    expect(forA).toContain(c.id);

    actAs(b.id);
    expect(await connectionsOf(b.id)).toEqual([]);
    expect(await repo.listBlockedPeople(b.id)).toEqual([]);
    // Arah "dia memblokirku" hanya bisa disaring view — RLS menyembunyikan barisnya dari B.
    const forB = (await repo.suggestPeople(b, search)).map((s) => s.person.userId);
    expect(forB).not.toContain(a.id);
    expect(forB).toContain(c.id);

    actAs(c.id);
    expect(await repo.listBlockedPeople(c.id)).toEqual([]);
    const forC = (await repo.suggestPeople(c, search)).map((s) => s.person.userId);
    expect(forC).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('blokir: ajakan masuk dari orang tersembunyi bisa diblokir; orang yang tak pernah terlihat tidak', async () => {
    const me = viewer(createUser({ fullName: 'Aku Target' }), 'Aku Target');
    const stalker = viewer(createUser({ fullName: 'Pengirim Tersembunyi' }), 'Pengirim Tersembunyi');
    const stranger = viewer(createUser({ fullName: 'Orang Asing' }), 'Orang Asing');
    actAs(me.id);
    await repo.updateNetworkProfile(me, { discoverable: true, headline: null });
    actAs(stalker.id);
    await repo.requestConnection(stalker, me.id, 'halo');

    actAs(me.id);
    expect(await reason(repo.blockPerson(me.id, stranger.id))).toBe('block_unavailable');
    expect(await reason(repo.blockPerson(me.id, 'bukan-uuid'))).toBe('block_unavailable');
    expect(await reason(repo.blockPerson(me.id, '00000000-0000-4000-8000-00000000dead'))).toBe('block_unavailable');
    expect(await repo.listBlockedPeople(me.id)).toEqual([]);

    await repo.blockPerson(me.id, stalker.id);
    expect(await repo.countConnections(me.id)).toEqual({ accepted: 0, incoming: 0, outgoing: 0 });
    expect(await repo.listBlockedPeople(me.id)).toMatchObject([{ userId: stalker.id, fullName: 'Pengirim Tersembunyi' }]);
    actAs(stalker.id);
    expect(await reason(repo.requestConnection(stalker, me.id, null))).toBe('person_unavailable');
  });

  it('paginasi melewati batas max_rows tanpa kehilangan baris', async () => {
    const me = viewer(createUser({ fullName: 'Aku Banyak Koneksi' }), 'Aku Banyak Koneksi');
    // Disiapkan langsung di SQL: 1.200 koneksi diterima — di atas max_rows
    // (1000). Trigger memaksa created_at = now() untuk semuanya, jadi urutan
    // antarhalaman sepenuhnya bergantung pada pemecah seri `connection_id`.
    sql(`INSERT INTO auth.users (id, email) SELECT gen_random_uuid(), 'massal-' || g || '-${me.id}@uji.example' FROM generate_series(1, 1200) g`);
    sql(`INSERT INTO public.connections (requester_id, addressee_id)
         SELECT id, '${me.id}' FROM auth.users WHERE email LIKE 'massal-%-${me.id}@uji.example'`);
    sql(`UPDATE public.connections SET status = 'ACCEPTED' WHERE addressee_id = '${me.id}'`);

    actAs(me.id);
    expect(await repo.countConnections(me.id)).toEqual({ accepted: 1200, incoming: 0, outgoing: 0 });
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await repo.listConnections(me.id, { limit: CONNECTION_PAGE.maxLimit, cursor });
      for (const item of page.items) seen.add(item.id);
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen.size).toBe(1200);
  });
});
