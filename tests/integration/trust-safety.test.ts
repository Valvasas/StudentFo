import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { reportOutcomeMessage } from '@/lib/trust-safety';
import { actAs, createEvent, createUser, sql } from './harness';

/**
 * Laporan, penangguhan, dan hapus akun (ADR-061) lewat PostgREST sungguhan:
 * RPC DEFINER, klien pengguna vs klien admin, dan pemetaan galat SQL → kode.
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

beforeEach(() => actAs(null));

describe('SupabaseEventRepository — keamanan & kepercayaan', () => {
  it('melapor sebagai pengguna; antrean admin memuat judul, nama, dan pelapor', async () => {
    const reporter = createUser({ fullName: 'Pelapor Integrasi' });
    const target = createUser({ fullName: 'Terlapor Integrasi' });
    const event = createEvent({ title: 'Lomba Dilaporkan Integrasi' });

    actAs(reporter);
    await repo.reportContent(reporter, { subjectType: 'event', subjectId: event.id, reason: 'scam', details: 'Minta transfer' });
    await repo.reportContent(reporter, { subjectType: 'event', subjectId: event.id, reason: 'scam', details: null });
    await repo.reportContent(reporter, { subjectType: 'user', subjectId: target, reason: 'harassment', details: null });
    expect(await reason(repo.reportContent(reporter, { subjectType: 'user', subjectId: reporter, reason: 'spam', details: null }))).toBe(
      'report_unavailable',
    );
    actAs(null);
    expect(await reason(repo.reportContent(reporter, { subjectType: 'event', subjectId: event.id, reason: 'scam', details: null }))).toBe(
      'tanpa-reason: Gagal mengirim laporan.',
    );

    const mine = (await repo.listOpenReports(500)).filter((report) => report.reporterName === 'Pelapor Integrasi');
    expect(mine).toHaveLength(2);
    expect(mine.find((report) => report.subjectType === 'event')).toMatchObject({
      subjectLabel: 'Lomba Dilaporkan Integrasi',
      subjectSlug: event.slug,
      details: 'Minta transfer',
    });
    expect(mine.find((report) => report.subjectType === 'user')).toMatchObject({ subjectLabel: 'Terlapor Integrasi', subjectSlug: null });
    expect(await repo.countOpenReports()).toBeGreaterThanOrEqual(2);

    const admin = createUser({ role: 'ADMIN' });
    await repo.resolveReport({ reportId: mine[0]!.id, actorId: admin, outcome: 'RESOLVED', note: 'Ditindak' });
    expect(await reason(repo.resolveReport({ reportId: mine[0]!.id, actorId: admin, outcome: 'DISMISSED', note: null }))).toBe('report_not_found');
  });

  it('cari pengguna, tangguhkan (GoTrue ikut menolak), cabut; admin terlindungi', async () => {
    const admin = createUser({ role: 'ADMIN', fullName: 'Admin Integrasi' });
    const target = createUser({ fullName: 'Zainab Tangguh Integrasi' });

    expect((await repo.searchUsers('Tangguh Integrasi', 10)).map((user) => user.id)).toContain(target);
    expect((await repo.searchUsers(target, 10)).map((user) => user.id)).toEqual([target]);
    // Karakter filter PostgREST dinetralkan, bukan memecah query.
    expect(await repo.searchUsers('a,role.eq.ADMIN)', 10)).toBeInstanceOf(Array);

    expect(await reason(repo.setUserSuspension({ userId: target, actorId: admin, suspend: true, reason: 'x' }))).toBe('suspension_reason_required');
    expect(await reason(repo.setUserSuspension({ userId: admin, actorId: admin, suspend: true, reason: 'tidak boleh' }))).toBe('user_protected');

    await repo.setUserSuspension({ userId: target, actorId: admin, suspend: true, reason: 'Spam ajakan berulang' });
    const [found] = await repo.searchUsers(target, 1);
    expect(found).toMatchObject({ suspensionReason: 'Spam ajakan berulang' });
    expect(found!.suspendedAt).not.toBeNull();
    expect(sql(`SELECT banned_until > now() + interval '99 years' AND isfinite(banned_until) FROM auth.users WHERE id = '${target}'`)).toBe('t');

    await repo.setUserSuspension({ userId: target, actorId: admin, suspend: false, reason: null });
    expect((await repo.searchUsers(target, 1))[0]!.suspendedAt).toBeNull();
  });

  it('hapus akun: cascade lewat RPC, pemanggilan kedua memberi user_not_found', async () => {
    const admin = createUser({ role: 'ADMIN' });
    const target = createUser({ fullName: 'Pamit Integrasi' });
    const event = createEvent();
    sql(`INSERT INTO public.saved_events (user_id, event_id) VALUES ('${target}', '${event.id}')`);

    await repo.deleteAccount({ userId: target, actorId: admin, reason: 'Permintaan email' });

    expect(sql(`SELECT count(*) FROM public.users WHERE id = '${target}'`)).toBe('0');
    expect(sql(`SELECT count(*) FROM public.saved_events WHERE user_id = '${target}'`)).toBe('0');
    expect(sql(`SELECT title FROM public.moderation_log WHERE subject_id = '${target}' AND to_status = 'DELETED'`)).toBe('Akun dihapus');
    expect(await reason(repo.deleteAccount({ userId: target, actorId: admin, reason: null }))).toBe('user_not_found');
    expect(await reason(repo.deleteAccount({ userId: admin, actorId: admin, reason: null }))).toBe('user_protected');
  });

  it('hasil laporan sampai ke setiap pelapor — teksnya identik dengan mode demo', async () => {
    const [a, b] = [createUser(), createUser()];
    const title = `Lomba Hasil Laporan ${'😀'.repeat(130)}`;
    const event = createEvent({ title });
    for (const reporter of [a, b]) {
      actAs(reporter);
      await repo.reportContent(reporter, { subjectType: 'event', subjectId: event.id, reason: 'scam', details: null });
    }
    actAs(null);
    const admin = createUser({ role: 'ADMIN' });
    const first = (await repo.listOpenReports(500)).find((report) => report.subjectId === event.id)!;
    await repo.resolveReport({ reportId: first.id, actorId: admin, outcome: 'RESOLVED', note: 'Catatan internal' });

    expect(sql(`SELECT count(*) FROM public.content_reports WHERE subject_id = '${event.id}' AND status = 'OPEN'`)).toBe('0');
    for (const reporter of [a, b]) {
      actAs(reporter);
      const outcomes = (await repo.listNotifications(reporter, 20)).filter((n) => n.type === 'REPORT_RESOLVED');
      // Judul dipotong per code point di kedua sisi (`left()` vs Array.from) — emoji tidak terbelah.
      expect(outcomes.map((n) => n.message)).toEqual([reportOutcomeMessage('RESOLVED', 'event', title)]);
      expect(outcomes[0]!.event).toBeNull();
    }
  });

  it('status job terjadwal: database tanpa pg_cron = null ("tidak tersedia"), bukan daftar kosong yang terbaca "sehat"', async () => {
    expect(sql(`SELECT count(*) FROM pg_extension WHERE extname = 'pg_cron'`)).toBe('0');
    expect(await repo.cronJobHealth()).toBeNull();

    // Skema `cron` tiruan (kolom yang dibaca fungsi saja): membuktikan pemetaan
    // baris → tipe lewat PostgREST tanpa menyalakan pg_cron di database ini.
    sql(`CREATE SCHEMA cron;
         CREATE TABLE cron.job (jobid BIGINT PRIMARY KEY, jobname TEXT, schedule TEXT, active BOOLEAN);
         CREATE TABLE cron.job_run_details (jobid BIGINT, status TEXT, return_message TEXT, start_time TIMESTAMPTZ);
         INSERT INTO cron.job VALUES (1, 'studentfo-expire-past-events', '5 17 * * *', true), (2, 'milik-orang-lain', '* * * * *', true);
         INSERT INTO cron.job_run_details VALUES (1, 'failed', 'ERROR: relation x', now() - interval '30 hours'), (2, 'failed', 'bukan urusan kita', now());`);
    try {
      expect(await repo.cronJobHealth()).toEqual([
        {
          jobName: 'studentfo-expire-past-events',
          schedule: '5 17 * * *',
          active: true,
          lastStartedAt: expect.any(String),
          lastStatus: 'failed',
          lastMessage: 'ERROR: relation x',
          runs7d: 1,
          failures7d: 1,
          overdue: true,
        },
      ]);
    } finally {
      sql('DROP SCHEMA cron CASCADE');
    }
  });

  it('alasan penolakan kiriman sampai ke pengirim', async () => {
    const owner = createUser();
    const admin = createUser({ role: 'ADMIN' });
    const id = randomUUID();
    sql(`INSERT INTO public.ugc_submissions (id, submitted_by_email, submitted_by, payload)
         VALUES ('${id}', 'k@uji.example', '${owner}', '{"title":"Kiriman Beralasan Integrasi"}')`);
    await repo.reviewSubmission({ submissionId: id, decision: 'REJECTED', reviewerId: admin, reason: 'Tautan resmi tidak bisa dibuka' });

    const [mine] = await repo.listMySubmissions(owner, 5);
    expect(mine).toMatchObject({ status: 'REJECTED', rejectionReason: 'Tautan resmi tidak bisa dibuka' });
  });
});
