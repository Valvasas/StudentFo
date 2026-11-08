import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { EventActor } from './repository';
import { MemoryEventRepository } from './memory-repository';

/** Cermin `supabase/tests/107_event_questions.test.sql` (ADR-062 #7). */
async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.reason : String(error);
  }
}

const actor = (id: string, isAdmin = false): EventActor => ({ id, fullName: id, email: `${id}@demo`, isAdmin });

describe('MemoryEventRepository — tanya jawab kegiatan', () => {
  let repository: MemoryEventRepository;
  let eventId: string;

  beforeEach(async () => {
    repository = new MemoryEventRepository();
    repository.seedDemoOrganizer({ id: 'org', fullName: 'Sekar Ayu', email: 'org@demo' });
    eventId = (await repository.listManagedEvents('org'))[0]!.event.id;
  });

  it('bertanya: nama depan saja, milik sendiri dikenali, batas panjang & 5 per hari', async () => {
    await repository.askEventQuestion({ id: 'sinta', fullName: 'Sinta Ayu Lestari' }, eventId, 'Apakah boleh tim lintas kampus?');
    const [question] = await repository.listEventQuestions(eventId, 'sinta', 50);
    expect(question).toMatchObject({ authorFirstName: 'Sinta', isMine: true, answer: null, answeredAs: null });
    expect((await repository.listEventQuestions(eventId, null, 50))[0]!.isMine).toBe(false);

    expect(await reason(repository.askEventQuestion({ id: 'sinta', fullName: 'Sinta' }, eventId, 'pendek'))).toBe('invalid_question');
    for (let i = 1; i <= 4; i += 1) await repository.askEventQuestion({ id: 'sinta', fullName: 'Sinta' }, eventId, `Pertanyaan tambahan ${i}?`);
    expect(await reason(repository.askEventQuestion({ id: 'sinta', fullName: 'Sinta' }, eventId, 'Pertanyaan keenam?'))).toBe('question_rate_limited');
  });

  it('kegiatan yang tidak tayang tidak menerima pertanyaan', async () => {
    const pending = (await repository.listByStatus('PENDING', 1))[0];
    if (pending) expect(await reason(repository.askEventQuestion({ id: 'a', fullName: 'A' }, pending.id, 'Kapan pengumumannya?'))).toBe('question_unavailable');
    expect(await reason(repository.askEventQuestion({ id: 'a', fullName: 'A' }, 'tidak-ada', 'Kapan pengumumannya?'))).toBe('question_unavailable');
  });

  it('menjawab: hanya pengelola terverifikasi (penyelenggara) atau admin (moderator); kedua pihak dikabari', async () => {
    await repository.askEventQuestion({ id: 'sinta', fullName: 'Sinta' }, eventId, 'Apakah boleh tim lintas kampus?');
    const notifiedOrg = (await repository.listNotifications('org', 50)).filter((n) => n.type === 'QUESTION_ASKED');
    expect(notifiedOrg).toHaveLength(1);
    await repository.askEventQuestion({ id: 'budi', fullName: 'Budi' }, eventId, 'Berapa anggota maksimal tim?');
    // Satu kabar per kegiatan, diperbarui — bukan satu per pertanyaan.
    expect((await repository.listNotifications('org', 50)).filter((n) => n.type === 'QUESTION_ASKED')).toHaveLength(1);

    const [, first] = await repository.listEventQuestions(eventId, null, 50);
    expect(await reason(repository.answerEventQuestion(actor('budi'), first!.id, 'Boleh, saya jamin.'))).toBe('question_forbidden');
    expect(await reason(repository.answerEventQuestion(actor('org'), first!.id, 'x'))).toBe('invalid_answer');
    await repository.answerEventQuestion(actor('org'), first!.id, 'Boleh, maksimal tiga orang.');
    const [, answered] = await repository.listEventQuestions(eventId, null, 50);
    expect(answered).toMatchObject({ answer: 'Boleh, maksimal tiga orang.', answeredAs: 'organizer' });
    expect((await repository.listNotifications('sinta', 50)).map((n) => n.type)).toContain('QUESTION_ANSWERED');

    const [latest] = await repository.listEventQuestions(eventId, null, 50);
    await repository.answerEventQuestion(actor('admin', true), latest!.id, 'Lihat buku panduan bagian 3.');
    expect((await repository.listEventQuestions(eventId, null, 50))[0]!.answeredAs).toBe('moderator');
  });

  it('hapus hanya oleh penanya; laporan & sembunyikan oleh admin tercatat; hapus akun ikut menghapus', async () => {
    await repository.askEventQuestion({ id: 'sinta', fullName: 'Sinta' }, eventId, 'Apakah boleh tim lintas kampus?');
    await repository.askEventQuestion({ id: 'budi', fullName: 'Budi' }, eventId, 'Iklan: jasa joki lomba murah!');
    const [spam, mine] = await repository.listEventQuestions(eventId, null, 50);

    expect(await reason(repository.deleteEventQuestion('budi', mine!.id))).toBe('question_not_found');
    expect(await reason(repository.reportContent('budi', { subjectType: 'question', subjectId: spam!.id, reason: 'spam', details: null }))).toBe(
      'report_unavailable',
    );
    await repository.reportContent('sinta', { subjectType: 'question', subjectId: spam!.id, reason: 'spam', details: null });
    expect((await repository.listOpenReports(10))[0]).toMatchObject({ subjectType: 'question', subjectLabel: 'Iklan: jasa joki lomba murah!' });
    expect(await repository.getEventQuestionContext(spam!.id)).toMatchObject({ excerpt: 'Iklan: jasa joki lomba murah!' });

    await repository.hideEventQuestion({ questionId: spam!.id, actorId: 'admin', actorName: 'Admin', reason: 'Spam' });
    expect((await repository.listMyEventQuestions('budi')).map((q) => q.hidden)).toEqual([true]);
    expect((await repository.listEventQuestions(eventId, null, 50)).map((q) => q.id)).toEqual([mine!.id]);
    expect(await repository.getEventQuestionContext(spam!.id)).toBeNull();
    expect((await repository.listModerationLog(1))[0]).toMatchObject({ subjectType: 'question', toStatus: 'REJECTED', reason: 'Spam' });
    expect(await reason(repository.hideEventQuestion({ questionId: spam!.id, actorId: 'admin', reason: null }))).toBe('question_not_found');

    await repository.deleteEventQuestion('sinta', mine!.id);
    expect(await repository.listEventQuestions(eventId, null, 50)).toEqual([]);
  });
});
