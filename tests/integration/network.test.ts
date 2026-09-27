import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import type { NetworkViewer } from '@/lib/network';
import { actAs, createEvent, createUser, sql } from './harness';

/**
 * Jalur Koneksi (ADR-040) lewat PostgREST sungguhan: view definer, hak
 * per kolom, trigger notifikasi & batas laju, dan RPC koneksi bersama —
 * hal-hal yang tidak bisa dibuktikan oleh MemoryEventRepository.
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
    const [outgoing] = await repo.listConnections(ana.id);
    expect(outgoing).toMatchObject({ direction: 'outgoing', status: 'PENDING', person: { fullName: 'Budi Integrasi', headline: 'Backend Go' } });
    expect(await reason(repo.respondToConnection(ana.id, outgoing!.id, 'accept'))).toBe('connection_forbidden');

    actAs(budi.id);
    const [incoming] = await repo.listConnections(budi.id);
    expect(incoming).toMatchObject({ direction: 'incoming', message: 'Halo Budi', person: { fullName: 'Ana Integrasi' } });
    expect((await repo.listNotifications(budi.id, 10)).some((n) => n.type === 'CONNECTION_REQUEST')).toBe(true);
    await repo.respondToConnection(budi.id, incoming!.id, 'accept');

    actAs(ana.id);
    const [accepted] = await repo.listConnections(ana.id);
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
    expect((await repo.listConnections(ana.id)).filter((c) => c.status === 'ACCEPTED')).toHaveLength(1);
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
    for (const connection of await repo.listConnections(friend.id)) await repo.respondToConnection(friend.id, connection.id, 'accept');

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
    const [pending] = await repo.listConnections(a.id);

    actAs(c.id);
    expect(await reason(repo.removeConnection(c.id, pending!.id))).toBe('connection_not_found');
    expect(await repo.listConnections(c.id)).toEqual([]);

    actAs(b.id);
    await repo.respondToConnection(b.id, pending!.id, 'decline');
    actAs(a.id);
    expect(await repo.listConnections(a.id)).toEqual([]);

    // Memutus koneksi yang sudah diterima — dari sisi pengirim.
    actAs(b.id);
    await repo.updateNetworkProfile(b, { discoverable: true, headline: null });
    actAs(a.id);
    await repo.requestConnection(a, b.id, null);
    actAs(b.id);
    const [again] = await repo.listConnections(b.id);
    await repo.respondToConnection(b.id, again!.id, 'accept');
    actAs(a.id);
    await repo.removeConnection(a.id, again!.id);
    expect(await repo.listConnections(a.id)).toEqual([]);
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
});
