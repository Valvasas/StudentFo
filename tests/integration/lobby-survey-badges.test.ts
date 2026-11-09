import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateBadges } from '@/lib/achievements';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import type { NetworkViewer } from '@/lib/network';
import { actAs, createEvent, createUser, sql } from './harness';

/**
 * Lobi (ADR-071), pendataan kinerja (ADR-070), dan lencana publik (ADR-072)
 * lewat PostgREST sungguhan: nama parameter RPC, bentuk JSONB, RLS, dan
 * policy koneksi yang diperluas — hal yang tidak dibuktikan mode memori.
 */
const repo = new SupabaseEventRepository(noCache);
const reasonOf = (error: unknown) => (error instanceof AppError ? (error.reason ?? error.message) : String(error));

function person(fullName: string): NetworkViewer {
  return { id: createUser({ fullName }), fullName, educationLevel: 'D4_S1', major: null, interests: [] };
}

function registerViaTracker(userId: string, eventId: string) {
  sql(`INSERT INTO public.application_tracker (user_id, event_id, status) VALUES ('${userId}', '${eventId}', 'APPLIED')`);
}

beforeEach(() => actAs(null));

describe('SupabaseEventRepository — lobi lomba', () => {
  it('bergabung → roster timbal-balik → sapa tanpa "bisa ditemukan" → ajak koneksi → keluar', async () => {
    const lomba = createEvent();
    const ayu = person('Ayu Lobi Integrasi');
    const bima = person('Bima Lobi Integrasi');
    const citra = person('Citra Lobi Integrasi');
    registerViaTracker(ayu.id, lomba.id);
    registerViaTracker(bima.id, lomba.id);

    actAs(citra.id);
    expect(await repo.getLobby(citra, lomba.id)).toBeNull();
    await expect(repo.joinLobby(citra, lomba.id, { intent: 'CARI_TIM', note: null })).rejects.toSatisfy((error: unknown) => reasonOf(error) === 'lobby_forbidden');

    actAs(bima.id);
    await repo.joinLobby(bima, lomba.id, { intent: 'CARI_ANGGOTA', note: 'Butuh UI/UX' });

    actAs(ayu.id);
    const before = await repo.getLobby(ayu, lomba.id);
    expect(before).toMatchObject({ me: null, members: [], memberCount: 1, open: true });
    const [summary] = await repo.listMyLobbies(ayu.id);
    expect(summary).toMatchObject({ membership: null, memberCount: 1 });

    await repo.joinLobby(ayu, lomba.id, { intent: 'CARI_TIM', note: 'Bisa backend' });
    const after = await repo.getLobby(ayu, lomba.id);
    expect(after?.me).toMatchObject({ intent: 'CARI_TIM', note: 'Bisa backend', relation: 'self' });
    expect(after?.members).toEqual([expect.objectContaining({ fullName: 'Bima Lobi Integrasi', intent: 'CARI_ANGGOTA', relation: 'none' })]);

    // Bima TIDAK membuka profil di Koneksi; satu lobi cukup untuk disapa.
    expect(await repo.requestConnection(ayu, bima.id, 'Halo dari lobi')).toBe('requested');
    expect((await repo.getLobby(ayu, lomba.id))?.members[0]?.relation).toBe('pending');

    // Ajak teman: hanya koneksi yang diterima.
    sql(`INSERT INTO public.connections (requester_id, addressee_id) VALUES ('${ayu.id}', '${citra.id}')`);
    sql(`UPDATE public.connections SET status = 'ACCEPTED' WHERE requester_id = '${ayu.id}' AND addressee_id = '${citra.id}'`);
    expect((await repo.getLobby(ayu, lomba.id))?.invitable.map((peer) => peer.userId)).toEqual([citra.id]);
    expect(await repo.inviteToLobby(ayu, lomba.id, citra.id)).toBe('invited');
    expect(await repo.inviteToLobby(ayu, lomba.id, citra.id)).toBe('already');
    expect((await repo.getLobby(ayu, lomba.id))?.invited.map((peer) => peer.userId)).toEqual([citra.id]);
    expect(sql(`SELECT count(*) FROM public.notifications WHERE user_id = '${citra.id}' AND type = 'LOBBY_INVITE'`)).toBe('1');

    await repo.leaveLobby(ayu.id, lomba.id);
    expect((await repo.getLobby(ayu, lomba.id))?.me).toBeNull();
    expect((await repo.listMyLobbies(ayu.id))[0]?.memberCount).toBe(1);
  });
});

describe('SupabaseEventRepository — pendataan kinerja', () => {
  it('tulis lewat service_role (jawab & lewati), baca admin dengan judul acara, tanpa identitas', async () => {
    const event = createEvent();
    const answers = { educationLevel: 'SMA_SMK' as const, regionCode: '32.73', institutionId: '001002', institution: 'Universitas Indonesia', answers: { f_sumber: 'TikTok' } };
    await repo.recordOutboundSurvey({ ...answers, eventId: event.id, signedIn: true, skipped: false });
    await repo.recordOutboundSurvey({ ...answers, eventId: event.id, signedIn: false, skipped: true });
    const rows = (await repo.listOutboundSurveys(new Date(Date.now() - 60_000))).filter((row) => row.eventId === event.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => !row.skipped)).toMatchObject({ eventTitle: event.title, eventSlug: event.slug, regionCode: '32.73', institutionId: '001002', answers: { f_sumber: 'TikTok' }, signedIn: true });
    expect(rows.find((row) => row.skipped)).toMatchObject({ educationLevel: null, institution: null, answers: {} });
    expect(sql(`SELECT count(*) FROM information_schema.columns WHERE table_name = 'outbound_surveys' AND column_name = 'user_id'`)).toBe('0');
  });

  it('konfigurasi: bawaan dari migration, simpan admin lewat service_role', async () => {
    const admin = createUser();
    const before = await repo.getOutboundSurveyConfig();
    expect(before.questions.map((field) => field.id)).toEqual(['f_sumber', 'f_rencana']);
    try {
      await repo.saveOutboundSurveyConfig({ askEducation: 'OFF', askRegion: 'REQUIRED', askInstitution: 'OPTIONAL', questions: [] }, admin);
      expect(await repo.getOutboundSurveyConfig()).toMatchObject({ askEducation: 'OFF', askRegion: 'REQUIRED', questions: [] });
    } finally {
      await repo.saveOutboundSurveyConfig(before, admin);
    }
  });
});

describe('SupabaseEventRepository — lencana publik', () => {
  it('privat sampai pemiliknya menyalakan; fakta JSONB dihitung aturan yang sama', async () => {
    const owner = person('Pemilik Lencana Integrasi');
    const reader = person('Pembaca Lencana Integrasi');
    const past = createEvent({ status: 'EXPIRED', deadlineInDays: -5 });
    sql(`INSERT INTO public.event_registrations (code, event_id, user_id, full_name, email, status, reviewed_at)
         VALUES ('SF-${past.id.slice(0, 8).toUpperCase().replace(/[^0-9A-F]/g, '0')}', '${past.id}', '${owner.id}', 'Pemilik', 'p@uji', 'CONFIRMED', now() - interval '20 days')`);
    sql(`INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('${owner.id}', true)`);

    actAs(reader.id);
    expect((await repo.listPublicBadgeFacts(reader.id, [owner.id])).size).toBe(0);

    actAs(owner.id);
    expect(await repo.getBadgeVisibility(owner.id)).toEqual({ show: false, adjustable: true });
    await repo.setBadgeVisibility(owner.id, true);
    expect(await repo.getBadgeVisibility(owner.id)).toEqual({ show: true, adjustable: true });

    actAs(reader.id);
    const facts = (await repo.listPublicBadgeFacts(reader.id, [owner.id])).get(owner.id);
    expect(facts).toBeDefined();
    expect(evaluateBadges(facts!).find((badge) => badge.definition.key === 'kompetitor')?.tier).toBe(1);
  });

  it('sebelum migration 20261108100004: saklar terkunci, lencana privat, menyimpan = kode tertutup', async () => {
    const owner = createUser();
    actAs(owner);
    sql('ALTER TABLE public.users DROP COLUMN show_badges');
    try {
      expect(await repo.getBadgeVisibility(owner)).toEqual({ show: false, adjustable: false });
      await expect(repo.setBadgeVisibility(owner, true)).rejects.toSatisfy((error: unknown) => reasonOf(error) === 'badges_unavailable');
    } finally {
      sql('ALTER TABLE public.users ADD COLUMN show_badges BOOLEAN NOT NULL DEFAULT FALSE');
      sql('GRANT UPDATE (show_badges) ON public.users TO authenticated');
    }
  });
});

describe('SupabaseEventRepository — tempat studi & bidang spesifik (ADR-075/076)', () => {
  it('pemilik menyimpan lewat RLS; pembaca yang boleh melihat menerima kab/kota, bukan kecamatan', async () => {
    const owner = person('Pemilik Studi Integrasi');
    const reader = person('Pembaca Studi Integrasi');

    actAs(owner.id);
    expect(await repo.getStudyProfile(owner.id)).toEqual({ institutionId: null, institutionName: null, domicileCode: null, studyFields: [], available: true });
    await repo.saveStudyPlace(owner.id, { institutionId: '001002', institutionName: 'Universitas Indonesia', domicileCode: '32.76.03' });
    expect(await repo.saveStudyFields(owner.id, ['ui-ux'])).toBe(true);
    expect(await repo.getStudyProfile(owner.id)).toMatchObject({ institutionId: '001002', domicileCode: '32.76.03', studyFields: ['ui-ux'] });

    actAs(reader.id);
    expect((await repo.listPublicStudyProfiles(reader.id, [owner.id])).size).toBe(0);
    sql(`INSERT INTO public.network_profiles (user_id, is_discoverable) VALUES ('${owner.id}', true)`);
    expect((await repo.listPublicStudyProfiles(reader.id, [owner.id])).get(owner.id)).toEqual({
      institutionId: '001002',
      institutionName: 'Universitas Indonesia',
      regionCode: '32.76',
      studyFields: ['ui-ux'],
    });
  });

  it('nilai di luar CHECK = kode tertutup, bukan galat mentah', async () => {
    const owner = createUser();
    actAs(owner);
    await expect(repo.saveStudyPlace(owner, { institutionId: '001002', institutionName: null, domicileCode: null })).rejects.toSatisfy(
      (error: unknown) => reasonOf(error) === 'invalid_study_place',
    );
  });
});
