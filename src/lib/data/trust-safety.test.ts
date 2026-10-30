import { beforeEach, describe, expect, it } from 'vitest';
import { CONNECTION_PAGE, type NetworkViewer } from '@/lib/network';
import { AppError } from '@/lib/errors';
import { MemoryEventRepository } from './memory-repository';

/**
 * Cermin perilaku SQL di `supabase/tests/102_trust_and_safety.test.sql`
 * (ADR-061): kedua implementasi harus menolak & mengizinkan hal yang sama.
 */
const ana: NetworkViewer = { id: 'ana', fullName: 'Ana', educationLevel: 'D4_S1', major: null, interests: [] };
const budi: NetworkViewer = { id: 'budi', fullName: 'Budi', educationLevel: 'D3', major: null, interests: [] };

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

describe('MemoryEventRepository — keamanan & kepercayaan', () => {
  let repository: MemoryEventRepository;
  let eventId: string;

  beforeEach(async () => {
    repository = new MemoryEventRepository(new Date('2026-10-31T03:00:00Z'));
    await repository.updateNetworkProfile(ana, { discoverable: true, headline: null });
    await repository.updateNetworkProfile(budi, { discoverable: true, headline: null });
    eventId = (await repository.listByStatus('APPROVED', 1))[0]!.id;
  });

  it('laporan: satu laporan terbuka per pelapor & subjek, subjek harus terlihat', async () => {
    await repository.reportContent('ana', { subjectType: 'event', subjectId: eventId, reason: 'scam', details: 'Minta transfer' });
    await repository.reportContent('ana', { subjectType: 'event', subjectId: eventId, reason: 'misleading', details: null });
    await repository.reportContent('ana', { subjectType: 'user', subjectId: 'budi', reason: 'harassment', details: null });
    expect(await repository.countOpenReports()).toBe(2);

    const [first] = await repository.listOpenReports(10);
    expect(first).toMatchObject({ subjectType: 'event', reason: 'scam', details: 'Minta transfer', reporterName: 'Ana' });
    expect(first!.subjectSlug).toBeTruthy();

    const pending = (await repository.listByStatus('PENDING', 1))[0];
    if (pending) expect(await reason(repository.reportContent('ana', { subjectType: 'event', subjectId: pending.id, reason: 'scam', details: null }))).toBe('report_unavailable');
    expect(await reason(repository.reportContent('ana', { subjectType: 'user', subjectId: 'ana', reason: 'spam', details: null }))).toBe('report_unavailable');
    expect(await reason(repository.reportContent('ana', { subjectType: 'user', subjectId: 'tidak-ada', reason: 'spam', details: null }))).toBe('report_unavailable');
  });

  it('laporan: dibatasi 10 per hari', async () => {
    const events = await repository.listByStatus('APPROVED', 11);
    for (const event of events.slice(0, 10)) {
      await repository.reportContent('ana', { subjectType: 'event', subjectId: event.id, reason: 'spam', details: null });
    }
    expect(await reason(repository.reportContent('ana', { subjectType: 'user', subjectId: 'budi', reason: 'spam', details: null }))).toBe('report_rate_limited');
  });

  it('keputusan laporan tercatat di riwayat dan tidak bisa diputuskan dua kali', async () => {
    await repository.reportContent('ana', { subjectType: 'user', subjectId: 'budi', reason: 'harassment', details: null });
    const [report] = await repository.listOpenReports(10);
    await repository.resolveReport({ reportId: report!.id, actorId: 'admin', actorName: 'Admin', outcome: 'DISMISSED', note: 'Tidak terbukti' });

    expect(await repository.countOpenReports()).toBe(0);
    const [log] = await repository.listModerationLog(1);
    expect(log).toMatchObject({ subjectType: 'report', fromStatus: 'OPEN', toStatus: 'DISMISSED', actorName: 'Admin', reason: 'Tidak terbukti' });
    expect(await reason(repository.resolveReport({ reportId: report!.id, actorId: 'admin', outcome: 'RESOLVED', note: null }))).toBe('report_not_found');
  });

  it('penangguhan: wajib beralasan, keluar dari direktori, tercatat, dan bisa dicabut', async () => {
    expect(await reason(repository.setUserSuspension({ userId: 'budi', actorId: 'admin', suspend: true, reason: 'x' }))).toBe(
      'suspension_reason_required',
    );
    expect(await reason(repository.setUserSuspension({ userId: 'admin', actorId: 'admin', suspend: true, reason: 'diri sendiri' }))).toBe(
      'user_not_found',
    );
    expect(await reason(repository.setUserSuspension({ userId: 'ana', actorId: 'ana', suspend: true, reason: 'diri sendiri' }))).toBe(
      'user_protected',
    );

    await repository.setUserSuspension({ userId: 'budi', actorId: 'admin', actorName: 'Admin', suspend: true, reason: 'Pelecehan berulang' });
    expect(repository.isSuspended('budi')).toBe(true);
    expect((await repository.getNetworkProfile('budi')).discoverable).toBe(false);
    expect((await repository.searchUsers('budi', 10))[0]).toMatchObject({ suspensionReason: 'Pelecehan berulang' });

    await repository.setUserSuspension({ userId: 'budi', actorId: 'admin', actorName: 'Admin', suspend: false, reason: null });
    expect(repository.isSuspended('budi')).toBe(false);
    const log = await repository.listModerationLog(2);
    expect(log.map((entry) => entry.toStatus)).toEqual(['ACTIVE', 'SUSPENDED']);
  });

  it('hapus akun: data milik akun hilang, jejak bersama tanpa tautan, admin tercatat tanpa nama pemilik', async () => {
    await repository.saveEvent('budi', eventId);
    await repository.requestConnection(budi, 'ana', 'Halo');
    await repository.reportContent('budi', { subjectType: 'user', subjectId: 'ana', reason: 'spam', details: null });

    await repository.deleteAccount({ userId: 'budi', actorId: 'admin', actorName: 'Admin', reason: 'Permintaan email' });

    expect(await repository.listSavedEventIds('budi')).toEqual([]);
    expect((await repository.listConnections('ana', { limit: CONNECTION_PAGE.maxLimit, cursor: null })).items).toEqual([]);
    expect(await repository.searchUsers('budi', 10)).toEqual([]);
    expect((await repository.listOpenReports(10))[0]).toMatchObject({ subjectLabel: 'Ana', reporterName: null });
    const [log] = await repository.listModerationLog(1);
    expect(log).toMatchObject({ subjectType: 'user', title: 'Akun dihapus', toStatus: 'DELETED', reason: 'Permintaan email' });
    expect(await reason(repository.deleteAccount({ userId: 'budi', actorId: 'admin', reason: null }))).toBe('user_not_found');
  });

  it('hapus mandiri tidak dicatat sebagai tindakan moderasi', async () => {
    const before = (await repository.listModerationLog(100)).length;
    await repository.deleteAccount({ userId: 'ana', actorId: 'ana', reason: null });
    expect((await repository.listModerationLog(100)).length).toBe(before);
    expect((await repository.getNetworkProfile('ana')).discoverable).toBe(false);
  });
});
