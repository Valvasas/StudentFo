import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { NetworkViewer } from '@/lib/network';
import type { PortfolioInput } from '@/lib/portfolio';
import { MemoryEventRepository } from './memory-repository';
import { SEED_EVENTS } from './seed-data';

/**
 * Cermin supabase/tests/99_portfolio_history.test.sql di mode seed: kedua
 * implementasi harus sepakat soal siapa melihat apa (ADR-046).
 */
const ana: NetworkViewer = { id: 'ana', fullName: 'Ana', educationLevel: 'D4_S1', major: 'DKV', interests: ['desain'] };
const budi: NetworkViewer = { id: 'budi', fullName: 'Budi', educationLevel: 'D3', major: null, interests: [] };

const idOf = (slug: string) => {
  const event = SEED_EVENTS.find((seed) => seed.slug === slug);
  if (!event) throw new Error(`seed ${slug} tidak ada`);
  return event.id;
};
const OPEN_LOMBA = idOf('kompetisi-inovasi-perangkat-lunak-nusantara-2026');
const OPEN_BEASISWA = idOf('beasiswa-unggulan-bakti-pendidikan-2026');
const PAST_LOMBA = idOf('lomba-desain-ui-ux-nasional-edisi-lalu');
const PENDING_EVENT = idOf('seminar-nasional-teknologi-pangan-menunggu-review');

const input = (overrides: Partial<PortfolioInput> = {}): PortfolioInput => ({
  achievement: null,
  achievementNote: null,
  proofUrl: null,
  visible: true,
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

describe('MemoryEventRepository — portofolio', () => {
  let repository: MemoryEventRepository;
  const titlesSeenBy = async (viewerId: string, ownerId: string) =>
    (await repository.getPublicProfile(viewerId, ownerId))?.portfolio.map((entry) => entry.title) ?? null;

  beforeEach(async () => {
    repository = new MemoryEventRepository(new Date('2026-09-27T03:00:00Z'));
    await repository.updateNetworkProfile(ana, { discoverable: true, headline: 'Desainer' });
    await repository.updateNetworkProfile(budi, { discoverable: false, headline: null });
  });

  it('"Sudah daftar" otomatis masuk portofolio; "Disimpan" tidak', async () => {
    await repository.upsertTrackerItem('ana', OPEN_LOMBA, 'SAVED');
    expect(await titlesSeenBy('budi', 'ana')).toEqual([]);
    await repository.upsertTrackerItem('ana', OPEN_LOMBA, 'APPLIED');
    expect(await titlesSeenBy('budi', 'ana')).toEqual(['Kompetisi Inovasi Perangkat Lunak Nusantara 2026']);
  });

  it('hasil hanya untuk entri APPLIED+, termasuk acara yang sudah selesai', async () => {
    await repository.upsertTrackerItem('ana', OPEN_LOMBA, 'SAVED');
    expect(await reason(repository.updatePortfolioEntry('ana', OPEN_LOMBA, input({ achievement: 'JUARA_1' })))).toBe('portfolio_not_eligible');
    expect(await reason(repository.updatePortfolioEntry('ana', 'tidak-ada', input()))).toBe('portfolio_not_eligible');

    repository.seedDemoPortfolio('ana');
    await repository.updatePortfolioEntry('ana', PAST_LOMBA, input({ achievement: 'JUARA_1', achievementNote: 'Kategori utama' }));
    const entry = (await repository.getPublicProfile('budi', 'ana'))?.portfolio.find((item) => item.eventId === PAST_LOMBA);
    expect(entry).toMatchObject({ achievement: 'JUARA_1', achievementNote: 'Kategori utama', status: 'ACCEPTED' });
  });

  it('beasiswa privat bawaan, bisa ditampilkan; "Ditolak" tidak pernah tampil', async () => {
    await repository.upsertTrackerItem('ana', OPEN_BEASISWA, 'APPLIED');
    expect(await titlesSeenBy('budi', 'ana')).toEqual([]);
    await repository.updatePortfolioEntry('ana', OPEN_BEASISWA, input({ visible: true }));
    expect(await titlesSeenBy('budi', 'ana')).toEqual(['Beasiswa Unggulan Bakti Pendidikan 2026']);

    await repository.upsertTrackerItem('ana', OPEN_BEASISWA, 'REJECTED');
    expect(await titlesSeenBy('budi', 'ana')).toEqual([]);
  });

  it('aturan kelihatan = jaringan: tersembunyi tertutup, ajakan membuka, blokir menutup', async () => {
    await repository.upsertTrackerItem('budi', OPEN_LOMBA, 'APPLIED');
    expect(await repository.getPublicProfile('ana', 'budi')).toBeNull();

    await repository.requestConnection(budi, 'ana', null);
    const seenByAna = await repository.getPublicProfile('ana', 'budi');
    expect(seenByAna?.relation).toBe('incoming');
    expect(seenByAna?.portfolio).toHaveLength(1);
    expect((await repository.getPublicProfile('budi', 'ana'))?.relation).toBe('outgoing');

    await repository.blockPerson('ana', 'budi');
    expect(await repository.getPublicProfile('ana', 'budi')).toBeNull();
    // Ana tetap bisa ditemukan orang lain, tapi tidak oleh yang ia blokir.
    expect(await repository.getPublicProfile('budi', 'ana')).toBeNull();
    expect(await repository.getPublicProfile('orang-lain', 'ana')).not.toBeNull();
  });

  it('pemilik melihat relasi "self"', async () => {
    expect((await repository.getPublicProfile('ana', 'ana'))?.relation).toBe('self');
  });
});

describe('MemoryEventRepository — riwayat penyelenggara', () => {
  const org = { id: 'org', fullName: 'Sekar', email: 'org@contoh.example' };

  it('hanya acara kelolaan yang sudah tutup, dan hanya selama terverifikasi', async () => {
    const repository = new MemoryEventRepository(new Date('2026-09-27T03:00:00Z'));
    repository.seedDemoOrganizer(org, new Date('2026-09-27T03:00:00Z'));
    repository.seedDemoPortfolio('ana');

    const history = await repository.listOrganizerHistory('org', new Date('2026-09-27T03:00:00Z'));
    expect(history.map((entry) => entry.title)).toEqual(['Lomba Desain UI/UX Nasional']);
    // Rani & Citra (SEED_PORTFOLIO) + Ana = 3 pendaftar tercatat.
    expect(history[0]).toMatchObject({ status: 'EXPIRED', applied: 3 });
    expect(history[0]!.views).toBeGreaterThan(0);

    expect(await repository.listOrganizerHistory('ana')).toEqual([]);
    await repository.reviewOrganizer({ userId: 'org', decision: 'REVOKED', reviewerId: 'admin', reviewerName: 'Admin', note: 'uji' });
    expect(await repository.listOrganizerHistory('org')).toEqual([]);
  });

  it('masuk demo berulang tidak melipatgandakan simpan & klik', async () => {
    const now = new Date('2026-09-27T03:00:00Z');
    const repository = new MemoryEventRepository(now);
    repository.seedDemoOrganizer(org, now);
    const [first] = await repository.listOrganizerHistory('org', now);
    repository.seedDemoOrganizer(org, now);
    const [second] = await repository.listOrganizerHistory('org', now);
    expect(first!.clicks).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });
});

describe('MemoryEventRepository — pemulihan moderasi', () => {
  it('tolak → pulihkan: kembali PENDING, tercatat, dan tidak bisa dua kali', async () => {
    const repository = new MemoryEventRepository(new Date('2026-09-27T03:00:00Z'));
    await repository.reviewEvent({ eventId: PENDING_EVENT, decision: 'REJECTED', reviewerId: 'admin', reviewerName: 'Admin' });
    expect((await repository.listByStatus('PENDING', 50)).some((event) => event.id === PENDING_EVENT)).toBe(false);

    await repository.restoreRejected({ subjectType: 'event', subjectId: PENDING_EVENT, reviewerId: 'admin', reviewerName: 'Admin' });
    expect((await repository.listByStatus('PENDING', 50)).some((event) => event.id === PENDING_EVENT)).toBe(true);
    const [latest] = await repository.listModerationLog(1);
    expect(latest).toMatchObject({ subjectId: PENDING_EVENT, fromStatus: 'REJECTED', toStatus: 'PENDING', actorName: 'Admin' });

    expect(await reason(repository.restoreRejected({ subjectType: 'event', subjectId: PENDING_EVENT, reviewerId: 'admin' }))).toBe('moderation_not_rejected');
    expect(await reason(repository.restoreRejected({ subjectType: 'submission', subjectId: 'tidak-ada', reviewerId: 'admin' }))).toBe('moderation_not_rejected');
  });
});

describe('MemoryEventRepository — konfirmasi hasil (ADR-047)', () => {
  const now = new Date('2026-09-27T03:00:00Z');
  const org = { id: 'org', fullName: 'Sekar', email: 'org@contoh.example' };
  let repository: MemoryEventRepository;

  const pendingFor = async (organizerId: string) => repository.listPendingVerifications(organizerId);
  const statusOf = async (userId: string, eventId: string) =>
    (await repository.listMyVerifications(userId)).find((entry) => entry.eventId === eventId)?.status ?? null;

  beforeEach(async () => {
    repository = new MemoryEventRepository(now);
    repository.seedDemoOrganizer(org, now);
    repository.seedDemoPortfolio('ana');
    await repository.updateNetworkProfile(ana, { discoverable: true, headline: null });
  });

  it('data contoh: profil Rani sudah bertanda terverifikasi, permintaan Citra menunggu', async () => {
    const rani = await repository.getPublicProfile('ana', 'seed-user-1');
    expect(rani?.portfolio.find((entry) => entry.eventId === PAST_LOMBA)?.verifiedBy).toBe('Himpunan Mahasiswa Informatika Nusantara');
    expect((await pendingFor('org')).map((entry) => entry.fullName)).toContain('Citra Lestari');
  });

  it('minta → penyelenggara dikabari → konfirmasi → lencana publik & kabar ke peserta', async () => {
    await repository.requestResultVerification(ana, PAST_LOMBA);
    await repository.requestResultVerification(ana, PAST_LOMBA);
    expect(await statusOf('ana', PAST_LOMBA)).toBe('PENDING');
    expect((await repository.listNotifications('org', 20)).filter((n) => n.type === 'VERIFICATION_REQUESTED')).toHaveLength(1);

    const request = (await pendingFor('org')).find((entry) => entry.userId === 'ana');
    expect(request).toMatchObject({ fullName: 'Ana', achievement: 'JUARA_3', proofUrl: 'https://example.org/sertifikat/lomba-desain-ui-ux' });

    expect(
      await reason(repository.reviewResultVerification('org', { userId: 'ana', eventId: PAST_LOMBA, requestedAt: '2000-01-01T00:00:00.000Z', decision: 'VERIFIED', note: null })),
    ).toBe('verification_not_pending');
    await repository.reviewResultVerification('org', { userId: 'ana', eventId: PAST_LOMBA, requestedAt: request!.requestedAt, decision: 'VERIFIED', note: 'abaikan' });

    expect(await statusOf('ana', PAST_LOMBA)).toBe('VERIFIED');
    expect((await repository.getPublicProfile('budi', 'ana'))?.portfolio.find((entry) => entry.eventId === PAST_LOMBA)?.verifiedBy).toBe(
      'Himpunan Mahasiswa Informatika (contoh)',
    );
    const [notification] = (await repository.listNotifications('ana', 50)).filter((n) => n.type === 'RESULT_VERIFIED');
    expect(notification?.event?.slug).toBe('lomba-desain-ui-ux-nasional-edisi-lalu');
  });

  it('mengubah hasil menggugurkan; ditolak tidak bisa diminta ulang sebelum diperbaiki', async () => {
    await repository.requestResultVerification(ana, PAST_LOMBA);
    const request = (await pendingFor('org')).find((entry) => entry.userId === 'ana')!;
    await repository.reviewResultVerification('org', { userId: 'ana', eventId: PAST_LOMBA, requestedAt: request.requestedAt, decision: 'DECLINED', note: '  Nama tidak ada di daftar pemenang.  ' });
    expect((await repository.listMyVerifications('ana'))[0]).toMatchObject({ status: 'DECLINED', reviewNote: 'Nama tidak ada di daftar pemenang.' });
    expect(await reason(repository.requestResultVerification(ana, PAST_LOMBA))).toBe('verification_declined');

    // Visibilitas saja tidak menggugurkan; isi yang berubah menggugurkan.
    const current = { achievement: 'JUARA_3' as const, achievementNote: 'Kategori aplikasi layanan publik', proofUrl: 'https://example.org/sertifikat/lomba-desain-ui-ux' };
    await repository.updatePortfolioEntry('ana', PAST_LOMBA, input({ ...current, visible: false }));
    expect(await statusOf('ana', PAST_LOMBA)).toBe('DECLINED');
    await repository.updatePortfolioEntry('ana', PAST_LOMBA, input({ ...current, achievement: 'FINALIS' }));
    expect(await statusOf('ana', PAST_LOMBA)).toBeNull();
    await repository.requestResultVerification(ana, PAST_LOMBA);
    await repository.cancelResultVerification('ana', PAST_LOMBA);
    expect(await statusOf('ana', PAST_LOMBA)).toBeNull();
  });

  it('syarat: hasil terisi, ada penyelenggara lain, bukan diri sendiri, bukan pengelola lain', async () => {
    await repository.upsertTrackerItem('ana', OPEN_LOMBA, 'APPLIED');
    expect(await reason(repository.requestResultVerification(ana, OPEN_LOMBA))).toBe('verification_not_eligible');
    // Acara tanpa pengelola terverifikasi: tidak ada yang bisa mengonfirmasi.
    const unmanaged = idOf('lomba-karya-tulis-ilmiah-energi-terbarukan');
    await repository.upsertTrackerItem('ana', unmanaged, 'ACCEPTED');
    await repository.updatePortfolioEntry('ana', unmanaged, input({ achievement: 'FINALIS' }));
    expect(await reason(repository.requestResultVerification(ana, unmanaged))).toBe('verification_unavailable');

    await repository.requestResultVerification(ana, PAST_LOMBA);
    const request = (await pendingFor('org')).find((entry) => entry.userId === 'ana')!;
    expect(await pendingFor('ana')).toEqual([]);
    expect(
      await reason(repository.reviewResultVerification('ana', { userId: 'ana', eventId: PAST_LOMBA, requestedAt: request.requestedAt, decision: 'VERIFIED', note: null })),
    ).toBe('not_event_manager');
  });

  it('penyelenggara dicabut → keputusannya gugur', async () => {
    await repository.requestResultVerification(ana, PAST_LOMBA);
    const request = (await pendingFor('org')).find((entry) => entry.userId === 'ana')!;
    await repository.reviewResultVerification('org', { userId: 'ana', eventId: PAST_LOMBA, requestedAt: request.requestedAt, decision: 'VERIFIED', note: null });
    await repository.reviewOrganizer({ userId: 'org', decision: 'REVOKED', reviewerId: 'admin', reviewerName: 'Admin', note: 'uji' });
    expect(await statusOf('ana', PAST_LOMBA)).toBeNull();
    expect(await statusOf('seed-user-1', PAST_LOMBA)).toBe('VERIFIED');
  });
});
