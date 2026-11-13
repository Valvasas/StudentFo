import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { remainingSlots } from '@/types/domain';
import { MemoryEventRepository } from './memory-repository';
import { TEAM_LIST_LIMIT } from './repository';

async function freshTeam(repo: MemoryEventRepository, slotsNeeded = 3) {
  const events = await repo.listEvents({});
  const eventId = events.items[0]!.id;
  const teamId = await repo.createTeam({
    eventId,
    title: 'Tim uji coba hackathon',
    description: 'Butuh satu frontend dan satu analis data.',
    slotsNeeded,
    createdBy: 'leader-1',
    createdByName: 'Ketua Satu',
  });
  return { teamId, eventId };
}

describe('MemoryEventRepository — tim lomba', () => {
  it('memasukkan pembuat sebagai ketua saat tim dibuat', async () => {
    const repo = new MemoryEventRepository();
    const { teamId, eventId } = await freshTeam(repo);

    const team = await repo.getTeamById(teamId);
    expect(team).not.toBeNull();
    expect(team!.eventId).toBe(eventId);
    expect(team!.createdBy).toBe('leader-1');
    expect(team!.members.length).toBe(1);
    expect(team!.members[0]?.role).toBe('leader');
    expect(team!.members[0]?.fullName).toBe('Ketua Satu');
    expect(team!.event?.id).toBe(eventId);
  });

  it('menolak pembuatan tim untuk kegiatan yang tidak tayang', async () => {
    const repo = new MemoryEventRepository();

    await expect(
      repo.createTeam({
        eventId: 'tidak-ada',
        title: 'Tim untuk kegiatan hantu',
        description: null,
        slotsNeeded: 3,
        createdBy: 'leader-1',
        createdByName: 'Ketua Satu',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('menambahkan anggota lewat joinTeam dan mengurangi sisa slot', async () => {
    const repo = new MemoryEventRepository();
    const { teamId } = await freshTeam(repo, 3);

    await repo.joinTeam('member-1', 'Anggota Satu', teamId);

    const team = await repo.getTeamById(teamId);
    expect(team!.members.length).toBe(2);
    expect(remainingSlots(team!)).toBe(1);
  });

  it('tidak menggandakan anggota kalau bergabung dua kali', async () => {
    const repo = new MemoryEventRepository();
    const { teamId } = await freshTeam(repo);

    await repo.joinTeam('member-1', 'Anggota Satu', teamId);
    await repo.joinTeam('member-1', 'Anggota Satu', teamId);

    const team = await repo.getTeamById(teamId);
    expect(team!.members.filter((m) => m.userId === 'member-1').length).toBe(1);
  });

  it('menolak bergabung ke tim yang sudah penuh', async () => {
    const repo = new MemoryEventRepository();
    // slotsNeeded 2: ketua + satu anggota sudah memenuhinya.
    const { teamId } = await freshTeam(repo, 2);

    await repo.joinTeam('member-1', 'Anggota Satu', teamId);
    await expect(repo.joinTeam('member-2', 'Anggota Dua', teamId)).rejects.toBeInstanceOf(AppError);

    const team = await repo.getTeamById(teamId);
    expect(remainingSlots(team!)).toBe(0);
  });

  it('mengizinkan anggota keluar, tapi tidak ketuanya', async () => {
    const repo = new MemoryEventRepository();
    const { teamId } = await freshTeam(repo);

    await repo.joinTeam('member-1', 'Anggota Satu', teamId);
    await repo.leaveTeam('member-1', teamId);
    expect((await repo.getTeamById(teamId))!.members.length).toBe(1);

    // Tim tanpa ketua tidak bisa dikelola siapa pun lagi.
    await expect(repo.leaveTeam('leader-1', teamId)).rejects.toBeInstanceOf(AppError);
    expect((await repo.getTeamById(teamId))!.members.length).toBe(1);
  });

  /**
   * Regresi otorisasi: di produksi RLS yang menolak, tapi implementasi
   * memory tidak punya RLS sama sekali. Tanpa pemeriksaan di repository,
   * mode seed akan mengizinkan hal yang produksi tolak.
   */
  it('hanya ketua yang boleh mengeluarkan anggota', async () => {
    const repo = new MemoryEventRepository();
    const { teamId } = await freshTeam(repo);
    await repo.joinTeam('member-1', 'Anggota Satu', teamId);
    await repo.joinTeam('member-2', 'Anggota Dua', teamId);

    await expect(
      repo.removeTeamMember('member-1', teamId, 'member-2'),
    ).rejects.toBeInstanceOf(AppError);
    expect((await repo.getTeamById(teamId))!.members.length).toBe(3);

    await repo.removeTeamMember('leader-1', teamId, 'member-2');
    expect((await repo.getTeamById(teamId))!.members.length).toBe(2);
  });

  it('tidak mengizinkan ketua mengeluarkan dirinya sendiri', async () => {
    const repo = new MemoryEventRepository();
    const { teamId } = await freshTeam(repo);

    await expect(
      repo.removeTeamMember('leader-1', teamId, 'leader-1'),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('hanya ketua yang boleh membubarkan tim', async () => {
    const repo = new MemoryEventRepository();
    const { teamId } = await freshTeam(repo);
    await repo.joinTeam('member-1', 'Anggota Satu', teamId);

    await expect(repo.deleteTeam('member-1', teamId)).rejects.toBeInstanceOf(AppError);
    expect(await repo.getTeamById(teamId)).not.toBeNull();

    await repo.deleteTeam('leader-1', teamId);
    expect(await repo.getTeamById(teamId)).toBeNull();
  });

  it('menyaring daftar tim berdasarkan kegiatan', async () => {
    const repo = new MemoryEventRepository();
    const { teamId, eventId } = await freshTeam(repo);

    const forEvent = await repo.listTeams(eventId);
    expect(forEvent.some((team) => team.id === teamId)).toBe(true);

    expect(await repo.listTeams('event-yang-tidak-ada')).toEqual([]);
  });
});

describe('MemoryEventRepository — jendela daftar tim (paritas dengan Supabase)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Satu tim lama untuk kegiatan B, lalu `TEAM_LIST_LIMIT` tim yang lebih baru untuk kegiatan A. */
  async function crowdedRepo() {
    const repo = new MemoryEventRepository();
    const [eventA, eventB] = (await repo.listEvents({})).items;
    vi.useFakeTimers({ toFake: ['Date'] });
    let clock = Date.now() + 24 * 60 * 60 * 1000;
    const create = (eventId: string, title: string) => {
      clock += 60_000;
      vi.setSystemTime(clock);
      return repo.createTeam({ eventId, title, description: null, slotsNeeded: 3, createdBy: 'leader-1', createdByName: 'Ketua Satu' });
    };
    const oldTeam = await create(eventB!.id, 'Tim lama kegiatan B');
    for (let index = 0; index < TEAM_LIST_LIMIT; index += 1) await create(eventA!.id, `Tim baru ${index}`);
    return { repo, oldTeam, eventB: eventB!.id };
  }

  it('daftar global dipotong di TEAM_LIST_LIMIT, terbaru dulu — seperti .limit() di produksi', async () => {
    const { repo, oldTeam } = await crowdedRepo();
    const all = await repo.listTeams();
    expect(all).toHaveLength(TEAM_LIST_LIMIT);
    expect(all[0]!.title).toBe(`Tim baru ${TEAM_LIST_LIMIT - 1}`);
    expect(all.some((team) => team.id === oldTeam)).toBe(false);
  });

  it('tim lama sebuah kegiatan tetap terbaca lewat listTeams(eventId), bukan saringan jendela global', async () => {
    const { repo, oldTeam, eventB } = await crowdedRepo();
    expect((await repo.listTeams(eventB)).map((team) => team.id)).toContain(oldTeam);
  });

  it('listTeamsByIds: terbaru dulu, id tak dikenal dilewati, duplikat dihitung sekali', async () => {
    const { repo, oldTeam } = await crowdedRepo();
    const [newest] = await repo.listTeams();
    const teams = await repo.listTeamsByIds([oldTeam, 'tidak-ada', newest!.id, oldTeam]);
    expect(teams.map((team) => team.id)).toEqual([newest!.id, oldTeam]);
    expect(await repo.listTeamsByIds([])).toEqual([]);
  });
});
