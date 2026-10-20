import { beforeEach, describe, expect, it } from 'vitest';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { AppError } from '@/lib/errors';
import type { NetworkViewer } from '@/lib/network';
import type { TeamSeekerInput } from '@/types/domain';
import { actAs, clientFor, createEvent, createUser, sql } from './harness';

/**
 * Pencocokan tim (ADR-057) lewat PostgREST sungguhan: RLS `team_seekers`,
 * hak per kolom, fungsi `list_team_candidates` (timbal-balik, blokir,
 * portofolio publik, tanpa email) dan perluasan `is_discoverable()` yang
 * membuat tombol "Ajak jadi partner" bisa bekerja. MemoryEventRepository
 * hanya mencerminkan aturan ini; di sinilah aturannya dibuktikan.
 */
const repo = new SupabaseEventRepository(noCache);

const card = (overrides: Partial<TeamSeekerInput> = {}): TeamSeekerInput => ({
  open: true,
  city: 'Bandung',
  skills: ['web-aplikasi'],
  seeking: ['ui-ux'],
  remoteOk: true,
  pitch: null,
  ...overrides,
});

function person(fullName: string): NetworkViewer {
  return { id: createUser({ fullName }), fullName, educationLevel: 'D4_S1', major: 'Teknik Informatika', interests: [] };
}

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? (error.reason ?? `tanpa-reason: ${error.message}`) : String(error);
  }
}

const idsSeenBy = async (viewerId: string) => {
  actAs(viewerId);
  return (await repo.listSeekerCandidates(viewerId, 400)).map((candidate) => candidate.person.userId);
};

beforeEach(() => actAs(null));

describe('SupabaseEventRepository — pencocokan tim', () => {
  it('bawaan tertutup: tanpa kartu tidak ada kandidat; kartu tertutup tidak mencari dan tidak ditemukan', async () => {
    const ana = person('Ana Cocok');
    const budi = person('Budi Cocok');

    actAs(ana.id);
    expect(await repo.getSeekerProfile(ana.id)).toBeNull();
    expect(await repo.listSeekerCandidates(ana.id, 50)).toEqual([]);

    await repo.saveSeekerProfile(ana, card({ open: false }));
    expect(await repo.getSeekerProfile(ana.id)).toMatchObject({ open: false, skills: ['web-aplikasi'] });
    expect(await repo.listSeekerCandidates(ana.id, 50)).toEqual([]);

    actAs(budi.id);
    await repo.saveSeekerProfile(budi, card());
    expect(await idsSeenBy(budi.id)).not.toContain(ana.id);
  });

  it('timbal-balik: keduanya terbuka saling melihat, tanpa email; menutup kartu menghilangkan dari yang lain', async () => {
    const ana = person('Ana Timbal');
    const budi = person('Budi Timbal');
    const cici = person('Cici Pengintip'); // tidak pernah membuka kartu

    actAs(ana.id);
    await repo.saveSeekerProfile(ana, card({ skills: ['web-aplikasi'], seeking: ['ui-ux'], pitch: 'Frontend, cari desainer' }));
    actAs(budi.id);
    await repo.saveSeekerProfile(budi, card({ skills: ['ui-ux', 'grafis'], seeking: ['web-aplikasi'], city: 'Cimahi', remoteOk: false }));

    expect(await idsSeenBy(ana.id)).toContain(budi.id);
    expect(await idsSeenBy(budi.id)).toContain(ana.id);

    actAs(ana.id);
    const [seen] = (await repo.listSeekerCandidates(ana.id, 400)).filter((candidate) => candidate.person.userId === budi.id);
    expect(seen).toMatchObject({ city: 'Cimahi', skills: ['ui-ux', 'grafis'], seeking: ['web-aplikasi'], remoteOk: false, relation: null });
    expect(JSON.stringify(seen)).not.toMatch(/@|uji\.example/);

    // Orang yang tidak membuka kartunya sendiri tidak bisa menelusuri kartu orang lain.
    expect(await idsSeenBy(cici.id)).toEqual([]);

    actAs(budi.id);
    await repo.saveSeekerProfile(budi, card({ open: false, skills: ['ui-ux'] }));
    expect(await idsSeenBy(ana.id)).not.toContain(budi.id);
  });

  it('blokir menghilangkan di kedua arah', async () => {
    const ana = person('Ana Blokir');
    const budi = person('Budi Blokir');
    for (const who of [ana, budi]) {
      actAs(who.id);
      await repo.saveSeekerProfile(who, card());
    }
    expect(await idsSeenBy(ana.id)).toContain(budi.id);

    actAs(ana.id);
    await repo.blockPerson(ana.id, budi.id);
    expect(await idsSeenBy(ana.id)).not.toContain(budi.id);
    expect(await idsSeenBy(budi.id)).not.toContain(ana.id);

    actAs(ana.id);
    await repo.unblockPerson(ana.id, budi.id);
    expect(await idsSeenBy(ana.id)).toContain(budi.id);
  });

  it('portofolio kandidat = ringkasan PUBLIK saja: lomba tampil, beasiswa privat tidak', async () => {
    const ana = person('Ana Portofolio');
    const juara = person('Juara Portofolio');
    for (const who of [ana, juara]) {
      actAs(who.id);
      await repo.saveSeekerProfile(who, card());
    }
    const lomba = createEvent({ eventType: 'LOMBA', status: 'APPROVED' });
    const beasiswa = createEvent({ eventType: 'BEASISWA', status: 'APPROVED' });
    sql(`INSERT INTO public.application_tracker (user_id, event_id, status, achievement)
         VALUES ('${juara.id}', '${lomba.id}', 'ACCEPTED', 'JUARA_1'),
                ('${juara.id}', '${beasiswa.id}', 'ACCEPTED', 'PENERIMA')`);

    actAs(ana.id);
    const found = (await repo.listSeekerCandidates(ana.id, 400)).find((candidate) => candidate.person.userId === juara.id);
    expect(found?.portfolio.count).toBe(1);
    expect(found?.portfolio.achievements).toEqual(['JUARA_1']);
  });

  it('kartu terbuka bisa diajak walau tidak ada di direktori Koneksi; kartu tertutup tidak', async () => {
    const ana = person('Ana Ajak');
    const budi = person('Budi Ajak');
    const dewi = person('Dewi Tertutup');
    for (const who of [ana, budi]) {
      actAs(who.id);
      await repo.saveSeekerProfile(who, card());
    }
    actAs(dewi.id);
    await repo.saveSeekerProfile(dewi, card({ open: false }));

    actAs(ana.id);
    expect(await repo.requestConnection(ana, budi.id, null)).toBe('requested');
    expect(await reason(repo.requestConnection(ana, dewi.id, null))).toBe('person_unavailable');

    // Direktori Koneksi TIDAK berubah: pemilik kartu terbuka tidak muncul di saran orang.
    const suggested = await repo.suggestPeople(ana, { search: '', interest: null, limit: 50, viewerEvents: [] });
    expect(suggested.map((entry) => entry.person.userId)).not.toContain(budi.id);
  });

  it('hak tabel: orang lain tidak bisa membaca atau mengubah kartu; kartu terbuka wajib berguna', async () => {
    const ana = person('Ana Hak');
    const budi = person('Budi Hak');
    actAs(ana.id);
    await repo.saveSeekerProfile(ana, card({ pitch: 'rahasia dapur' }));

    const asBudi = clientFor(budi.id);
    const read = await asBudi.from('team_seekers').select('user_id').eq('user_id', ana.id);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const tamper = await asBudi.from('team_seekers').update({ pitch: 'dibajak' }).eq('user_id', ana.id).select('user_id');
    expect(tamper.data ?? []).toEqual([]);
    const anon = await clientFor(null).from('team_seekers').select('user_id');
    expect(anon.error).not.toBeNull();

    // user_id tidak termasuk kolom yang boleh di-UPDATE: kartu tidak bisa dipindahkan ke orang lain.
    const move = await clientFor(ana.id).from('team_seekers').update({ user_id: budi.id }).eq('user_id', ana.id);
    expect(move.error).not.toBeNull();

    // Kartu terbuka tanpa keahlian ditolak database (penjaga untuk klien lain selain form).
    expect(await reason(repo.saveSeekerProfile(ana, card({ skills: [] })))).toBeDefined();
    // Slug di luar daftar ditolak CHECK.
    const bogus = await clientFor(ana.id).from('team_seekers').update({ skills: ['meretas'] }).eq('user_id', ana.id);
    expect(bogus.error).not.toBeNull();
  });

  it('jendela kandidat dijepit: 0 → 1 baris; urutan stabil di antara dua panggilan', async () => {
    const ana = person('Ana Jendela');
    const others = [person('Jendela Satu'), person('Jendela Dua'), person('Jendela Tiga')];
    for (const who of [ana, ...others]) {
      actAs(who.id);
      await repo.saveSeekerProfile(who, card());
    }
    actAs(ana.id);
    expect(await repo.listSeekerCandidates(ana.id, 0)).toHaveLength(1);
    const first = (await repo.listSeekerCandidates(ana.id, 400)).map((candidate) => candidate.person.userId);
    const second = (await repo.listSeekerCandidates(ana.id, 400)).map((candidate) => candidate.person.userId);
    expect(second).toEqual(first);
  });
});
