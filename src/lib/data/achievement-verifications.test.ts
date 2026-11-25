import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { MemoryEventRepository } from './memory-repository';
import { SEED_EVENTS } from './seed-data';

/**
 * Prestasi terverifikasi & peringkat (ADR-098) di mode seed — skenario yang
 * sama dengan supabase/tests/126_achievement_leaderboard.test.sql.
 */
const CLOSED_LOMBA = SEED_EVENTS.find((event) => event.slug === 'lomba-desain-ui-ux-nasional-edisi-lalu')!;
const OPEN_LOMBA = SEED_EVENTS.find((event) => event.slug === 'kompetisi-inovasi-perangkat-lunak-nusantara-2026')!;
const ALL = { since: null, until: null, category: null };
const viewer = (id: string) => ({ id, fullName: 'Mahasiswa Uji', educationLevel: 'D4_S1' as const, major: 'Informatika', interests: [] });

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

/** Pengguna baru berkampus ITB dengan Juara 3 berbukti di lomba yang sudah tutup. */
async function juara(repository: MemoryEventRepository, userId = 'mhs-uji') {
  await repository.saveStudyPlace(userId, { institutionId: '002001', institutionName: 'Institut Teknologi Bandung', domicileCode: null });
  await repository.upsertTrackerItem(userId, CLOSED_LOMBA.id, 'ACCEPTED');
  await repository.updatePortfolioEntry(userId, CLOSED_LOMBA.id, { achievement: 'JUARA_3', achievementNote: null, proofUrl: 'https://bukti.test/s', visible: true });
  return userId;
}

describe('peringkat awal mode seed', () => {
  it('hanya pengajuan terverifikasi yang dihitung; nama hanya untuk portofolio publik', async () => {
    const repository = new MemoryEventRepository();
    const campuses = await repository.listCampusStandings(ALL, 50);
    expect(campuses.map((row) => [row.institutionName, row.score])).toEqual([
      ['Universitas Indonesia', 10],
      ['Universitas Pendidikan Indonesia', 2],
    ]);
    const people = await repository.listPeopleStandings(ALL, 50);
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ score: 10, institutionName: 'Universitas Indonesia' });
  });
});

describe('pengajuan verifikasi', () => {
  it('menolak yang terlalu dini, bukan hasil kompetitif, tanpa bukti, dan ganda', async () => {
    const repository = new MemoryEventRepository();
    const userId = await juara(repository);

    await repository.upsertTrackerItem(userId, OPEN_LOMBA.id, 'APPLIED');
    await repository.updatePortfolioEntry(userId, OPEN_LOMBA.id, { achievement: 'FINALIS', achievementNote: null, proofUrl: 'https://bukti.test/f', visible: true });
    expect(await reason(repository.requestAchievementVerification(viewer(userId), OPEN_LOMBA.id))).toBe('verification_too_early');

    await repository.updatePortfolioEntry(userId, CLOSED_LOMBA.id, { achievement: 'PESERTA', achievementNote: null, proofUrl: 'https://bukti.test/s', visible: true });
    expect(await reason(repository.requestAchievementVerification(viewer(userId), CLOSED_LOMBA.id))).toBe('verification_not_eligible');

    await repository.updatePortfolioEntry(userId, CLOSED_LOMBA.id, { achievement: 'JUARA_3', achievementNote: null, proofUrl: null, visible: true });
    expect(await reason(repository.requestAchievementVerification(viewer(userId), CLOSED_LOMBA.id))).toBe('verification_needs_proof');

    await repository.updatePortfolioEntry(userId, CLOSED_LOMBA.id, { achievement: 'JUARA_3', achievementNote: null, proofUrl: 'https://bukti.test/s', visible: true });
    await repository.requestAchievementVerification(viewer(userId), CLOSED_LOMBA.id);
    expect(await reason(repository.requestAchievementVerification(viewer(userId), CLOSED_LOMBA.id))).toBe('verification_exists');
    expect(await repository.getAchievementVerification(userId, CLOSED_LOMBA.id)).toMatchObject({ status: 'PENDING', result: 'JUARA_3', institutionName: 'Institut Teknologi Bandung' });
  });

  it('moderator: versi basi, diri sendiri, dan penolakan tanpa alasan ditolak; sah → dihitung + dikabari', async () => {
    const repository = new MemoryEventRepository();
    const userId = await juara(repository);
    await repository.requestAchievementVerification(viewer(userId), CLOSED_LOMBA.id);
    const [item] = (await repository.listPendingAchievementVerifications(50)).filter((row) => row.userId === userId);
    expect(item).toBeDefined();
    const review = { actorId: 'admin-uji', userId, eventId: CLOSED_LOMBA.id, note: null, requestedAt: item!.requestedAt } as const;

    expect(await reason(repository.reviewAchievementVerification({ ...review, decision: 'VERIFIED', requestedAt: new Date(0).toISOString() }))).toBe('verification_changed');
    expect(await reason(repository.reviewAchievementVerification({ ...review, decision: 'VERIFIED', actorId: userId }))).toBe('verification_self');
    expect(await reason(repository.reviewAchievementVerification({ ...review, decision: 'REJECTED', note: ' ' }))).toBe('verification_note_required');

    await repository.reviewAchievementVerification({ ...review, decision: 'VERIFIED' });
    const itb = (await repository.listCampusStandings(ALL, 50)).find((row) => row.institutionId === '002001');
    expect(itb).toMatchObject({ score: 6, people: 1 });
    expect((await repository.listNotifications(userId, 20)).some((note) => note.type === 'ACHIEVEMENT_VERIFIED')).toBe(true);
    expect(await reason(repository.reviewAchievementVerification({ ...review, decision: 'VERIFIED' }))).toBe('verification_not_found');
  });

  it('mengubah hasil setelah diverifikasi menggugurkan verifikasi dan skornya', async () => {
    const repository = new MemoryEventRepository();
    const userId = await juara(repository);
    await repository.requestAchievementVerification(viewer(userId), CLOSED_LOMBA.id);
    const pending = await repository.getAchievementVerification(userId, CLOSED_LOMBA.id);
    await repository.reviewAchievementVerification({ actorId: 'admin-uji', userId, eventId: CLOSED_LOMBA.id, decision: 'VERIFIED', note: null, requestedAt: pending!.requestedAt });

    await repository.updatePortfolioEntry(userId, CLOSED_LOMBA.id, { achievement: 'JUARA_1', achievementNote: null, proofUrl: 'https://bukti.test/s', visible: true });
    expect(await repository.getAchievementVerification(userId, CLOSED_LOMBA.id)).toBeNull();
    expect((await repository.listCampusStandings(ALL, 50)).some((row) => row.institutionId === '002001')).toBe(false);
  });

  it('batal hanya untuk yang masih menunggu', async () => {
    const repository = new MemoryEventRepository();
    const userId = await juara(repository);
    await repository.requestAchievementVerification(viewer(userId), CLOSED_LOMBA.id);
    await repository.cancelAchievementVerification(userId, CLOSED_LOMBA.id);
    expect(await repository.getAchievementVerification(userId, CLOSED_LOMBA.id)).toBeNull();
  });
});

describe('portofolio publik', () => {
  it('tertutup sampai pemiliknya menyalakan; status verifikasi ikut; beasiswa tetap privat', async () => {
    const repository = new MemoryEventRepository();
    const userId = await juara(repository);
    await repository.saveProfileIdentity(userId, { username: 'mhs.uji', bio: null, visibility: 'MEMBERS' });
    expect(await repository.getPublicPortfolioPage('mhs.uji')).toBeNull();

    await repository.setPortfolioPublic(viewer(userId), true);
    expect(await repository.getPortfolioPublic(userId)).toEqual({ value: true, available: true });
    const page = await repository.getPublicPortfolioPage('MHS.UJI');
    expect(page).toMatchObject({ username: 'mhs.uji', institutionName: 'Institut Teknologi Bandung' });
    expect(page!.entries.map((entry) => entry.slug)).toContain(CLOSED_LOMBA.slug);

    const seedPublic = await repository.getPublicPortfolioPage('rizky.hidayat');
    expect(seedPublic).not.toBeNull();
    expect(seedPublic!.entries.find((entry) => entry.slug === CLOSED_LOMBA.slug)?.verification).toBe('VERIFIED');
    expect(seedPublic!.skills.length).toBeGreaterThan(0);
    // Orang contoh lain dengan beasiswa: tidak opt-in → tidak terbaca sama sekali.
    expect(await repository.getPublicPortfolioPage('rani.prameswari')).toBeNull();
  });
});
