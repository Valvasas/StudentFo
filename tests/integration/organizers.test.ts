import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { actAs, createEvent, createUser, sql } from './harness';

/**
 * Penyelenggara, klaim, perubahan acara, dan analitik (ADR-042/043) lewat
 * PostgREST sungguhan: embed ber-FK eksplisit, hak per kolom, trigger, dan
 * RPC service_role — hal-hal yang tidak bisa dibuktikan mode seed.
 */
const repo = new SupabaseEventRepository(noCache);

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? (error.reason ?? `tanpa-reason: ${error.message}`) : String(error);
  }
}

const application = (orgName: string) => ({
  orgName,
  website: 'https://himpunan.example',
  evidence: 'Saya ketua himpunan, lihat https://himpunan.example/pengurus',
});

async function verifiedOrganizer(orgName: string): Promise<{ id: string; admin: string }> {
  const id = createUser({ fullName: `Panitia ${orgName}` });
  const admin = createUser({ role: 'ADMIN', fullName: 'Admin Integrasi' });
  actAs(id);
  await repo.applyAsOrganizer({ id, fullName: `Panitia ${orgName}`, email: `${id}@uji` }, application(orgName));
  await repo.reviewOrganizer({ userId: id, decision: 'VERIFIED', reviewerId: admin, note: null });
  return { id, admin };
}

beforeEach(() => actAs(null));

describe('SupabaseEventRepository — penyelenggara', () => {
  it('pengajuan → antrean admin (dengan nama pemohon) → verifikasi; ganti nama = antre ulang', async () => {
    const id = createUser({ fullName: 'Sekar Integrasi' });
    const admin = createUser({ role: 'ADMIN' });
    actAs(id);
    await repo.applyAsOrganizer({ id, fullName: 'Sekar Integrasi', email: 'x@uji' }, application('Himpunan Integrasi'));
    expect(await repo.getOrganizerProfile(id)).toMatchObject({ status: 'PENDING', orgName: 'Himpunan Integrasi' });

    const queue = await repo.listOrganizerApplications('PENDING', 200);
    expect(queue.find((profile) => profile.userId === id)?.applicant?.fullName).toBe('Sekar Integrasi');

    await repo.reviewOrganizer({ userId: id, decision: 'VERIFIED', reviewerId: admin, note: 'Dicek' });
    expect(await reason(repo.reviewOrganizer({ userId: id, decision: 'VERIFIED', reviewerId: admin, note: null }))).toBe(
      'organizer_invalid_transition',
    );
    expect((await repo.getOrganizerProfile(id))?.status).toBe('VERIFIED');
    expect((await repo.listNotifications(id, 10)).some((n) => n.type === 'ORGANIZER_VERIFIED')).toBe(true);

    await repo.applyAsOrganizer({ id, fullName: 'Sekar Integrasi', email: 'x@uji' }, application('Lembaga Lain'));
    expect((await repo.getOrganizerProfile(id))?.status).toBe('PENDING');
    expect((await repo.listOrganizerStatuses([id])).get(id)).toEqual({ orgName: 'Lembaga Lain', status: 'PENDING' });
  });

  it('klaim: hanya yang terverifikasi, satu yang menunggu, disetujui → masuk dasbor & lencana publik', async () => {
    const event = createEvent();
    const stranger = createUser();
    actAs(stranger);
    expect(await reason(repo.claimEvent(stranger, event.id, 'Acara ini milik lembaga kami, lihat tautan'))).toBe('organizer_not_verified');

    const { id, admin } = await verifiedOrganizer('Himpunan Klaim');
    actAs(id);
    await repo.claimEvent(id, event.id, 'Acara ini milik lembaga kami, lihat tautan');
    expect(await reason(repo.claimEvent(id, event.id, 'Acara ini milik lembaga kami, lihat tautan'))).toBe('claim_exists');
    expect(await reason(repo.claimEvent(id, createEvent({ status: 'PENDING' }).id, 'Acara belum tayang tapi punya kami'))).toBe(
      'event_unavailable',
    );

    const claim = (await repo.listClaims('PENDING', 200)).find((entry) => entry.userId === id);
    expect(claim).toMatchObject({ orgName: 'Himpunan Klaim', event: { id: event.id, slug: event.slug } });
    await repo.reviewClaim({ claimId: claim!.id, decision: 'APPROVED', reviewerId: admin, note: null });

    expect((await repo.listManagedEvents(id)).map((entry) => entry.event.id)).toEqual([event.id]);
    expect((await repo.listMyClaims(id))[0]?.status).toBe('APPROVED');
    expect(await reason(repo.claimEvent(id, event.id, 'Acara ini milik lembaga kami, lihat tautan'))).toBe('claim_already_managed');
    actAs(null);
    expect((await repo.listVerifiedOrganizers([event.id])).get(event.id)).toBe('Himpunan Klaim');
  });

  it('perubahan acara: bukan pengelola ditolak; diterapkan admin → halaman publik berubah & tenggat diperpanjang', async () => {
    const event = createEvent({ deadlineInDays: 3 });
    const { id, admin } = await verifiedOrganizer('Himpunan Revisi');
    actAs(id);
    expect(await reason(repo.proposeEventRevision(id, event.id, { description: 'x' }, null))).toBe('not_event_manager');

    sql(`INSERT INTO public.event_managers (event_id, user_id, source) VALUES ('${event.id}', '${id}', 'ADMIN')`);
    const deadlineAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await repo.proposeEventRevision(id, event.id, { description: 'Deskripsi baru integrasi', deadlineAt }, 'Diperpanjang');
    const [mine] = await repo.listEventRevisions(id, event.id);
    expect(mine).toMatchObject({ status: 'PENDING', changes: { description: 'Deskripsi baru integrasi' }, note: 'Diperpanjang' });

    const queued = (await repo.listRevisions('PENDING', 200)).find((revision) => revision.id === mine!.id);
    expect(queued?.orgName).toBe('Himpunan Revisi');
    await repo.reviewRevision({ revisionId: mine!.id, decision: 'APPROVED', reviewerId: admin, note: null });
    expect(await reason(repo.reviewRevision({ revisionId: mine!.id, decision: 'APPROVED', reviewerId: admin, note: null }))).toBe(
      'revision_not_found',
    );

    const detail = await repo.getEventBySlug(event.slug);
    expect(detail?.description).toBe('Deskripsi baru integrasi');
    expect(new Date(detail!.primaryDeadlineAt!).getTime()).toBe(new Date(deadlineAt).getTime());
  });

  it('analitik: kunjungan unik harian; hanya pengelola terverifikasi yang bisa membaca', async () => {
    const event = createEvent();
    const { id } = await verifiedOrganizer('Himpunan Analitik');
    sql(`INSERT INTO public.event_managers (event_id, user_id, source) VALUES ('${event.id}', '${id}', 'ADMIN')`);
    await repo.recordEventView(event.id, 'a'.repeat(64));
    await repo.recordEventView(event.id, 'a'.repeat(64));
    await repo.recordEventView(event.id, 'b'.repeat(64));
    await repo.recordEventView(event.id, 'bukan-hash');

    actAs(id);
    const analytics = await repo.getEventAnalytics(id, event.id, 7);
    expect(analytics.days).toBe(7);
    expect(analytics.series).toHaveLength(7);
    expect(analytics.totals).toMatchObject({ views: 3, visitors: 2 });
    expect(analytics.series.at(-1)).toMatchObject({ views: 3, visitors: 2 });

    const other = createUser();
    actAs(other);
    expect(await reason(repo.getEventAnalytics(other, event.id, 30))).toBe('not_event_manager');
  });
});

describe('SupabaseEventRepository — riwayat acara (ADR-046)', () => {
  it('hanya acara kelolaan yang sudah tutup, angka seumur acara, tertutup setelah dicabut', async () => {
    const { id, admin } = await verifiedOrganizer('Himpunan Riwayat');
    const closed = createEvent({ title: 'Acara Riwayat Selesai', status: 'EXPIRED', deadlineInDays: -30 });
    const open = createEvent({ title: 'Acara Riwayat Buka' });
    for (const event of [closed, open]) {
      sql(`INSERT INTO public.event_managers (event_id, user_id, source) VALUES ('${event.id}', '${id}', 'ADMIN')`);
    }
    const participant = createUser();
    sql(`INSERT INTO public.application_tracker (user_id, event_id, status) VALUES ('${participant}', '${closed.id}', 'ACCEPTED')`);

    actAs(id);
    const history = await repo.listOrganizerHistory(id);
    expect(history.map((entry) => entry.eventId)).toEqual([closed.id]);
    expect(history[0]).toMatchObject({ title: 'Acara Riwayat Selesai', status: 'EXPIRED', applied: 1, views: 0 });

    await repo.reviewOrganizer({ userId: id, decision: 'REVOKED', reviewerId: admin, note: 'Uji cabut' });
    actAs(id);
    expect(await repo.listOrganizerHistory(id)).toEqual([]);
  });
});

