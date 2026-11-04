import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { noCache } from '@/lib/data/cache';
import type { EventActor } from '@/lib/data/repository';
import { SupabaseEventRepository } from '@/lib/data/supabase-repository';
import { actAs, createEvent, createUser, sql } from './harness';

/**
 * Tanya-jawab kegiatan (ADR-062 #7) lewat PostgREST sungguhan: RPC DEFINER,
 * nama depan saja, hak menjawab dari `manages_event()`/`is_admin()` (aal2),
 * laporan & sembunyikan. Cermin `src/lib/data/event-questions.test.ts`.
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

const actor = (id: string): EventActor => ({ id, fullName: id, email: `${id}@uji`, isAdmin: false });

function verifiedManager(eventId: string): string {
  const id = createUser({ fullName: 'Panitia Tanya' });
  sql(`INSERT INTO public.organizer_profiles (user_id, org_name, evidence) VALUES ('${id}', 'Org Tanya', 'Ketua panitia, https://q.example')`);
  sql(`SELECT public.review_organizer('${id}', 'VERIFIED', NULL, NULL)`);
  sql(`INSERT INTO public.event_managers (event_id, user_id, source) VALUES ('${eventId}', '${id}', 'ADMIN')`);
  return id;
}

beforeEach(() => actAs(null));

describe('SupabaseEventRepository — tanya jawab kegiatan', () => {
  it('tanya → nama depan publik → dijawab pengelola/admin aal2 → kedua pihak dikabari', async () => {
    const event = createEvent({ title: 'Lomba Tanya Integrasi' });
    const manager = verifiedManager(event.id);
    const asker = createUser({ fullName: 'Sinta Ayu Lestari' });
    const other = createUser({ fullName: 'Orang Lain' });
    const admin = createUser({ role: 'ADMIN' });

    expect(await reason(repo.askEventQuestion({ id: asker, fullName: 'x' }, event.id, 'Apakah boleh tim lintas kampus?'))).toBe(
      'tanpa-reason: Gagal mengirim pertanyaan.',
    );
    actAs(asker);
    expect(await reason(repo.askEventQuestion({ id: asker, fullName: 'x' }, event.id, 'pendek'))).toBe('invalid_question');
    await repo.askEventQuestion({ id: asker, fullName: 'x' }, event.id, 'Apakah boleh tim lintas kampus?');
    await repo.askEventQuestion({ id: asker, fullName: 'x' }, event.id, 'Berapa anggota maksimal satu tim?');
    const mine = await repo.listEventQuestions(event.id, asker, 50);
    expect(mine.map((q) => [q.authorFirstName, q.isMine])).toEqual([
      ['Sinta', true],
      ['Sinta', true],
    ]);

    actAs(null);
    const publicView = await repo.listEventQuestions(event.id, null, 50);
    expect(publicView.every((q) => !q.isMine && q.authorFirstName === 'Sinta')).toBe(true);
    expect(sql(`SELECT count(*) FROM notifications WHERE user_id = '${manager}' AND type = 'QUESTION_ASKED'`)).toBe('1');

    const [latest, first] = publicView;
    actAs(other);
    expect(await reason(repo.answerEventQuestion(actor(other), first!.id, 'Boleh, saya jamin.'))).toBe('question_forbidden');
    actAs(manager);
    await repo.answerEventQuestion(actor(manager), first!.id, 'Boleh, maksimal tiga orang.');
    actAs(admin);
    expect(await reason(repo.answerEventQuestion(actor(admin), latest!.id, 'Tanpa MFA'))).toBe('question_forbidden');
    actAs(admin, 'aal2');
    await repo.answerEventQuestion(actor(admin), latest!.id, 'Lihat buku panduan bagian 3.');

    actAs(null);
    expect((await repo.listEventQuestions(event.id, null, 50)).map((q) => q.answeredAs)).toEqual(['moderator', 'organizer']);
    expect(sql(`SELECT count(*) FROM notifications WHERE user_id = '${asker}' AND type = 'QUESTION_ANSWERED'`)).toBe('1');

    // Ekspor data akun: milik sendiri saja.
    actAs(asker);
    expect((await repo.listMyEventQuestions(asker)).map((q) => [q.eventSlug, q.answer !== null])).toEqual([
      [event.slug, true],
      [event.slug, true],
    ]);
    actAs(other);
    expect(await repo.listMyEventQuestions(other)).toEqual([]);
  });

  it('lapor → konteks untuk /laporkan & antrean → sembunyikan → hilang; hapus hanya oleh penanya', async () => {
    const event = createEvent({ title: 'Lomba Lapor Pertanyaan' });
    const asker = createUser({ fullName: 'Budi' });
    const reporter = createUser({ fullName: 'Pelapor' });
    const admin = createUser({ role: 'ADMIN' });
    actAs(asker);
    await repo.askEventQuestion({ id: asker, fullName: 'Budi' }, event.id, 'Iklan: jasa joki lomba murah!');
    const [spam] = await repo.listEventQuestions(event.id, asker, 50);
    expect(await reason(repo.reportContent(asker, { subjectType: 'question', subjectId: spam!.id, reason: 'spam', details: null }))).toBe(
      'report_unavailable',
    );

    actAs(reporter);
    await repo.reportContent(reporter, { subjectType: 'question', subjectId: spam!.id, reason: 'spam', details: null });
    expect(await reason(repo.deleteEventQuestion(reporter, spam!.id))).toBe('question_not_found');
    actAs(null);
    expect(await repo.getEventQuestionContext(spam!.id)).toEqual({
      id: spam!.id,
      excerpt: 'Iklan: jasa joki lomba murah!',
      eventSlug: event.slug,
      eventTitle: 'Lomba Lapor Pertanyaan',
    });
    const report = (await repo.listOpenReports(500)).find((item) => item.subjectId === spam!.id);
    expect(report).toMatchObject({ subjectType: 'question', subjectLabel: 'Iklan: jasa joki lomba murah!', subjectSlug: event.slug });

    await repo.hideEventQuestion({ questionId: spam!.id, actorId: admin, reason: 'Spam' });
    await repo.resolveReport({ reportId: report!.id, actorId: admin, outcome: 'RESOLVED', note: null });
    expect(await repo.listEventQuestions(event.id, null, 50)).toEqual([]);
    expect(await repo.getEventQuestionContext(spam!.id)).toBeNull();
    expect(await reason(repo.hideEventQuestion({ questionId: spam!.id, actorId: admin, reason: null }))).toBe('question_not_found');
    expect((await repo.listOpenReports(500)).find((item) => item.subjectId === spam!.id)).toBeUndefined();

    actAs(asker);
    await repo.askEventQuestion({ id: asker, fullName: 'Budi' }, event.id, 'Maaf, pertanyaan yang benar: kapan final?');
    const [own] = await repo.listEventQuestions(event.id, asker, 50);
    await repo.deleteEventQuestion(asker, own!.id);
    expect(await repo.listEventQuestions(event.id, asker, 50)).toEqual([]);
  });
});
